import Dealer from '../../models/Dealer.js';
import Product from '../../models/Product.js';
import DealerPricing from '../../models/DealerPricing.js';
import SalesOrder from '../../models/SalesOrder.js';
import DealerInvoice from '../../models/DealerInvoice.js';
import StockMovement from '../../models/Stock.js';
import StockMovementService from '../../services/stockMovementService.js';

// Get dealers assigned to sales executive
export const getDealers = async (req, res) => {
  try {
    const user = req.user;

    console.log('📋 Fetching dealers for sales executive:', {
      name: user.name,
      role: user.role,
      assignedRegions: user.assignedRegions,
    });

    // Build query for dealers in assigned regions
    let query = { isActive: true };
    
    if (user.assignedRegions && user.assignedRegions.length > 0) {
      query.regionId = { $in: user.assignedRegions };
    }

    // Fetch dealers with credit information
    const dealers = await Dealer.find(query)
      .select('name code contactPerson phone email address dealerType regionId creditLimit creditDays')
      .sort({ name: 1 })
      .lean();

    // Calculate outstanding amount for each dealer
    const dealersWithOutstanding = await Promise.all(
      dealers.map(async (dealer) => {
        try {
          // Get unpaid invoices
          const invoices = await DealerInvoice.find({
            dealer: dealer._id,
            paymentStatus: { $ne: 'Paid' }
          }).select('totalAmount paidAmount');

          const outstandingAmount = invoices.reduce((sum, inv) => {
            return sum + (inv.totalAmount - (inv.paidAmount || 0));
          }, 0);

          const availableCredit = dealer.creditLimit - outstandingAmount;

          return {
            ...dealer,
            outstandingAmount: Math.max(0, outstandingAmount),
            availableCredit: Math.max(0, availableCredit),
            creditStatus: outstandingAmount > dealer.creditLimit ? 'exceeded' : 'available'
          };
        } catch (error) {
          console.error(`Error calculating outstanding for dealer ${dealer._id}:`, error);
          return {
            ...dealer,
            outstandingAmount: 0,
            availableCredit: dealer.creditLimit,
            creditStatus: 'available'
          };
        }
      })
    );

    console.log(`✅ Found ${dealersWithOutstanding.length} dealers`);

    res.json({
      success: true,
      dealers: dealersWithOutstanding,
      count: dealersWithOutstanding.length,
    });
  } catch (error) {
    console.error('Get dealers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dealers',
      error: error.message,
    });
  }
};

// Get products with pricing and stock
export const getProducts = async (req, res) => {
  try {
    const { dealerId, search, category, brand, warehouseId, page = 1, limit = 100 } = req.query;

    console.log('📦 Fetching products:', { dealerId, search, category, brand, warehouseId });

    // Build base query
    let query = { status: 'active' };
    
    // CRITICAL FIX: Apply dealer product permissions
    if (dealerId) {
      console.log('🔍 Applying dealer product permissions for dealer:', dealerId);
      
      try {
        const dealer = await Dealer.findById(dealerId)
          .select('allowedBrands allowedCategories allowedSubcategories allowedExtendedSubcategories');
        
        if (dealer) {
          console.log('📊 Dealer permissions:', {
            brands: dealer.allowedBrands?.length || 0,
            categories: dealer.allowedCategories?.length || 0,
            subcategories: dealer.allowedSubcategories?.length || 0,
            extendedSubcategories: dealer.allowedExtendedSubcategories?.length || 0
          });
          
          // Apply brand filter
          if (dealer.allowedBrands && dealer.allowedBrands.length > 0) {
            query.brand = { $in: dealer.allowedBrands };
          }
          
          // Apply category filter
          if (dealer.allowedCategories && dealer.allowedCategories.length > 0) {
            query.category = { $in: dealer.allowedCategories };
          }
          
          // Apply subcategory filter
          if (dealer.allowedSubcategories && dealer.allowedSubcategories.length > 0) {
            query.subcategory = { $in: dealer.allowedSubcategories };
          }
          
          // FIXED LOGIC: Handle extended subcategories properly
          if (dealer.allowedExtendedSubcategories && dealer.allowedExtendedSubcategories.length > 0) {
            // FIXED: Show BOTH products with allowed extended subcategories AND products with no extended subcategories
            // This allows dealers to access both extended products and basic hierarchy products
            query.$or = [
              { subcategory1: { $in: dealer.allowedExtendedSubcategories } }, // Products with allowed extended subcategories
              { subcategory1: { $exists: false } },                          // Products with no extended subcategory
              { subcategory1: null }                                         // Products with null extended subcategory
            ];
            console.log('🔍 SE App: Applied extended subcategory filter (OR logic): allowed extended IDs + basic hierarchy products');
          } else {
            // If dealer has NO extended subcategory permissions, show products with NO extended subcategories
            // This allows access to basic products that only have Brand → Category → Subcategory
            query.$or = [
              { subcategory1: { $exists: false } },
              { subcategory1: null }
            ];
            console.log('🔍 SE App: No extended subcategories allowed - showing products with NO extended subcategories');
          }
          
          console.log('🎯 Applied dealer filter:', JSON.stringify(query, null, 2));
        } else {
          console.log('❌ Dealer not found, showing no products');
          // If dealer not found, return empty results
          return res.json({
            success: true,
            products: [],
            pagination: {
              currentPage: parseInt(page),
              totalPages: 0,
              totalProducts: 0,
              hasNext: false,
              hasPrev: false
            }
          });
        }
      } catch (dealerError) {
        console.error('❌ Error fetching dealer permissions:', dealerError);
        // Continue without dealer filtering if there's an error
      }
    }
    
    // Apply additional filters
    if (search) {
      // Merge with existing $or if it exists (from dealer filtering)
      const searchOr = [
        { itemName: { $regex: search, $options: 'i' } },
        { productCode: { $regex: search, $options: 'i' } }
      ];
      
      if (query.$or) {
        // If $or already exists from dealer filtering, we need to combine them with $and
        query = {
          $and: [
            { $or: query.$or }, // Dealer extended subcategory filter
            { $or: searchOr },  // Search filter
            ...Object.keys(query).filter(key => key !== '$or').map(key => ({ [key]: query[key] }))
          ]
        };
      } else {
        query.$or = searchOr;
      }
    }
    
    if (category) {
      query.category = category;
    }
    
    if (brand) {
      query.brand = brand;
    }

    console.log('🔍 Final product query:', JSON.stringify(query, null, 2));

    // Fetch products with pagination
    const skip = (page - 1) * limit;
    const products = await Product.find(query)
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .select('productCode itemName HSNCode description unit gst brand category subcategory minStockLevel rateSlabs images')
      .sort({ itemName: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    console.log(`✅ Found ${products.length} products matching dealer permissions`);

    // Get pricing and stock for each product
    const productsWithDetails = await Promise.all(
      products.map(async (product) => {
        try {
          // Get dealer pricing
          const pricing = await DealerPricing.findOne({
            product: product._id,
            isActive: true
          }).select('sellingPrice purchasePrice');

          // Get stock using StockMovementService (same as CRM)
          const Warehouse = (await import('../../models/Warehouse.js')).default;
          
          // Get all warehouses that have stock for this product
          const stockMovements = await StockMovement.find({
            productId: product._id
          }).distinct('warehouseId');

          const warehouseStock = [];
          let totalStock = 0;

          for (const whId of stockMovements) {
            // Skip if warehouse filter is applied and doesn't match
            if (warehouseId && whId.toString() !== warehouseId) {
              continue;
            }

            // Get warehouse details (don't filter by isActive - match web CRM behavior)
            const warehouse = await Warehouse.findById(whId).select('name');
            if (!warehouse) continue;

            // Get current stock from StockMovementService
            const currentStock = await StockMovementService.getCurrentStock(product._id, whId);
            
            // Calculate damaged stock from GRN items (same as web CRM)
            const GRN = (await import('../../models/GRN.js')).default;
            const grns = await GRN.find({
              'items.productId': product._id,
              warehouseId: whId
            });
            
            let damagedQty = 0;
            grns.forEach(grn => {
              if (grn.items && Array.isArray(grn.items)) {
                grn.items.forEach(item => {
                  const itemProductId = item.productId?._id ? item.productId._id.toString() : item.productId.toString();
                  if (itemProductId === product._id.toString()) {
                    damagedQty += item.damageQuantity || 0;
                  }
                });
              }
            });
            
            // Calculate blocked stock (OUT movements with referenceType 'SALE')
            // Only count movements with "Stock Blocked" remark
            const blockedMovements = await StockMovement.find({
              productId: product._id,
              warehouseId: whId,
              type: 'OUT',
              referenceType: 'SALE',
              remarks: { $regex: /Stock Blocked/ }
            });
            
            const unblockedMovements = await StockMovement.find({
              productId: product._id,
              warehouseId: whId,
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

            // Calculate net stock: current - damaged - blocked (match web CRM)
            const netStock = currentStock - damagedQty - blockedQty;

            if (netStock > 0 || !warehouseId) {
              warehouseStock.push({
                warehouseId: whId.toString(),
                warehouseName: warehouse.name,
                quantity: currentStock,
                damaged: damagedQty,
                blocked: blockedQty,
                net: netStock
              });
              
              totalStock += netStock;
            }
          }

          const availableStock = warehouseId 
            ? (warehouseStock.find(w => w.warehouseId === warehouseId)?.net || 0)
            : totalStock;

          // Determine stock status
          const isOutOfStock = availableStock <= 0;
          const isLowStock = !isOutOfStock && product.minStockLevel && availableStock <= product.minStockLevel;

          return {
            _id: product._id,
            productCode: product.productCode,
            itemName: product.itemName,
            HSNCode: product.HSNCode,
            description: product.description,
            unit: product.unit,
            gst: product.gst,
            brandName: product.brand?.name || 'N/A',
            brandId: product.brand?._id,
            categoryName: product.category?.name || 'N/A',
            categoryId: product.category?._id,
            subcategoryName: product.subcategory?.name || 'N/A',
            subcategoryId: product.subcategory?._id,
            dealerPrice: pricing?.sellingPrice || (product.rateSlabs?.[0]?.rate || 0),
            basePrice: product.rateSlabs?.[0]?.rate || 0,
            images: product.images || [],
            availableStock: availableStock,
            warehouseStock: warehouseStock,
            totalStock: totalStock,
            isOutOfStock,
            isLowStock,
            minStockLevel: product.minStockLevel
          };
        } catch (error) {
          console.error(`Error getting details for product ${product._id}:`, error);
          return {
            _id: product._id,
            productCode: product.productCode,
            itemName: product.itemName,
            HSNCode: product.HSNCode,
            brandName: product.brand?.name || 'N/A',
            categoryName: product.category?.name || 'N/A',
            subcategoryName: product.subcategory?.name || 'N/A',
            dealerPrice: product.rateSlabs?.[0]?.rate || 0,
            basePrice: product.rateSlabs?.[0]?.rate || 0,
            images: product.images || [],
            availableStock: 0,
            warehouseStock: [],
            totalStock: 0,
            isOutOfStock: true,
            isLowStock: false
          };
        }
      })
    );

    // Get total count for pagination
    const total = await Product.countDocuments(query);

    console.log(`✅ Found ${productsWithDetails.length} products`);

    res.json({
      success: true,
      products: productsWithDetails,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message,
    });
  }
};

// Create sales order
export const createSalesOrder = async (req, res) => {
  try {
    const user = req.user;
    const { dealerId, products, customerNotes, orderDate, deliveryDate } = req.body;

    console.log('📝 Creating sales order:', {
      dealerId,
      productsCount: products?.length,
      salesExecutive: user.name
    });

    // Validate input
    if (!dealerId || !products || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Dealer and products are required'
      });
    }

    // Get dealer details
    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }

    // Validate stock availability for each product
    for (const item of products) {
      // Get current stock from StockMovementService
      const currentStock = await StockMovementService.getCurrentStock(item.productId, item.warehouseId);
      
      // Calculate damaged stock from GRN items (same as web CRM)
      const GRN = (await import('../../models/GRN.js')).default;
      const grns = await GRN.find({
        'items.productId': item.productId,
        warehouseId: item.warehouseId
      });
      
      let damagedQty = 0;
      grns.forEach(grn => {
        if (grn.items && Array.isArray(grn.items)) {
          grn.items.forEach(grnItem => {
            const itemProductId = grnItem.productId?._id ? grnItem.productId._id.toString() : grnItem.productId.toString();
            if (itemProductId === item.productId.toString()) {
              damagedQty += grnItem.damageQuantity || 0;
            }
          });
        }
      });
      
      // Calculate blocked stock - only count movements with "Stock Blocked" remark
      const blockedMovements = await StockMovement.find({
        productId: item.productId,
        warehouseId: item.warehouseId,
        type: 'OUT',
        referenceType: 'SALE',
        remarks: { $regex: /Stock Blocked/ }
      });
      
      const unblockedMovements = await StockMovement.find({
        productId: item.productId,
        warehouseId: item.warehouseId,
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
      
      // Calculate net stock: current - damaged - blocked (match web CRM)
      const netStock = currentStock - damagedQty - blockedQty;

      if (item.quantity > netStock) {
        const product = await Product.findById(item.productId).select('itemName');
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.itemName}. Available: ${netStock}, Requested: ${item.quantity}`
        });
      }
    }

    // Prepare order products with pricing and calculate totals
    let grossAmount = 0;
    let totalGst = 0;

    const orderProducts = await Promise.all(
      products.map(async (item) => {
        const product = await Product.findById(item.productId)
          .populate('brand category subcategory')
          .lean();

        // Get dealer pricing
        const pricing = await DealerPricing.findOne({
          product: item.productId,
          isActive: true
        });

        const unitPrice = pricing?.sellingPrice || product.rateSlabs?.[0]?.rate || 0;
        const itemTotal = item.quantity * unitPrice;
        const gstAmount = (itemTotal * product.gst) / 100;
        const totalPrice = itemTotal + gstAmount;

        grossAmount += itemTotal;
        totalGst += gstAmount;

        return {
          product: item.productId,
          productCode: product.productCode,
          productName: product.itemName,
          HSNCode: product.HSNCode,
          quantity: item.quantity,
          unitPrice,
          gst: product.gst,
          gstAmount,
          totalPrice,
          warehouse: item.warehouseId,
          warehouseName: item.warehouseName || 'Main Warehouse'
        };
      })
    );

    const totalAmount = grossAmount + totalGst;

    // Generate order number
    const generateOrderNumber = async () => {
      const currentYear = new Date().getFullYear();
      const prefix = `SO-${currentYear}-`;
      
      const lastOrder = await SalesOrder.findOne({
        orderNumber: { $regex: `^${prefix}` }
      }).sort({ orderNumber: -1 });
      
      let nextNumber = 1;
      if (lastOrder) {
        const lastNumber = parseInt(lastOrder.orderNumber.split('-')[2]);
        nextNumber = lastNumber + 1;
      }
      
      return `${prefix}${nextNumber.toString().padStart(4, '0')}`;
    };

    const orderNumber = await generateOrderNumber();

    // Determine order type based on dealer type
    let orderType = 'Independent Sales Order';
    if (dealer.dealerType === 'Wholesale') {
      orderType = 'Wholesale Sales Order';
    } else if (dealer.dealerType === 'Retail') {
      orderType = 'Retail Sales Order';
    }

    // Calculate due date
    const dueDate = new Date(orderDate || new Date());
    dueDate.setDate(dueDate.getDate() + (dealer.creditDays || 30));

    // Create sales order
    const salesOrder = new SalesOrder({
      orderNumber,
      dealer: dealerId,
      dealerName: dealer.name,
      dealerCode: dealer.code,
      dealerType: dealer.dealerType,
      region: dealer.regionId,
      products: orderProducts,
      orderDate: orderDate || new Date(),
      deliveryDate,
      creditDays: dealer.creditDays || 30,
      dueDate,
      grossAmount,
      totalGst,
      discountAmount: 0,
      totalAmount,
      status: 'Pending',
      type: orderType,
      remarks: customerNotes,
      createdBy: user._id
    });

    await salesOrder.save();

    console.log(`✅ Sales order created: ${salesOrder.orderNumber}`);

    res.status(201).json({
      success: true,
      message: 'Sales order created successfully',
      order: {
        _id: salesOrder._id,
        orderNumber: salesOrder.orderNumber,
        status: salesOrder.status,
        totalAmount: salesOrder.totalAmount
      }
    });
  } catch (error) {
    console.error('Create sales order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create sales order',
      error: error.message,
    });
  }
};

// Get my sales orders
export const getMySalesOrders = async (req, res) => {
  try {
    const user = req.user;
    const { status, page = 1, limit = 20 } = req.query;

    console.log('📋 Fetching orders for sales executive:', user.name);

    // Build query
    let query = { createdBy: user._id };
    
    if (status && status !== 'all') {
      query.status = status;
    }

    // Fetch orders with pagination
    const skip = (page - 1) * limit;
    const orders = await SalesOrder.find(query)
      .populate('dealer', 'name code')
      .select('orderNumber dealer orderDate totalAmount status type')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count
    const total = await SalesOrder.countDocuments(query);

    console.log(`✅ Found ${orders.length} orders`);

    res.json({
      success: true,
      orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get my orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message,
    });
  }
};

// Get sales order by ID
export const getSalesOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    console.log('📄 Fetching order details:', id);

    const order = await SalesOrder.findById(id)
      .populate('dealer', 'name code contactPerson phone email address creditLimit creditDays')
      .populate('products.product', 'itemName productCode HSNCode')
      .populate('products.warehouse', 'name')
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user has access to this order
    if (order.createdBy._id.toString() !== user._id.toString() && user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this order'
      });
    }

    console.log(`✅ Order found: ${order.orderNumber}`);

    res.json({
      success: true,
      order
    });
  } catch (error) {
    console.error('Get order by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order details',
      error: error.message,
    });
  }
};

// Calculate discounts and points for order
export const calculateOrderDiscounts = async (req, res) => {
  try {
    const { dealerId, products } = req.body;

    console.log('💰 Calculating discounts and points:', {
      dealerId,
      productsCount: products?.length
    });

    if (!products || !Array.isArray(products)) {
      return res.status(400).json({
        success: false,
        message: 'Products array is required'
      });
    }

    const Product = (await import('../../models/Product.js')).default;
    const DiscountMapping = (await import('../../models/DiscountMapping.js')).default;
    const Points = (await import('../../models/Points.js')).default;

    const processedItems = [];
    let totalPoints = 0;
    let totalDiscount = 0;

    for (const item of products) {
      const product = await Product.findById(item.productId)
        .populate('brand', 'name')
        .populate('category', 'name')
        .populate('subcategory', 'name');

      if (!product) {
        continue;
      }

      // Find applicable sales discounts
      const discounts = await DiscountMapping.find({
        mappingType: 'sales',
        status: 'Approved',
        brand: product.brand._id,
        category: product.category._id,
        subcategory: product.subcategory._id,
        validFrom: { $lte: new Date() },
        validTo: { $gte: new Date() }
      }).populate('brand category subcategory', 'name');

      // Calculate discount
      let discountPercentage = 0;
      let appliedDiscounts = [];

      if (discounts.length > 0) {
        // Use the highest discount percentage
        const maxDiscount = discounts.reduce((max, discount) => {
          const maxLevelDiscount = Math.max(...discount.levels.map(level => level.discountPercentage));
          return maxLevelDiscount > max ? maxLevelDiscount : max;
        }, 0);

        discountPercentage = maxDiscount;
        
        appliedDiscounts = discounts.map(discount => ({
          name: `${discount.brand.name} - ${discount.category.name}`,
          percentage: maxDiscount
        }));
      }

      // Find applicable sale points
      const pointSchemes = await Points.find({
        type: 'sale',
        brand: product.brand._id,
        category: product.category._id,
        subcategory: product.subcategory._id,
        validFrom: { $lte: new Date() },
        validTo: { $gte: new Date() }
      });

      let pointsEarned = 0;
      let pointScheme = null;

      if (pointSchemes.length > 0) {
        const scheme = pointSchemes[0];
        const itemTotal = item.quantity * item.unitPrice;
        const amountAfterDiscount = itemTotal * (1 - discountPercentage / 100);

        if (scheme.calculationType === 'amount' && scheme.inputValue > 0) {
          pointsEarned = Math.floor(amountAfterDiscount / scheme.inputValue) * scheme.points;
        } else if (scheme.calculationType === 'units' && scheme.inputValue > 0) {
          pointsEarned = Math.floor(item.quantity / scheme.inputValue) * scheme.points;
        }

        if (pointsEarned > 0) {
          pointScheme = {
            type: scheme.calculationType,
            threshold: scheme.inputValue,
            pointsPerThreshold: scheme.points,
            description: scheme.description || `Earn ${scheme.points} points per ${scheme.inputValue} ${scheme.calculationType === 'amount' ? '₹' : 'units'}`
          };
        }
      }

      const itemTotal = item.quantity * item.unitPrice;
      const discountAmount = (itemTotal * discountPercentage) / 100;

      processedItems.push({
        productId: item.productId,
        productName: product.itemName,
        productCode: product.productCode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        gst: product.gst,
        discountPercentage,
        discountAmount,
        appliedDiscounts,
        pointsEarned,
        pointScheme
      });

      totalPoints += pointsEarned;
      totalDiscount += discountAmount;
    }

    console.log(`✅ Calculated: ${totalDiscount.toFixed(2)} discount, ${totalPoints} points`);

    res.json({
      success: true,
      items: processedItems,
      summary: {
        totalDiscount,
        totalPoints
      }
    });
  } catch (error) {
    console.error('Calculate discounts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate discounts and points',
      error: error.message
    });
  }
};

// Get warehouses
export const getWarehouses = async (req, res) => {
  try {
    const user = req.user;

    console.log('🏭 Fetching warehouses for sales executive:', user.name);

    // Import Warehouse model
    const Warehouse = (await import('../../models/Warehouse.js')).default;

    // Get all warehouses that have stock (match web CRM behavior)
    // Don't filter by isActive to show all warehouses with inventory
    let query = {};
    
    if (user.assignedRegions && user.assignedRegions.length > 0) {
      query.region = { $in: user.assignedRegions };
    }

    // Get warehouses that have stock movements
    const warehousesWithStock = await StockMovement.distinct('warehouseId');
    
    // Only show warehouses that have stock
    query._id = { $in: warehousesWithStock };

    const warehouses = await Warehouse.find(query)
      .select('code name address.city address.state isActive status')
      .sort({ name: 1 })
      .lean();

    console.log(`✅ Found ${warehouses.length} warehouses`);

    res.json({
      success: true,
      warehouses,
      count: warehouses.length
    });
  } catch (error) {
    console.error('Get warehouses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch warehouses',
      error: error.message,
    });
  }
};
