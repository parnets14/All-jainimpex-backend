import Product from '../../models/Product.js';
import Category from '../../models/Category.js';
import Brand from '../../models/Brand.js';
import Dealer from '../../models/Dealer.js';
import DiscountMapping from '../../models/DiscountMapping.js';
import DealerPricing from '../../models/DealerPricing.js';
import StockMovement from '../../models/Stock.js';
import GRN from '../../models/GRN.js';
import StockMovementService from '../../services/stockMovementService.js';

// @desc    Get products for dealer (with dealer-specific pricing)
// @route   GET /api/app/products
// @access  Private (Dealer)
export const getProductsForDealer = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      category,
      subcategory,
      brand,
      status
    } = req.query;

    // Get dealer info for pricing (dealers are identified by username matching dealer code)
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }

    const filter = { status: 'active' };

    // Search filter
    if (search) {
      filter.$or = [
        { productCode: { $regex: search, $options: 'i' } },
        { itemName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Category filter
    if (category) {
      filter.category = category;
    }

    // Subcategory filter
    if (subcategory) {
      filter.subcategory = subcategory;
    }

    // Brand filter
    if (brand) {
      filter.brand = brand;
    }

    // Status filter
    if (status) {
      filter.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const products = await Product.find(filter)
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('brand', 'name')
      .limit(parseInt(limit))
      .skip(skip)
      .sort({ createdAt: -1 });

    const total = await Product.countDocuments(filter);

        // Get dealer-specific pricing from DealerPricing model
    const productsWithPricing = await Promise.all(
      products.map(async (product) => {
        // Get pricing from DealerPricing model
        const dealerPricing = await DealerPricing.findOne({ 
          product: product._id, 
          isActive: true 
        });

        // Fallback to rateSlabs if DealerPricing doesn't exist
        let mrp = 0;
        let dealerPrice = 0;

        if (dealerPricing) {
          // Use DealerPricing model data
          mrp = dealerPricing.mrp || dealerPricing.sellingPrice;
          dealerPrice = dealerPricing.sellingPrice;
        } else {
          // Fallback to rateSlabs (legacy)
          mrp = product.rateSlabs && product.rateSlabs.length > 0
            ? product.rateSlabs[0].rate
            : product.totalAmount || 0;
          dealerPrice = mrp;
        }

        // Get dealer-specific discount based on brand/category/subcategory
        const discountMappings = await DiscountMapping.find({
          mappingType: 'sales',
          status: 'Approved',
          brand: product.brand?._id || product.brand,
          category: product.category?._id || product.category,
          subcategory: product.subcategory?._id || product.subcategory,
          validFrom: { $lte: new Date() },
          validTo: { $gte: new Date() }
        });

        // Calculate maximum discount percentage from all applicable discounts
        let maxDiscountPercentage = 0;
        let appliedDiscount = null;

        if (discountMappings.length > 0) {
          // Find the highest discount from all levels
          discountMappings.forEach(discount => {
            discount.levels.forEach(level => {
              if (level.discountPercentage > maxDiscountPercentage) {
                maxDiscountPercentage = level.discountPercentage;
                appliedDiscount = {
                  discountId: discount._id,
                  discountPercentage: level.discountPercentage,
                  level: level.level || 'Direct',
                  validFrom: discount.validFrom,
                  validTo: discount.validTo
                };
              }
            });
          });

          // Apply discount to dealer price
          if (maxDiscountPercentage > 0) {
            dealerPrice = dealerPrice * (1 - maxDiscountPercentage / 100);
          }
        }

        // Calculate total available stock across all warehouses
        // Use a more efficient approach: Get all GRNs for this product and calculate net stock
        let totalAvailableStock = 0;
        try {
          // Get all warehouses that have this product (from GRNs)
          const grnQuery = { 'items.productId': product._id };
          const grns = await GRN.find(grnQuery).select('warehouseId items').lean();

          // Group by warehouse
          const warehouseStock = {};
          
          grns.forEach(grn => {
            if (!grn.warehouseId) return;
            
            const warehouseId = grn.warehouseId.toString();
            
            if (!warehouseStock[warehouseId]) {
              warehouseStock[warehouseId] = {
                totalQty: 0,
                damagedQty: 0
              };
            }
            
            grn.items.forEach(item => {
              const itemProductId = item.productId?._id ? item.productId._id.toString() : item.productId.toString();
              if (itemProductId === product._id.toString()) {
                warehouseStock[warehouseId].totalQty += item.acceptedQuantity || 0;
                warehouseStock[warehouseId].damagedQty += item.damageQuantity || 0;
              }
            });
          });

          // Calculate net stock for each warehouse using StockMovements
          const warehouseIds = Object.keys(warehouseStock);
          
          // Get all stock movements for this product in one query
          const allMovements = await StockMovement.find({
            productId: product._id,
            warehouseId: { $in: warehouseIds }
          }).lean();

          // Group movements by warehouse
          const movementsByWarehouse = {};
          allMovements.forEach(movement => {
            const whId = movement.warehouseId.toString();
            if (!movementsByWarehouse[whId]) {
              movementsByWarehouse[whId] = [];
            }
            movementsByWarehouse[whId].push(movement);
          });

          // Calculate net stock for each warehouse
          for (const warehouseId of warehouseIds) {
            try {
              // Get latest balance from movements
              const movements = movementsByWarehouse[warehouseId] || [];
              let currentStock = 0;
              
              if (movements.length > 0) {
                // Sort by date descending to get latest
                const sortedMovements = movements.sort((a, b) => {
                  const dateA = new Date(a.date || a.createdAt);
                  const dateB = new Date(b.date || b.createdAt);
                  return dateB - dateA;
                });
                currentStock = sortedMovements[0]?.balance || 0;
              } else {
                // Fallback to GRN total if no movements
                currentStock = warehouseStock[warehouseId].totalQty;
              }
              
              // Calculate blocked stock from movements
              const blockedMovements = movements.filter(m => 
                m.type === 'OUT' && m.referenceType === 'SALE'
              );
              
              const unblockedMovements = movements.filter(m => 
                m.type === 'IN' && m.referenceType === 'SALE' && 
                m.remarks && m.remarks.includes('Stock Unblocked')
              );
              
              let blockedQty = 0;
              blockedMovements.forEach(movement => {
                blockedQty += movement.quantity || 0;
              });
              
              unblockedMovements.forEach(movement => {
                blockedQty -= movement.quantity || 0;
              });
              
              blockedQty = Math.max(0, blockedQty);
              
              // Calculate net stock
              const netStock = currentStock - warehouseStock[warehouseId].damagedQty - blockedQty;
              
              // Only add positive net stock
              if (netStock > 0) {
                totalAvailableStock += netStock;
              }
            } catch (error) {
              console.error(`Error calculating stock for warehouse ${warehouseId} for product ${product.productCode}:`, error.message);
              // Fallback: use GRN calculation
              const netStock = warehouseStock[warehouseId].totalQty - warehouseStock[warehouseId].damagedQty;
              if (netStock > 0) {
                totalAvailableStock += netStock;
              }
            }
          }
          
          // Debug logging
          if (totalAvailableStock > 0) {
            console.log(`✅ Stock calculated for ${product.productCode}: ${totalAvailableStock} units across ${warehouseIds.length} warehouses`);
          }
        } catch (error) {
          console.error(`❌ Error calculating stock for product ${product.productCode || product._id}:`, error.message);
          console.error('Stack:', error.stack);
          totalAvailableStock = 0;
        }

        return {
          ...product.toObject(),
          mrp: Math.round(mrp * 100) / 100,
          dealerPrice: Math.round(dealerPrice * 100) / 100,
          purchasePrice: dealerPricing?.purchasePrice || 0,
          hasOffer: maxDiscountPercentage > 0,
          discountPercentage: maxDiscountPercentage,
          discount: appliedDiscount,
          originalDealerPrice: Math.round((dealerPricing?.sellingPrice || mrp) * 100) / 100,
          availableStock: Math.max(0, Math.round(totalAvailableStock)),
          isOutOfStock: totalAvailableStock <= 0
        };
      })
    );

    // Log sample product with stock for debugging
    if (productsWithPricing.length > 0) {
      const sampleProduct = productsWithPricing[0];
      console.log('📦 Sample product response:', {
        productCode: sampleProduct.productCode,
        itemName: sampleProduct.itemName,
        availableStock: sampleProduct.availableStock,
        isOutOfStock: sampleProduct.isOutOfStock
      });
    }

    res.json({
      success: true,
      products: productsWithPricing,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalProducts: total,
        hasNext: skip + products.length < total,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error getting products for dealer:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching products',
      error: error.message
    });
  }
};

// @desc    Get product details for dealer
// @route   GET /api/app/products/:id
// @access  Private (Dealer)
export const getProductDetailsForDealer = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('brand', 'name');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Get dealer info for pricing (dealers are identified by username matching dealer code)
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }

    // Get pricing from DealerPricing model
    const dealerPricing = await DealerPricing.findOne({ 
      product: product._id, 
      isActive: true 
    });

    // Fallback to rateSlabs if DealerPricing doesn't exist
    let mrp = 0;
    let dealerPrice = 0;

    if (dealerPricing) {
      mrp = dealerPricing.mrp || dealerPricing.sellingPrice;
      dealerPrice = dealerPricing.sellingPrice;
    } else {
      mrp = product.rateSlabs && product.rateSlabs.length > 0
        ? product.rateSlabs[0].rate
        : product.totalAmount || 0;
      dealerPrice = mrp;
    }

    // Get dealer-specific discount based on brand/category/subcategory
    const discountMappings = await DiscountMapping.find({
      mappingType: 'sales',
      status: 'Approved',
      brand: product.brand?._id || product.brand,
      category: product.category?._id || product.category,
      subcategory: product.subcategory?._id || product.subcategory,
      validFrom: { $lte: new Date() },
      validTo: { $gte: new Date() }
    });

    // Calculate maximum discount percentage from all applicable discounts
    let maxDiscountPercentage = 0;
    let appliedDiscount = null;

    if (discountMappings.length > 0) {
      // Find the highest discount from all levels
      discountMappings.forEach(discount => {
        discount.levels.forEach(level => {
          if (level.discountPercentage > maxDiscountPercentage) {
            maxDiscountPercentage = level.discountPercentage;
            appliedDiscount = {
              discountId: discount._id,
              discountPercentage: level.discountPercentage,
              level: level.level || 'Direct',
              validFrom: discount.validFrom,
              validTo: discount.validTo,
              remarks: discount.remarks
            };
          }
        });
      });

      // Apply discount to dealer price
      if (maxDiscountPercentage > 0) {
        dealerPrice = dealerPrice * (1 - maxDiscountPercentage / 100);
      }
    }

    // Calculate total available stock across all warehouses
    let totalAvailableStock = 0;
    try {
      const grnQuery = { 'items.productId': product._id };
      const grns = await GRN.find(grnQuery).select('warehouseId items');

      const warehouseStock = {};
      
      grns.forEach(grn => {
        if (!grn.warehouseId) return;
        
        const warehouseId = grn.warehouseId.toString();
        
        if (!warehouseStock[warehouseId]) {
          warehouseStock[warehouseId] = {
            totalQty: 0,
            damagedQty: 0
          };
        }
        
        grn.items.forEach(item => {
          const itemProductId = item.productId?._id ? item.productId._id.toString() : item.productId.toString();
          if (itemProductId === product._id.toString()) {
            warehouseStock[warehouseId].totalQty += item.acceptedQuantity || 0;
            warehouseStock[warehouseId].damagedQty += item.damageQuantity || 0;
          }
        });
      });

      for (const warehouseId of Object.keys(warehouseStock)) {
        try {
          const currentStock = await StockMovementService.getCurrentStock(product._id, warehouseId);
          
          const blockedMovements = await StockMovement.find({
            productId: product._id,
            warehouseId: warehouseId,
            type: 'OUT',
            referenceType: 'SALE'
          });
          
          const unblockedMovements = await StockMovement.find({
            productId: product._id,
            warehouseId: warehouseId,
            type: 'IN',
            referenceType: 'SALE',
            remarks: { $regex: /Stock Unblocked/ }
          });
          
          let blockedQty = 0;
          blockedMovements.forEach(movement => {
            blockedQty += movement.quantity;
          });
          
          unblockedMovements.forEach(movement => {
            blockedQty -= movement.quantity;
          });
          
          blockedQty = Math.max(0, blockedQty);
          
          const currentStockValue = currentStock !== undefined ? currentStock : warehouseStock[warehouseId].totalQty;
          const netStock = currentStockValue - warehouseStock[warehouseId].damagedQty - blockedQty;
          
          totalAvailableStock += Math.max(0, netStock);
        } catch (error) {
          const netStock = warehouseStock[warehouseId].totalQty - warehouseStock[warehouseId].damagedQty;
          totalAvailableStock += Math.max(0, netStock);
        }
      }
    } catch (error) {
      console.error(`Error calculating stock for product ${product._id}:`, error);
      totalAvailableStock = 0;
    }

    res.json({
      success: true,
      product: {
        ...product.toObject(),
        mrp: Math.round(mrp * 100) / 100,
        dealerPrice: Math.round(dealerPrice * 100) / 100,
        purchasePrice: dealerPricing?.purchasePrice || 0,
        hasOffer: maxDiscountPercentage > 0,
        discountPercentage: maxDiscountPercentage,
        discount: appliedDiscount,
        originalDealerPrice: Math.round((dealerPricing?.sellingPrice || mrp) * 100) / 100,
        availableStock: Math.max(0, Math.round(totalAvailableStock)),
        isOutOfStock: totalAvailableStock <= 0
      }
    });
  } catch (error) {
    console.error('Error getting product details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching product details',
      error: error.message
    });
  }
};

// @desc    Get products by category for dealer
// @route   GET /api/app/products/category/:categoryId
// @access  Private (Dealer)
export const getProductsByCategoryForDealer = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const products = await Product.find({
      category: categoryId,
      status: 'active'
    })
      .populate('category', 'name')
      .populate('brand', 'name')
      .limit(parseInt(limit))
      .skip(skip)
      .sort({ createdAt: -1 });

    const total = await Product.countDocuments({
      category: categoryId,
      status: 'active'
    });

    res.json({
      success: true,
      products,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalProducts: total
      }
    });
  } catch (error) {
    console.error('Error getting products by category:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching products',
      error: error.message
    });
  }
};

// @desc    Get products by brand for dealer
// @route   GET /api/app/products/brand/:brandId
// @access  Private (Dealer)
export const getProductsByBrandForDealer = async (req, res) => {
  try {
    const { brandId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const products = await Product.find({
      brand: brandId,
      status: 'active'
    })
      .populate('category', 'name')
      .populate('brand', 'name')
      .limit(parseInt(limit))
      .skip(skip)
      .sort({ createdAt: -1 });

    const total = await Product.countDocuments({
      brand: brandId,
      status: 'active'
    });

    res.json({
      success: true,
      products,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalProducts: total
      }
    });
  } catch (error) {
    console.error('Error getting products by brand:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching products',
      error: error.message
    });
  }
};

