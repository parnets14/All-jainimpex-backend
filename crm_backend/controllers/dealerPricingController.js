import DealerPricing from '../models/DealerPricing.js';
import DealerPricingSchedule from '../models/DealerPricingSchedule.js';
import DealerPricingHistory from '../models/DealerPricingHistory.js';
import Product from '../models/Product.js';
import Brand from '../models/Brand.js';
import Category from '../models/Category.js';
import Subcategory from '../models/Subcategory.js';
import DiscountMapping from '../models/DiscountMapping.js';
import PurchaseOrder from '../models/PurchaseOrder.js';
import { v4 as uuidv4 } from 'uuid';

// @desc    Get all dealer pricing records with enhanced filtering
// @route   GET /api/dealer-pricing
// @access  Private
export const getDealerPricing = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      search, 
      productId,
      brandId,
      categoryId,
      subcategoryId,
      hasScheduledChange,
      hasDirectDiscount,
      sortBy = 'updatedAt',
      sortOrder = 'desc'
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = { isActive: true };
    
    // Product-specific filter
    if (productId) {
      filter.product = productId;
    }

    // Boolean filters
    if (hasScheduledChange !== undefined) {
      filter.hasScheduledChange = hasScheduledChange === 'true';
    }
    
    if (hasDirectDiscount !== undefined) {
      filter.hasDirectDiscount = hasDirectDiscount === 'true';
    }

    // Build product filter for hierarchy-based filtering
    let productFilter = {};
    
    if (brandId) {
      productFilter.brand = brandId;
    }
    
    if (categoryId) {
      productFilter.category = categoryId;
    }
    
    if (subcategoryId) {
      productFilter.subcategory = subcategoryId;
    }

    if (search) {
      productFilter.$or = [
        { itemName: { $regex: search, $options: 'i' } },
        { productCode: { $regex: search, $options: 'i' } }
      ];
    }

    // If we have product filters, get matching product IDs
    if (Object.keys(productFilter).length > 0) {
      const products = await Product.find(productFilter).select('_id');
      const productIds = products.map(p => p._id);
      
      if (filter.product) {
        // If productId was already specified, ensure it's in the filtered list
        if (!productIds.some(id => id.toString() === filter.product.toString())) {
          // No matching products, return empty result
          return res.json({
            success: true,
            data: [],
            pagination: {
              currentPage: parseInt(page),
              totalPages: 0,
              totalRecords: 0,
              hasNext: false,
              hasPrev: false
            }
          });
        }
      } else {
        filter.product = { $in: productIds };
      }
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const pricingRecords = await DealerPricing.find(filter)
      .populate({
        path: 'product',
        select: 'itemName productCode brand category subcategory',
        populate: [
          { path: 'brand', select: 'name' },
          { path: 'category', select: 'name' },
          { path: 'subcategory', select: 'name' }
        ]
      })
      .populate('lastPurchaseSupplier', 'name companyName')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort(sort)
      .limit(parseInt(limit))
      .skip(skip);

    const total = await DealerPricing.countDocuments(filter);

    // Filter out records with null products and enhance records with additional information
    const validRecords = pricingRecords.filter(pricing => pricing.product != null);
    
    // Handle empty records gracefully
    if (validRecords.length === 0) {
      return res.json({
        success: true,
        data: [],
        pagination: {
          currentPage: parseInt(page),
          totalPages: 0,
          totalRecords: 0,
          hasNext: false,
          hasPrev: false
        }
      });
    }
    
    const enhancedRecords = await Promise.all(
      validRecords.map(async (pricing) => {
        const pricingObj = pricing.toObject();
        
        // Get scheduled changes
        try {
          const scheduledChanges = await DealerPricingSchedule.find({
            product: pricing.product._id,
            status: 'Scheduled',
            isActive: true
          }).sort({ effectiveDate: 1 }).limit(1);

          if (scheduledChanges.length > 0) {
            pricingObj.nextScheduledChange = scheduledChanges[0];
          }

          // Get recent price history
          const priceHistory = await DealerPricingHistory.find({
            product: pricing.product._id
          })
          .populate('changedBy', 'name')
          .sort({ changeDate: -1 })
          .limit(3);

          pricingObj.recentPriceHistory = priceHistory;
        } catch (error) {
          console.error('Error fetching additional data for product:', pricing.product._id, error);
          // Continue without additional data
        }

        return pricingObj;
      })
    );

    res.json({
      success: true,
      data: enhancedRecords,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalRecords: total,
        hasNext: skip + enhancedRecords.length < total,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Get dealer pricing error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dealer pricing',
      error: error.message
    });
  }
};

// @desc    Get dealer pricing by product ID
// @route   GET /api/dealer-pricing/product/:productId
// @access  Private
export const getDealerPricingByProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    let pricing = await DealerPricing.findOne({ product: productId, isActive: true })
      .populate('product', 'itemName productCode brand category subcategory')
      .populate('lastPurchaseSupplier', 'name companyName');

    // If no pricing record exists, create one with default values
    if (!pricing) {
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Get last purchase price
      const lastPurchase = await PurchaseOrder.findOne({
        'lines.productId': productId,
        status: { $in: ['Approved', 'Completed'] }
      })
      .sort({ orderDate: -1 })
      .populate('supplierId', 'name');

      const purchasePrice = lastPurchase?.lines?.find(l => 
        l.productId?.toString() === productId
      )?.price || 0;

      // Get selling price from rateSlabs
      const sellingPrice = product.rateSlabs && product.rateSlabs.length > 0
        ? product.rateSlabs[0].rate
        : 0;

      pricing = await DealerPricing.create({
        product: productId,
        purchasePrice,
        sellingPrice,
        lastPurchaseDate: lastPurchase?.orderDate,
        lastPurchaseSupplier: lastPurchase?.supplierId,
        createdBy: req.user._id
      });

      await pricing.populate('product', 'itemName productCode brand category subcategory');
      await pricing.populate('lastPurchaseSupplier', 'name companyName');
    }

    res.json({
      success: true,
      data: pricing
    });
  } catch (error) {
    console.error('Get dealer pricing by product error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dealer pricing',
      error: error.message
    });
  }
};

// @desc    Create or update dealer pricing
// @route   POST /api/dealer-pricing
// @access  Private
export const createOrUpdateDealerPricing = async (req, res) => {
  try {
    const { productId, sellingPrice, purchasePrice, mrp, notes } = req.body;

    if (!productId || !sellingPrice) {
      return res.status(400).json({
        success: false,
        message: 'Product ID and selling price are required'
      });
    }

    // Verify product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Get last purchase price if not provided
    let finalPurchasePrice = purchasePrice;
    if (!finalPurchasePrice) {
      const lastPurchase = await PurchaseOrder.findOne({
        'lines.productId': productId,
        status: { $in: ['Approved', 'Completed'] }
      })
      .sort({ orderDate: -1 })
      .populate('supplierId', 'name');

      const purchaseLine = lastPurchase?.lines?.find(l => 
        l.productId?.toString() === productId || l.productId?._id?.toString() === productId
      );
      
      finalPurchasePrice = purchaseLine?.price || 0;
    }

    // Check if pricing record exists
    let pricing = await DealerPricing.findOne({ product: productId });

    if (pricing) {
      // Update existing record
      pricing.sellingPrice = sellingPrice;
      if (finalPurchasePrice) pricing.purchasePrice = finalPurchasePrice;
      if (mrp !== undefined) pricing.mrp = mrp;
      if (notes !== undefined) pricing.notes = notes;
      pricing.updatedBy = req.user._id;
      pricing.isActive = true;
      
      await pricing.save();
    } else {
      // Create new record
      pricing = await DealerPricing.create({
        product: productId,
        purchasePrice: finalPurchasePrice,
        sellingPrice,
        mrp,
        notes,
        createdBy: req.user._id
      });
    }

    await pricing.populate('product', 'itemName productCode brand category subcategory');
    await pricing.populate('lastPurchaseSupplier', 'name companyName');

    res.json({
      success: true,
      message: 'Dealer pricing saved successfully',
      data: pricing
    });
  } catch (error) {
    console.error('Create/Update dealer pricing error:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Pricing record already exists for this product'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error saving dealer pricing',
      error: error.message
    });
  }
};

// @desc    Update dealer pricing
// @route   PUT /api/dealer-pricing/:id
// @access  Private
export const updateDealerPricing = async (req, res) => {
  try {
    const { id } = req.params;
    const { sellingPrice, purchasePrice, mrp, notes, isActive } = req.body;

    const pricing = await DealerPricing.findById(id);
    if (!pricing) {
      return res.status(404).json({
        success: false,
        message: 'Pricing record not found'
      });
    }

    if (sellingPrice !== undefined) pricing.sellingPrice = sellingPrice;
    if (purchasePrice !== undefined) pricing.purchasePrice = purchasePrice;
    if (mrp !== undefined) pricing.mrp = mrp;
    if (notes !== undefined) pricing.notes = notes;
    if (isActive !== undefined) pricing.isActive = isActive;
    pricing.updatedBy = req.user._id;

    await pricing.save();
    await pricing.populate('product', 'itemName productCode brand category subcategory');
    await pricing.populate('lastPurchaseSupplier', 'name companyName');

    res.json({
      success: true,
      message: 'Dealer pricing updated successfully',
      data: pricing
    });
  } catch (error) {
    console.error('Update dealer pricing error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating dealer pricing',
      error: error.message
    });
  }
};

// @desc    Bulk update dealer pricing
// @route   POST /api/dealer-pricing/bulk-update
// @access  Private
export const bulkUpdateDealerPricing = async (req, res) => {
  try {
    const { updates } = req.body; // Array of { productId, sellingPrice, purchasePrice }

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Updates array is required'
      });
    }

    const results = [];
    const errors = [];

    for (const update of updates) {
      try {
        const { productId, sellingPrice, purchasePrice, mrp } = update;

        if (!productId || !sellingPrice) {
          errors.push({ productId, error: 'Product ID and selling price required' });
          continue;
        }

        let pricing = await DealerPricing.findOne({ product: productId });

        if (pricing) {
          pricing.sellingPrice = sellingPrice;
          if (purchasePrice !== undefined) pricing.purchasePrice = purchasePrice;
          if (mrp !== undefined) pricing.mrp = mrp;
          pricing.updatedBy = req.user._id;
          await pricing.save();
        } else {
          pricing = await DealerPricing.create({
            product: productId,
            purchasePrice: purchasePrice || 0,
            sellingPrice,
            mrp,
            createdBy: req.user._id
          });
        }

        results.push({ productId, success: true, pricing: pricing._id });
      } catch (error) {
        errors.push({ productId: update.productId, error: error.message });
      }
    }

    res.json({
      success: true,
      message: `Processed ${results.length} updates, ${errors.length} errors`,
      results,
      errors
    });
  } catch (error) {
    console.error('Bulk update dealer pricing error:', error);
    res.status(500).json({
      success: false,
      message: 'Error in bulk update',
      error: error.message
    });
  }
};

// @desc    Sync purchase prices from latest purchase orders
// @route   POST /api/dealer-pricing/sync-purchase-prices
// @access  Private
export const syncPurchasePrices = async (req, res) => {
  try {
    const { productIds } = req.body; // Optional: specific products, or all if not provided

    const filter = { isActive: true };
    if (productIds && Array.isArray(productIds) && productIds.length > 0) {
      filter.product = { $in: productIds };
    }

    const pricingRecords = await DealerPricing.find(filter).populate('product');

    const results = [];
    for (const pricing of pricingRecords) {
      try {
        const lastPurchase = await PurchaseOrder.findOne({
          'lines.productId': pricing.product._id,
          status: { $in: ['Approved', 'Completed'] }
        })
        .sort({ orderDate: -1 })
        .populate('supplierId', 'name');

        if (lastPurchase) {
          const purchaseLine = lastPurchase.lines.find(l => 
            l.productId?.toString() === pricing.product._id.toString() || 
            l.productId?._id?.toString() === pricing.product._id.toString()
          );

          if (purchaseLine && purchaseLine.price) {
            pricing.purchasePrice = purchaseLine.price;
            pricing.lastPurchaseDate = lastPurchase.orderDate;
            pricing.lastPurchaseSupplier = lastPurchase.supplierId;
            pricing.updatedBy = req.user._id;
            await pricing.save();
            results.push({ productId: pricing.product._id, updated: true });
          }
        }
      } catch (error) {
        results.push({ productId: pricing.product._id, error: error.message });
      }
    }

    res.json({
      success: true,
      message: `Synced purchase prices for ${results.length} products`,
      results
    });
  } catch (error) {
    console.error('Sync purchase prices error:', error);
    res.status(500).json({
      success: false,
      message: 'Error syncing purchase prices',
      error: error.message
    });
  }
};

// @desc    Get filter options for bulk operations
// @route   GET /api/dealer-pricing/filter-options
// @access  Private
export const getFilterOptions = async (req, res) => {
  try {
    // Get unique brands, categories, and subcategories from products that actually have pricing
    const [brands, categories, subcategories] = await Promise.all([
      // Get brands from products (fallback to all brands if isActive field doesn't exist)
      Brand.find({ $or: [{ isActive: true }, { isActive: { $exists: false } }] })
        .select('name')
        .sort({ name: 1 }),
      
      // Get categories from products (fallback to all categories if isActive field doesn't exist)
      Category.find({ $or: [{ isActive: true }, { isActive: { $exists: false } }] })
        .select('name')
        .sort({ name: 1 }),
      
      // Get subcategories from products (fallback to all subcategories if isActive field doesn't exist)
      Subcategory.find({ $or: [{ isActive: true }, { isActive: { $exists: false } }] })
        .select('name')
        .sort({ name: 1 })
    ]);

    res.json({
      success: true,
      data: {
        brands,
        categories,
        subcategories
      }
    });
  } catch (error) {
    console.error('Get filter options error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching filter options',
      error: error.message
    });
  }
};

// @desc    Preview bulk price changes
// @route   POST /api/dealer-pricing/preview-bulk-changes
// @access  Private
export const previewBulkChanges = async (req, res) => {
  try {
    const {
      filters = {},
      changeType, // 'increase_amount', 'decrease_amount', 'increase_percentage', 'decrease_percentage'
      changeValue,
      effectiveDate
    } = req.body;

    if (!changeType || !changeValue) {
      return res.status(400).json({
        success: false,
        message: 'Change type and value are required'
      });
    }

    // Build product filter
    let productFilter = {};
    
    if (filters.brandId) {
      productFilter.brand = filters.brandId;
    }
    
    if (filters.categoryId) {
      productFilter.category = filters.categoryId;
    }
    
    if (filters.subcategoryId) {
      productFilter.subcategory = filters.subcategoryId;
    }

    if (filters.search) {
      productFilter.$or = [
        { itemName: { $regex: filters.search, $options: 'i' } },
        { productCode: { $regex: filters.search, $options: 'i' } }
      ];
    }

    // Get matching products
    const products = await Product.find(productFilter).select('_id itemName productCode rateSlabs');
    const productIds = products.map(p => p._id);

    if (productIds.length === 0) {
      return res.json({
        success: true,
        data: {
          affectedProducts: [],
          totalProducts: 0,
          summary: {
            totalCurrentValue: 0,
            totalNewValue: 0,
            totalChange: 0,
            averageChange: 0
          }
        }
      });
    }

    // Get pricing records for these products
    const pricingRecords = await DealerPricing.find({
      product: { $in: productIds },
      isActive: true
    }).populate({
      path: 'product',
      select: 'itemName productCode brand category subcategory rateSlabs',
      populate: [
        { path: 'brand', select: 'name' },
        { path: 'category', select: 'name' },
        { path: 'subcategory', select: 'name' }
      ]
    });

    // Create a map of existing pricing records
    const pricingMap = {};
    pricingRecords.forEach(pricing => {
      pricingMap[pricing.product._id.toString()] = pricing;
    });

    // Process all products (including those without DealerPricing records)
    const affectedProducts = [];
    
    for (const product of products) {
      const existingPricing = pricingMap[product._id.toString()];
      let currentPrice = 0;
      let priceSource = '';

      // Determine current price
      if (existingPricing && existingPricing.sellingPrice > 0) {
        currentPrice = existingPricing.sellingPrice;
        priceSource = 'DealerPricing';
      } else if (product.rateSlabs && product.rateSlabs.length > 0 && product.rateSlabs[0].rate > 0) {
        currentPrice = product.rateSlabs[0].rate;
        priceSource = 'RateSlab';
      }

      // Skip products with no valid price
      if (currentPrice <= 0) {
        continue;
      }

      // Calculate new price
      let newPrice;
      switch (changeType) {
        case 'increase_amount':
          newPrice = currentPrice + parseFloat(changeValue);
          break;
        case 'decrease_amount':
          newPrice = Math.max(0, currentPrice - parseFloat(changeValue));
          break;
        case 'increase_percentage':
          newPrice = currentPrice * (1 + parseFloat(changeValue) / 100);
          break;
        case 'decrease_percentage':
          newPrice = currentPrice * (1 - parseFloat(changeValue) / 100);
          newPrice = Math.max(0, newPrice);
          break;
        default:
          newPrice = currentPrice;
      }

      // Get product details (populate manually if needed)
      let productDetails = product;
      if (existingPricing && existingPricing.product) {
        productDetails = existingPricing.product;
      }

      affectedProducts.push({
        productId: product._id,
        productName: productDetails.itemName || product.itemName,
        productCode: productDetails.productCode || product.productCode,
        brand: productDetails.brand?.name || 'N/A',
        category: productDetails.category?.name || 'N/A',
        subcategory: productDetails.subcategory?.name || 'N/A',
        currentPrice: Math.round(currentPrice * 100) / 100,
        newPrice: Math.round(newPrice * 100) / 100,
        change: Math.round((newPrice - currentPrice) * 100) / 100,
        changePercentage: currentPrice > 0 ? Math.round(((newPrice - currentPrice) / currentPrice) * 10000) / 100 : 0,
        priceSource: priceSource,
        hasExistingPricing: !!existingPricing
      });
    }

    // Calculate summary
    const totalCurrentValue = affectedProducts.reduce((sum, p) => sum + p.currentPrice, 0);
    const totalNewValue = affectedProducts.reduce((sum, p) => sum + p.newPrice, 0);
    const totalChange = totalNewValue - totalCurrentValue;
    const averageChange = affectedProducts.length > 0 ? totalChange / affectedProducts.length : 0;

    res.json({
      success: true,
      data: {
        affectedProducts,
        totalProducts: affectedProducts.length,
        changeType,
        changeValue,
        effectiveDate,
        summary: {
          totalCurrentValue: Math.round(totalCurrentValue * 100) / 100,
          totalNewValue: Math.round(totalNewValue * 100) / 100,
          totalChange: Math.round(totalChange * 100) / 100,
          averageChange: Math.round(averageChange * 100) / 100
        }
      }
    });
  } catch (error) {
    console.error('Preview bulk changes error:', error);
    res.status(500).json({
      success: false,
      message: 'Error previewing bulk changes',
      error: error.message
    });
  }
};

// @desc    Apply bulk price changes (immediate or scheduled)
// @route   POST /api/dealer-pricing/apply-bulk-changes
// @access  Private
export const applyBulkChanges = async (req, res) => {
  try {
    const {
      productIds,
      changeType,
      changeValue,
      effectiveDate,
      reason,
      notes,
      applyImmediately = false
    } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Product IDs array is required'
      });
    }

    if (!changeType || !changeValue) {
      return res.status(400).json({
        success: false,
        message: 'Change type and value are required'
      });
    }

    const batchId = uuidv4();
    const results = [];
    const errors = [];

    for (const productId of productIds) {
      try {
        let pricing = await DealerPricing.findOne({
          product: productId,
          isActive: true
        });

        let currentPrice = 0;
        let isNewPricingRecord = false;

        if (!pricing) {
          // Check if product has rate slabs
          const product = await Product.findById(productId);
          if (!product) {
            errors.push({ productId, error: 'Product not found' });
            continue;
          }

          if (product.rateSlabs && product.rateSlabs.length > 0 && product.rateSlabs[0].rate > 0) {
            // Create new DealerPricing record from rate slab
            currentPrice = product.rateSlabs[0].rate;
            pricing = new DealerPricing({
              product: productId,
              sellingPrice: currentPrice,
              purchasePrice: 0, // Will be updated when actual purchase happens
              isActive: true,
              createdBy: req.user._id
            });
            isNewPricingRecord = true;
          } else {
            errors.push({ productId, error: 'No pricing or rate slab found' });
            continue;
          }
        } else {
          currentPrice = pricing.sellingPrice;
        }

        let newPrice;

        switch (changeType) {
          case 'increase_amount':
            newPrice = currentPrice + parseFloat(changeValue);
            break;
          case 'decrease_amount':
            newPrice = Math.max(0, currentPrice - parseFloat(changeValue));
            break;
          case 'increase_percentage':
            newPrice = currentPrice * (1 + parseFloat(changeValue) / 100);
            break;
          case 'decrease_percentage':
            newPrice = currentPrice * (1 - parseFloat(changeValue) / 100);
            newPrice = Math.max(0, newPrice);
            break;
          default:
            throw new Error('Invalid change type');
        }

        newPrice = Math.round(newPrice * 100) / 100;

        if (applyImmediately) {
          // Apply immediately
          const oldPrice = currentPrice;
          pricing.sellingPrice = newPrice;
          pricing.updatedBy = req.user._id;
          
          // Save the pricing record (new or existing)
          await pricing.save();

          // Log price change
          await DealerPricingHistory.logPriceChange({
            product: productId,
            oldPrice,
            newPrice,
            changeType: isNewPricingRecord ? 'bulk_create' : 'bulk_update',
            changeMethod: changeType,
            changeValue: parseFloat(changeValue),
            reason,
            notes,
            batchId,
            changedBy: req.user._id
          });

          results.push({ 
            productId, 
            success: true, 
            applied: true, 
            newPrice,
            isNewRecord: isNewPricingRecord
          });
        } else {
          // For scheduled changes, we need to save the pricing record first if it's new
          if (isNewPricingRecord) {
            await pricing.save();
          }

          // Schedule for later
          const effectiveDateObj = effectiveDate ? new Date(effectiveDate) : new Date();
          
          // Check if there's already a scheduled change for this product
          const existingSchedule = await DealerPricingSchedule.findOne({
            product: productId,
            status: 'Scheduled',
            isActive: true
          });

          if (existingSchedule) {
            // Update existing schedule
            existingSchedule.currentPrice = currentPrice;
            existingSchedule.newPrice = newPrice;
            existingSchedule.changeType = changeType;
            existingSchedule.changeValue = parseFloat(changeValue);
            existingSchedule.effectiveDate = effectiveDateObj;
            existingSchedule.reason = reason;
            existingSchedule.notes = notes;
            existingSchedule.updatedBy = req.user._id;
            await existingSchedule.save();
          } else {
            // Create new schedule
            await DealerPricingSchedule.create({
              product: productId,
              currentPrice,
              newPrice,
              changeType,
              changeValue: parseFloat(changeValue),
              effectiveDate: effectiveDateObj,
              reason,
              notes,
              createdBy: req.user._id
            });
          }

          // Update pricing record to indicate scheduled change
          pricing.hasScheduledChange = true;
          pricing.nextScheduledPrice = newPrice;
          pricing.nextScheduledDate = effectiveDateObj;
          await pricing.save();

          results.push({ productId, success: true, scheduled: true, effectiveDate: effectiveDateObj, newPrice });
        }
      } catch (error) {
        errors.push({ productId, error: error.message });
      }
    }

    res.json({
      success: true,
      message: `Processed ${results.length} products, ${errors.length} errors`,
      data: {
        batchId,
        results,
        errors,
        applied: applyImmediately,
        totalProcessed: results.length,
        totalErrors: errors.length
      }
    });
  } catch (error) {
    console.error('Apply bulk changes error:', error);
    res.status(500).json({
      success: false,
      message: 'Error applying bulk changes',
      error: error.message
    });
  }
};

// @desc    Get scheduled price changes
// @route   GET /api/dealer-pricing/scheduled-changes
// @access  Private
export const getScheduledChanges = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      status = 'Scheduled',
      productId,
      fromDate,
      toDate
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = { isActive: true };

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (productId) {
      filter.product = productId;
    }

    if (fromDate || toDate) {
      filter.effectiveDate = {};
      if (fromDate) filter.effectiveDate.$gte = new Date(fromDate);
      if (toDate) filter.effectiveDate.$lte = new Date(toDate);
    }

    const scheduledChanges = await DealerPricingSchedule.find(filter)
      .populate({
        path: 'product',
        select: 'itemName productCode brand category subcategory',
        populate: [
          { path: 'brand', select: 'name' },
          { path: 'category', select: 'name' },
          { path: 'subcategory', select: 'name' }
        ]
      })
      .populate('createdBy', 'name email')
      .populate('appliedBy', 'name email')
      .sort({ effectiveDate: 1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await DealerPricingSchedule.countDocuments(filter);

    res.json({
      success: true,
      data: scheduledChanges,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalRecords: total,
        hasNext: skip + scheduledChanges.length < total,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Get scheduled changes error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching scheduled changes',
      error: error.message
    });
  }
};

// @desc    Apply scheduled price changes manually
// @route   POST /api/dealer-pricing/apply-scheduled-changes
// @access  Private
export const applyScheduledChanges = async (req, res) => {
  try {
    const result = await DealerPricingSchedule.applyScheduledChanges();
    
    res.json({
      success: true,
      message: `Applied ${result.appliedCount} scheduled changes, ${result.failedCount} failed`,
      data: result
    });
  } catch (error) {
    console.error('Apply scheduled changes error:', error);
    res.status(500).json({
      success: false,
      message: 'Error applying scheduled changes',
      error: error.message
    });
  }
};

// @desc    Cancel scheduled price change
// @route   DELETE /api/dealer-pricing/scheduled-changes/:id
// @access  Private
export const cancelScheduledChange = async (req, res) => {
  try {
    const { id } = req.params;

    const schedule = await DealerPricingSchedule.findById(id);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Scheduled change not found'
      });
    }

    if (schedule.status !== 'Scheduled') {
      return res.status(400).json({
        success: false,
        message: 'Only scheduled changes can be cancelled'
      });
    }

    schedule.status = 'Cancelled';
    schedule.updatedBy = req.user._id;
    await schedule.save();

    // Update pricing record
    const pricing = await DealerPricing.findOne({ product: schedule.product });
    if (pricing) {
      // Check if there are other scheduled changes
      const otherSchedules = await DealerPricingSchedule.find({
        product: schedule.product,
        status: 'Scheduled',
        isActive: true,
        _id: { $ne: schedule._id }
      }).sort({ effectiveDate: 1 });

      if (otherSchedules.length > 0) {
        pricing.nextScheduledPrice = otherSchedules[0].newPrice;
        pricing.nextScheduledDate = otherSchedules[0].effectiveDate;
      } else {
        pricing.hasScheduledChange = false;
        pricing.nextScheduledPrice = null;
        pricing.nextScheduledDate = null;
      }
      await pricing.save();
    }

    res.json({
      success: true,
      message: 'Scheduled change cancelled successfully'
    });
  } catch (error) {
    console.error('Cancel scheduled change error:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling scheduled change',
      error: error.message
    });
  }
};

// @desc    Get price history for a product
// @route   GET /api/dealer-pricing/price-history/:productId
// @access  Private
export const getPriceHistory = async (req, res) => {
  try {
    const { productId } = req.params;
    const { limit = 20 } = req.query;

    const history = await DealerPricingHistory.getProductPriceHistory(productId, parseInt(limit));

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Get price history error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching price history',
      error: error.message
    });
  }
};

// @desc    Update discount information for all products
// @route   POST /api/dealer-pricing/update-discount-info
// @access  Private
export const updateDiscountInfo = async (req, res) => {
  try {
    console.log('🔄 Updating discount info for all products...');
    
    const updatedCount = await DealerPricing.updateAllDiscountInfo();
    
    res.json({
      success: true,
      message: `Updated discount information for ${updatedCount} products`,
      updatedCount
    });
  } catch (error) {
    console.error('Update discount info error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating discount information',
      error: error.message
    });
  }
};



