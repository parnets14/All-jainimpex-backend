import { dealerPricingSchema } from '../models/DealerPricing.js';
import { dealerPricingScheduleSchema } from '../models/DealerPricingSchedule.js';
import { dealerPricingHistorySchema } from '../models/DealerPricingHistory.js';
import { productSchema } from '../models/Product.js';
import { brandSchema } from '../models/Brand.js';
import { categorySchema } from '../models/Category.js';
import { subcategorySchema } from '../models/Subcategory.js';
import { discountMappingSchema } from '../models/DiscountMapping.js';
import { purchaseDiscountMappingSchema } from '../models/PurchaseDiscountMapping.js';
import { purchaseOrderSchema } from '../models/PurchaseOrder.js';
import { supplierInvoiceSchema } from '../models/SupplierInvoice.js';
import { supplierSchema } from '../models/Supplier.js';
import { v4 as uuidv4 } from 'uuid';

// Helper function to get models for the current company database
const getModels = (dbConnection) => {
  return {
    DealerPricing: dbConnection.models.DealerPricing || 
                   dbConnection.model('DealerPricing', dealerPricingSchema),
    DealerPricingSchedule: dbConnection.models.DealerPricingSchedule || 
                           dbConnection.model('DealerPricingSchedule', dealerPricingScheduleSchema),
    DealerPricingHistory: dbConnection.models.DealerPricingHistory || 
                          dbConnection.model('DealerPricingHistory', dealerPricingHistorySchema),
    Product: dbConnection.models.Product || 
             dbConnection.model('Product', productSchema),
    Brand: dbConnection.models.Brand || 
           dbConnection.model('Brand', brandSchema),
    Category: dbConnection.models.Category || 
              dbConnection.model('Category', categorySchema),
    Subcategory: dbConnection.models.Subcategory || 
                 dbConnection.model('Subcategory', subcategorySchema),
    DiscountMapping: dbConnection.models.DiscountMapping || 
                     dbConnection.model('DiscountMapping', discountMappingSchema),
    PurchaseDiscountMapping: dbConnection.models.PurchaseDiscountMapping || 
                             dbConnection.model('PurchaseDiscountMapping', purchaseDiscountMappingSchema),
    PurchaseOrder: dbConnection.models.PurchaseOrder || 
                   dbConnection.model('PurchaseOrder', purchaseOrderSchema),
    SupplierInvoice: dbConnection.models.SupplierInvoice || 
                     dbConnection.model('SupplierInvoice', supplierInvoiceSchema),
    Supplier: dbConnection.models.Supplier || 
              dbConnection.model('Supplier', supplierSchema)
  };
};

// @desc    Get all dealer pricing records with enhanced filtering
// @route   GET /api/dealer-pricing
// @access  Private
export const getDealerPricing = async (req, res) => {
  try {
    const { DealerPricing, Product, DealerPricingSchedule, DealerPricingHistory } = getModels(req.dbConnection);
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
        select: 'itemName productCode brand category subcategory internalRate',
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
    
    const enhancedRecords = await (async () => {
      // Batch the schedule + history lookups (was N+1: 2 queries per record).
      const productIds = validRecords.map((p) => p.product._id);

      const [allSchedules, allHistory] = await Promise.all([
        DealerPricingSchedule.find({
          product: { $in: productIds },
          status: 'Scheduled',
          isActive: true,
        }).sort({ effectiveDate: 1 }),
        DealerPricingHistory.find({ product: { $in: productIds } })
          .populate('changedBy', 'name')
          .sort({ changeDate: -1 }),
      ]);

      const scheduleByProduct = new Map();
      for (const s of allSchedules) {
        const k = s.product.toString();
        if (!scheduleByProduct.has(k)) scheduleByProduct.set(k, s);
      }
      const historyByProduct = new Map();
      for (const h of allHistory) {
        const k = h.product.toString();
        const arr = historyByProduct.get(k) || [];
        if (arr.length < 3) {
          arr.push(h);
          historyByProduct.set(k, arr);
        }
      }

      return validRecords.map((pricing) => {
        const pricingObj = pricing.toObject();
        const pid = pricing.product._id.toString();
        const nextScheduled = scheduleByProduct.get(pid);
        if (nextScheduled) pricingObj.nextScheduledChange = nextScheduled;
        pricingObj.recentPriceHistory = historyByProduct.get(pid) || [];
        return pricingObj;
      });
    })();

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
    const { DealerPricing, Product, DealerPricingSchedule, DealerPricingHistory } = getModels(req.dbConnection);
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

      // Get selling price from rateSlabs (Product Master price)
      const sellingPrice = product.rateSlabs && product.rateSlabs.length > 0
        ? product.rateSlabs[0].rate
        : 0;

      // If no purchase exists, use Product Master price for both purchase and selling price
      const initialPurchasePrice = purchasePrice > 0 ? purchasePrice : sellingPrice;

      pricing = await DealerPricing.create({
        product: productId,
        purchasePrice: initialPurchasePrice,
        sellingPrice,
        lastPurchaseDate: lastPurchase?.orderDate,
        lastPurchaseSupplier: lastPurchase?.supplierId,
        purchasePriceSource: purchasePrice > 0 ? 'purchase_order' : 'product_master',
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
    const { DealerPricing, Product, DealerPricingHistory } = getModels(req.dbConnection);
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
      
      // If still no purchase price, use Product Master price (selling price) as initial purchase price
      if (!finalPurchasePrice || finalPurchasePrice === 0) {
        const productMasterPrice = product.rateSlabs && product.rateSlabs.length > 0
          ? product.rateSlabs[0].rate
          : 0;
        finalPurchasePrice = productMasterPrice;
        console.log(`📊 No purchase price found, using Product Master price: ₹${finalPurchasePrice}`);
      }
    }

    // Check if pricing record exists
    let pricing = await DealerPricing.findOne({ product: productId });

    if (pricing) {
      // Update existing record
      const oldSellingPrice = pricing.sellingPrice;
      
      pricing.sellingPrice = sellingPrice;
      if (finalPurchasePrice) pricing.purchasePrice = finalPurchasePrice;
      if (mrp !== undefined) pricing.mrp = mrp;
      if (notes !== undefined) pricing.notes = notes;
      pricing.updatedBy = req.user._id;
      pricing.isActive = true;
      
      await pricing.save();

      // Log price change if selling price was updated
      if (sellingPrice !== oldSellingPrice) {
        try {
          await DealerPricingHistory.logPriceChange({
            product: productId,
            oldPrice: oldSellingPrice,
            newPrice: sellingPrice,
            changeType: 'manual',
            changeMethod: 'direct_update',
            reason: notes || 'Price update via API',
            changedBy: req.user._id
          });
          console.log(`📊 Price history logged: ${productId} - ₹${oldSellingPrice} → ₹${sellingPrice}`);
        } catch (historyError) {
          console.error('Error logging price history:', historyError);
          // Don't fail the main operation if history logging fails
        }
      }
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

      // Log initial price setting for new products
      try {
        await DealerPricingHistory.logPriceChange({
          product: productId,
          oldPrice: 0,
          newPrice: sellingPrice,
          changeType: 'manual',
          changeMethod: 'direct_update',
          reason: notes || 'Initial price setting',
          changedBy: req.user._id
        });
        console.log(`📊 Initial price history logged: ${productId} - ₹0 → ₹${sellingPrice}`);
      } catch (historyError) {
        console.error('Error logging initial price history:', historyError);
        // Don't fail the main operation if history logging fails
      }
    }

    await pricing.populate('product', 'itemName productCode brand category subcategory');
    await pricing.populate('lastPurchaseSupplier', 'name companyName');

    // Sync MRP to Product model when DealerPricing mrp changes
    if (mrp !== undefined && mrp > 0) {
      try {
        const productToUpdate = await Product.findById(productId);
        if (productToUpdate && productToUpdate.mrp !== mrp) {
          productToUpdate.mrp = mrp;
          await productToUpdate.save(); // This triggers Product pre-save which recalculates unitPrice
          console.log(`📊 Product.mrp synced: ${productId} → MRP ₹${mrp}`);
        }
      } catch (syncError) {
        console.error('Error syncing Product.mrp:', syncError);
        // Don't fail the main operation
      }
    }

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
    const { DealerPricing, DealerPricingHistory, Product } = getModels(req.dbConnection);
    const { id } = req.params;
    const { sellingPrice, purchasePrice, mrp, notes, isActive } = req.body;

    const pricing = await DealerPricing.findById(id);
    if (!pricing) {
      return res.status(404).json({
        success: false,
        message: 'Pricing record not found'
      });
    }

    // Store old price for history logging
    const oldSellingPrice = pricing.sellingPrice;

    if (sellingPrice !== undefined) pricing.sellingPrice = sellingPrice;
    if (purchasePrice !== undefined) pricing.purchasePrice = purchasePrice;
    if (mrp !== undefined) pricing.mrp = mrp;
    if (notes !== undefined) pricing.notes = notes;
    if (isActive !== undefined) pricing.isActive = isActive;
    pricing.updatedBy = req.user._id;

    await pricing.save();

    // Log price change if selling price was updated
    if (sellingPrice !== undefined && sellingPrice !== oldSellingPrice) {
      try {
        await DealerPricingHistory.logPriceChange({
          product: pricing.product,
          oldPrice: oldSellingPrice,
          newPrice: sellingPrice,
          changeType: 'manual',
          changeMethod: 'direct_update',
          reason: notes || 'Manual price update',
          changedBy: req.user._id
        });
        console.log(`📊 Price history logged: ${pricing.product} - ₹${oldSellingPrice} → ₹${sellingPrice}`);
      } catch (historyError) {
        console.error('Error logging price history:', historyError);
        // Don't fail the main operation if history logging fails
      }
    }

    await pricing.populate('product', 'itemName productCode brand category subcategory');
    await pricing.populate('lastPurchaseSupplier', 'name companyName');

    // Sync MRP to Product model when DealerPricing mrp changes
    if (mrp !== undefined && mrp > 0) {
      try {
        const productToUpdate = await Product.findById(pricing.product._id || pricing.product);
        if (productToUpdate && productToUpdate.mrp !== mrp) {
          productToUpdate.mrp = mrp;
          await productToUpdate.save();
          console.log(`📊 Product.mrp synced: ${pricing.product._id || pricing.product} → MRP ₹${mrp}`);
        }
      } catch (syncError) {
        console.error('Error syncing Product.mrp:', syncError);
      }
    }

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
    const { DealerPricing, Product, DealerPricingHistory } = getModels(req.dbConnection);
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
          const oldSellingPrice = pricing.sellingPrice;
          
          pricing.sellingPrice = sellingPrice;
          if (purchasePrice !== undefined) pricing.purchasePrice = purchasePrice;
          if (mrp !== undefined) pricing.mrp = mrp;
          pricing.updatedBy = req.user._id;
          await pricing.save();

          // Log price change if selling price was updated
          if (sellingPrice !== oldSellingPrice) {
            try {
              await DealerPricingHistory.logPriceChange({
                product: productId,
                oldPrice: oldSellingPrice,
                newPrice: sellingPrice,
                changeType: 'bulk_update',
                changeMethod: 'direct_update',
                reason: 'Bulk price update',
                changedBy: req.user._id
              });
            } catch (historyError) {
              console.error('Error logging bulk price history:', historyError);
            }
          }
        } else {
          pricing = await DealerPricing.create({
            product: productId,
            purchasePrice: purchasePrice || 0,
            sellingPrice,
            mrp,
            createdBy: req.user._id
          });

          // Log initial price setting for new products
          try {
            await DealerPricingHistory.logPriceChange({
              product: productId,
              oldPrice: 0,
              newPrice: sellingPrice,
              changeType: 'bulk_update',
              changeMethod: 'direct_update',
              reason: 'Initial price setting via bulk update',
              changedBy: req.user._id
            });
          } catch (historyError) {
            console.error('Error logging bulk initial price history:', historyError);
          }
        }

        results.push({ productId, success: true, pricing: pricing._id });

        // Sync MRP to Product model when DealerPricing mrp changes
        if (mrp !== undefined && mrp > 0) {
          try {
            const productToSync = await Product.findById(productId);
            if (productToSync && productToSync.mrp !== mrp) {
              productToSync.mrp = mrp;
              await productToSync.save();
            }
          } catch (syncError) {
            console.error(`Error syncing Product.mrp for ${productId}:`, syncError);
          }
        }
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
    const { DealerPricing, PurchaseOrder, Product } = getModels(req.dbConnection);
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
    const { Brand, Category, Subcategory } = getModels(req.dbConnection);
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
    const { DealerPricing, Product } = getModels(req.dbConnection);
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
    const products = await Product.find(productFilter).select('_id itemName productCode rateSlabs mrp totalAmount gst');
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

      // Determine current price — use MRP (GST inclusive)
      if (product.mrp && product.mrp > 0) {
        currentPrice = product.mrp;
        priceSource = 'Product MRP';
      } else if (product.totalAmount && product.totalAmount > 0) {
        currentPrice = product.totalAmount;
        priceSource = 'Product TotalAmount';
      } else if (existingPricing && existingPricing.sellingPrice > 0) {
        // Fallback: calculate MRP from sellingPrice + GST
        const gstRate = product.gst || 18;
        currentPrice = existingPricing.sellingPrice * (1 + gstRate / 100);
        priceSource = 'DealerPricing';
      } else if (product.rateSlabs && product.rateSlabs.length > 0 && product.rateSlabs[0].rate > 0) {
        const gstRate = product.gst || 18;
        currentPrice = product.rateSlabs[0].rate * (1 + gstRate / 100);
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
    const { DealerPricing, DealerPricingSchedule, DealerPricingHistory, Product } = getModels(req.dbConnection);
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
        let productGst = 0;

        if (!pricing) {
          // Check if product has rate slabs
          const product = await Product.findById(productId);
          if (!product) {
            errors.push({ productId, error: 'Product not found' });
            continue;
          }
          productGst = product.gst || 18;

          // Use MRP as current price
          if (product.mrp && product.mrp > 0) {
            currentPrice = product.mrp;
          } else if (product.totalAmount && product.totalAmount > 0) {
            currentPrice = product.totalAmount;
          } else if (product.rateSlabs && product.rateSlabs.length > 0 && product.rateSlabs[0].rate > 0) {
            currentPrice = product.rateSlabs[0].rate * (1 + productGst / 100);
          }

          if (currentPrice <= 0) {
            errors.push({ productId, error: 'No pricing or rate slab found' });
            continue;
          }

          // Create new DealerPricing record
          const basePrice = parseFloat((currentPrice / (1 + productGst / 100)).toFixed(2));
          pricing = new DealerPricing({
            product: productId,
            sellingPrice: basePrice,
            mrp: currentPrice,
            purchasePrice: 0,
            isActive: true,
            createdBy: req.user._id
          });
          isNewPricingRecord = true;
        } else {
          // Get product GST for calculations
          const product = await Product.findById(productId).select('gst mrp totalAmount');
          productGst = product?.gst || 18;
          // Use MRP as current price
          currentPrice = product?.mrp || product?.totalAmount || (pricing.sellingPrice * (1 + productGst / 100));
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
          // Apply immediately — newPrice is the new MRP
          const oldPrice = currentPrice;
          const newBasePrice = parseFloat((newPrice / (1 + productGst / 100)).toFixed(2));
          pricing.sellingPrice = newBasePrice; // Base price (excl. GST)
          pricing.mrp = newPrice; // MRP (incl. GST)
          pricing.updatedBy = req.user._id;
          
          // Save the pricing record (new or existing)
          await pricing.save();

          // Also update Product.mrp
          try {
            const productToSync = await Product.findById(productId);
            if (productToSync) {
              productToSync.mrp = newPrice;
              await productToSync.save(); // Triggers pre-save to recalculate unitPrice
            }
          } catch (syncErr) {
            console.error(`Error syncing Product.mrp for ${productId}:`, syncErr);
          }

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
    const { DealerPricingSchedule } = getModels(req.dbConnection);
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
    const { DealerPricingSchedule } = getModels(req.dbConnection);
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
    const { DealerPricingSchedule } = getModels(req.dbConnection);
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
    const { DealerPricingHistory } = getModels(req.dbConnection);
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

// @desc    Get all price history (for Price History tab)
// @route   GET /api/dealer-pricing/all-price-history
// @access  Private
export const getAllPriceHistory = async (req, res) => {
  try {
    const { DealerPricingHistory, Product } = getModels(req.dbConnection);
    const { 
      page = 1, 
      limit = 20,
      search,
      changeType,
      dateFrom,
      dateTo
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build filter
    let filter = {};
    
    // Date range filter
    if (dateFrom || dateTo) {
      filter.changeDate = {};
      if (dateFrom) filter.changeDate.$gte = new Date(dateFrom);
      if (dateTo) filter.changeDate.$lte = new Date(dateTo);
    }
    
    // Change type filter
    if (changeType && changeType !== 'all') {
      filter.changeType = changeType;
    }
    
    // Search filter - need to find matching products first
    if (search) {
      const searchLower = search.toLowerCase();
      const matchingProducts = await Product.find({
        $or: [
          { itemName: { $regex: search, $options: 'i' } },
          { productCode: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      
      const productIds = matchingProducts.map(p => p._id);
      
      // Add product filter or reason filter
      filter.$or = [
        { product: { $in: productIds } },
        { reason: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Get total count for pagination (before skip/limit)
    const totalCount = await DealerPricingHistory.countDocuments(filter);
    
    // Get history with product details
    const history = await DealerPricingHistory.find(filter)
      .populate('product', 'itemName productCode')
      .populate('changedBy', 'name')
      .sort({ changeDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    res.json({
      success: true,
      data: history,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalRecords: totalCount,
        hasNext: skip + history.length < totalCount,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Get all price history error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching price history',
      error: error.message
    });
  }
};

// @desc    Update discount information for all products (enhanced with purchase discounts)
// @route   POST /api/dealer-pricing/update-discount-info
// @access  Private
export const updateDiscountInfo = async (req, res) => {
  try {
    const { DealerPricing, DiscountMapping } = getModels(req.dbConnection);
    console.log('🔄 Updating comprehensive discount info (sales + purchase) for all products...');
    
    const updatedCount = await DealerPricing.updateAllDiscountInfo();
    
    res.json({
      success: true,
      message: `Updated comprehensive discount information for ${updatedCount} products`,
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

// @desc    Sync purchase prices from supplier invoices
// @route   POST /api/dealer-pricing/sync-purchase-prices-from-invoices
// @access  Private
export const syncPurchasePricesFromInvoices = async (req, res) => {
  try {
    const { DealerPricing, SupplierInvoice } = getModels(req.dbConnection);
    console.log('🔄 Syncing purchase prices from supplier invoices...');
    
    const syncedCount = await DealerPricing.syncAllPurchasePricesFromInvoices();
    
    res.json({
      success: true,
      message: `Synced purchase prices for ${syncedCount} products from supplier invoices`,
      syncedCount
    });
  } catch (error) {
    console.error('Sync purchase prices from invoices error:', error);
    res.status(500).json({
      success: false,
      message: 'Error syncing purchase prices from invoices',
      error: error.message
    });
  }
};

// @desc    Get comprehensive pricing with both sales and purchase discounts
// @route   GET /api/dealer-pricing/comprehensive
// @access  Private
export const getComprehensivePricing = async (req, res) => {
  try {
    const { DealerPricing, Product, DiscountMapping, DealerPricingSchedule, DealerPricingHistory } = getModels(req.dbConnection);
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
      hasPurchaseDiscount,
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
    
    if (hasPurchaseDiscount !== undefined) {
      filter['purchaseDiscountInfo.hasDirectDiscount'] = hasPurchaseDiscount === 'true';
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
        select: 'itemName productCode brand category subcategory gst mrp totalAmount internalRate',
        populate: [
          { path: 'brand', select: 'name' },
          { path: 'category', select: 'name' },
          { path: 'subcategory', select: 'name' }
        ]
      })
      .populate('lastPurchaseSupplier', 'name companyName')
      .populate('lastSupplierInvoice', 'invoiceNumber invoiceDate')
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
    
    const enhancedRecords = await (async () => {
      // Batch the schedule + history lookups (was N+1: 2 queries per record).
      const productIds = validRecords.map((p) => p.product._id);

      const [allSchedules, allHistory] = await Promise.all([
        DealerPricingSchedule.find({
          product: { $in: productIds },
          status: 'Scheduled',
          isActive: true,
        }).sort({ effectiveDate: 1 }),
        DealerPricingHistory.find({ product: { $in: productIds } })
          .populate('changedBy', 'name')
          .sort({ changeDate: -1 }),
      ]);

      // Group: first scheduled change per product, and up to 3 history rows per product
      const scheduleByProduct = new Map();
      for (const s of allSchedules) {
        const k = s.product.toString();
        if (!scheduleByProduct.has(k)) scheduleByProduct.set(k, s);
      }
      const historyByProduct = new Map();
      for (const h of allHistory) {
        const k = h.product.toString();
        const arr = historyByProduct.get(k) || [];
        if (arr.length < 3) {
          arr.push(h);
          historyByProduct.set(k, arr);
        }
      }

      return validRecords.map((pricing) => {
        const pricingObj = pricing.toObject();
        const pid = pricing.product._id.toString();

        const nextScheduled = scheduleByProduct.get(pid);
        if (nextScheduled) pricingObj.nextScheduledChange = nextScheduled;
        pricingObj.recentPriceHistory = historyByProduct.get(pid) || [];

        // Comprehensive discount summary
        pricingObj.discountSummary = {
          sales: {
            hasDiscount: pricingObj.hasDirectDiscount || (pricingObj.maxDiscountPercentage > 0),
            directPercentage: pricingObj.directDiscountPercentage,
            maxPercentage: pricingObj.maxDiscountPercentage,
            source: pricingObj.salesDiscountSource,
            sourceName: pricingObj.salesDiscountSourceName
          },
          purchase: {
            hasDirectDiscount: pricingObj.purchaseDiscountInfo?.hasDirectDiscount || false,
            directPercentage: pricingObj.purchaseDiscountInfo?.directDiscountPercentage || 0,
            hasFloatingDiscount: pricingObj.purchaseDiscountInfo?.hasFloatingDiscount || false,
            floatingMin: pricingObj.purchaseDiscountInfo?.floatingDiscountMin || 0,
            floatingMax: pricingObj.purchaseDiscountInfo?.floatingDiscountMax || 0,
            source: pricingObj.purchaseDiscountInfo?.discountSource,
            sourceName: pricingObj.purchaseDiscountInfo?.discountSourceName
          }
        };

        // Margin analysis
        pricingObj.marginAnalysis = {
          gross: pricingObj.grossMargin,
          net: pricingObj.netMargin,
          range: {
            min: pricingObj.marginRange?.min || pricingObj.netMargin,
            max: pricingObj.marginRange?.max || pricingObj.netMargin
          },
          effectivePrices: {
            purchase: pricingObj.effectivePurchasePrice,
            selling: pricingObj.effectiveSellingPrice
          }
        };

        return pricingObj;
      });
    })();

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
    console.error('Get comprehensive pricing error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching comprehensive pricing',
      error: error.message
    });
  }
};




// @desc    Comprehensive Price Validation and Auto-Sync System
// @route   POST /api/dealer-pricing/validate-and-sync-all
// @access  Private
export const validateAndSyncAllPricing = async (req, res) => {
  try {
    const { DealerPricing, Product, PurchaseOrder, DiscountMapping } = getModels(req.dbConnection);
    console.log('🚨 COMPREHENSIVE PRICE VALIDATION AND AUTO-SYNC SYSTEM STARTING...\n');
    
    const results = {
      totalProducts: 0,
      validatedProducts: 0,
      correctedProducts: 0,
      newProductsCreated: 0,
      syncedFromPurchases: 0,
      syncedFromInvoices: 0,
      warnings: [],
      errors: [],
      corrections: []
    };

    // 1. GET ALL PRODUCTS WITH RATE SLABS
    console.log('📋 Step 1: Getting all products with rate slabs...');
    const allProducts = await Product.find({
      'rateSlabs.0.rate': { $gt: 0 }
    }).populate('brand category subcategory', 'name');
    
    results.totalProducts = allProducts.length;
    console.log(`Found ${allProducts.length} products with rate slabs\n`);

    // 2. GET ALL EXISTING DEALER PRICING RECORDS
    console.log('💰 Step 2: Getting existing dealer pricing records...');
    const existingPricingRecords = await DealerPricing.find({ isActive: true });
    const existingPricingMap = {};
    existingPricingRecords.forEach(pricing => {
      existingPricingMap[pricing.product.toString()] = pricing;
    });
    console.log(`Found ${existingPricingRecords.length} existing pricing records\n`);

    // 3. PROCESS EACH PRODUCT
    console.log('🔍 Step 3: Processing each product for validation and sync...\n');
    
    for (const product of allProducts) {
      try {
        const productId = product._id.toString();
        const masterPrice = product.rateSlabs[0].rate;
        let pricing = existingPricingMap[productId];
        let isNewRecord = false;

        // 3a. CREATE PRICING RECORD IF MISSING
        if (!pricing) {
          console.log(`➕ Creating new pricing record for: ${product.itemName} (${product.productCode})`);
          
          pricing = new DealerPricing({
            product: product._id,
            purchasePrice: masterPrice, // Initially set to Product Master price
            sellingPrice: masterPrice,
            purchasePriceSource: 'product_master',
            isActive: true,
            createdBy: null // System created
          });
          
          isNewRecord = true;
          results.newProductsCreated++;
        }

        // 3b. SYNC PURCHASE PRICE FROM RECENT PURCHASE ORDERS
        console.log(`🔄 Syncing purchase price for: ${product.itemName}`);
        
        const recentPO = await PurchaseOrder.findOne({
          'lines.productId': product._id,
          status: { $in: ['Approved', 'Completed', 'Received'] }
        }).sort({ orderDate: -1 });

        let actualPurchasePrice = null;
        if (recentPO) {
          const productLine = recentPO.lines.find(line => 
            line.productId && line.productId.toString() === productId
          );
          
          if (productLine && productLine.unitPrice && productLine.unitPrice > 0) {
            actualPurchasePrice = productLine.unitPrice;
            pricing.purchasePrice = actualPurchasePrice;
            pricing.purchasePriceSource = 'purchase_order';
            pricing.lastPurchasePriceUpdate = new Date();
            results.syncedFromPurchases++;
            console.log(`  ✅ Synced from PO: ₹${actualPurchasePrice}`);
          }
        }

        // 3c. SYNC FROM SUPPLIER INVOICES IF NO PO DATA
        if (!actualPurchasePrice) {
          const recentInvoice = await SupplierInvoice.findOne({
            'items.productId': product._id,
            status: { $in: ['Approved', 'Completed', 'Paid'] }
          }).sort({ invoiceDate: -1, createdAt: -1 });

          if (recentInvoice) {
            const productItem = recentInvoice.items.find(item => 
              item.productId && item.productId.toString() === productId
            );

            if (productItem && productItem.unitPrice > 0) {
              let effectivePrice = productItem.unitPrice;
              
              // Apply discounts from invoice
              if (productItem.directDiscount > 0) {
                effectivePrice = effectivePrice - (effectivePrice * productItem.directDiscount / 100);
              }
              if (productItem.floatingDiscount > 0) {
                effectivePrice = effectivePrice - (effectivePrice * productItem.floatingDiscount / 100);
              }
              
              pricing.purchasePrice = Math.max(0, effectivePrice);
              pricing.purchasePriceSource = 'supplier_invoice';
              pricing.lastPurchasePriceUpdate = new Date();
              pricing.lastSupplierInvoice = recentInvoice._id;
              results.syncedFromInvoices++;
              console.log(`  ✅ Synced from Invoice: ₹${productItem.unitPrice} → ₹${pricing.purchasePrice} (after discounts)`);
            }
          }
        }

        // 3d. PRICE VALIDATION AND CORRECTION
        const currentPurchasePrice = pricing.purchasePrice;
        const currentSellingPrice = pricing.sellingPrice;
        let correctionMade = false;

        // Validation 1: Selling price vs Master price
        if (masterPrice > 0) {
          const sellingVsMasterDiff = Math.abs(currentSellingPrice - masterPrice) / masterPrice * 100;
          
          if (sellingVsMasterDiff > 50) {
            results.warnings.push({
              productId,
              productName: product.itemName,
              productCode: product.productCode,
              type: 'SELLING_PRICE_DISCREPANCY',
              message: `Selling price (₹${currentSellingPrice}) differs by ${sellingVsMasterDiff.toFixed(1)}% from master price (₹${masterPrice})`,
              masterPrice,
              currentSellingPrice,
              difference: sellingVsMasterDiff
            });

            // Auto-correct if selling price is suspiciously low (less than 50% of master)
            if (currentSellingPrice < (masterPrice * 0.5)) {
              const correctedSellingPrice = Math.round(masterPrice * 0.85); // 85% of master
              
              // Create history record before correction
              await DealerPricingHistory.create({
                product: product._id,
                oldPurchasePrice: currentPurchasePrice,
                newPurchasePrice: currentPurchasePrice,
                oldSellingPrice: currentSellingPrice,
                newSellingPrice: correctedSellingPrice,
                changeType: 'auto_correction',
                reason: `Auto-corrected selling price - was ${sellingVsMasterDiff.toFixed(1)}% different from master price`,
                changeDate: new Date(),
                changedBy: null // System correction
              });

              pricing.sellingPrice = correctedSellingPrice;
              correctionMade = true;
              
              results.corrections.push({
                productId,
                productName: product.itemName,
                type: 'SELLING_PRICE_CORRECTION',
                oldPrice: currentSellingPrice,
                newPrice: correctedSellingPrice,
                reason: 'Auto-corrected based on master price analysis'
              });
              
              console.log(`  🔧 Auto-corrected selling price: ₹${currentSellingPrice} → ₹${correctedSellingPrice}`);
            }
          }
        }

        // Validation 2: Purchase price vs Selling price
        if (currentPurchasePrice > currentSellingPrice && currentSellingPrice > 0) {
          results.warnings.push({
            productId,
            productName: product.itemName,
            productCode: product.productCode,
            type: 'NEGATIVE_MARGIN',
            message: `Purchase price (₹${currentPurchasePrice}) is higher than selling price (₹${currentSellingPrice})`,
            purchasePrice: currentPurchasePrice,
            sellingPrice: currentSellingPrice
          });
        }

        // Validation 3: Zero or very low purchase price
        if (currentPurchasePrice <= 0 && masterPrice > 1000) {
          results.warnings.push({
            productId,
            productName: product.itemName,
            productCode: product.productCode,
            type: 'MISSING_PURCHASE_PRICE',
            message: `No purchase price set for high-value product (Master: ₹${masterPrice})`,
            masterPrice
          });
        }

        // 3e. UPDATE DISCOUNT INFORMATION
        await pricing.updateAllDiscountInfo();

        // 3f. ENABLE AUTO-SYNC FOR FUTURE UPDATES
        if (pricing.purchasePriceSource === 'manual') {
          pricing.purchasePriceSource = 'auto_sync_enabled';
        }

        // 3g. SAVE THE PRICING RECORD
        await pricing.save();
        
        if (correctionMade) {
          results.correctedProducts++;
        }
        
        results.validatedProducts++;
        
        console.log(`  ✅ Processed: ${product.itemName} - P:₹${pricing.purchasePrice}, S:₹${pricing.sellingPrice}, Source:${pricing.purchasePriceSource}`);

      } catch (error) {
        console.error(`❌ Error processing product ${product.itemName}:`, error);
        results.errors.push({
          productId: product._id,
          productName: product.itemName,
          error: error.message
        });
      }
    }

    // 4. FINAL SUMMARY
    console.log('\n' + '='.repeat(80));
    console.log('📊 COMPREHENSIVE PRICE VALIDATION AND AUTO-SYNC COMPLETED');
    console.log('='.repeat(80));
    console.log(`Total Products Processed: ${results.totalProducts}`);
    console.log(`Successfully Validated: ${results.validatedProducts}`);
    console.log(`New Records Created: ${results.newProductsCreated}`);
    console.log(`Auto-Corrected: ${results.correctedProducts}`);
    console.log(`Synced from Purchase Orders: ${results.syncedFromPurchases}`);
    console.log(`Synced from Supplier Invoices: ${results.syncedFromInvoices}`);
    console.log(`Warnings Generated: ${results.warnings.length}`);
    console.log(`Errors Encountered: ${results.errors.length}`);

    res.json({
      success: true,
      message: 'Comprehensive price validation and auto-sync completed successfully',
      data: results
    });

  } catch (error) {
    console.error('❌ Comprehensive validation failed:', error);
    res.status(500).json({
      success: false,
      message: 'Error in comprehensive price validation and sync',
      error: error.message
    });
  }
};

// @desc    Get Price Validation Warnings for all products
// @route   GET /api/dealer-pricing/validation-warnings
// @access  Private
export const getPriceValidationWarnings = async (req, res) => {
  try {
    const { DealerPricing, Product } = getModels(req.dbConnection);
    const warnings = [];
    
    // Get all products with pricing records
    const pricingRecords = await DealerPricing.find({ isActive: true })
      .populate('product', 'itemName productCode rateSlabs');
    
    for (const pricing of pricingRecords) {
      if (!pricing.product) continue;
      
      const product = pricing.product;
      const masterPrice = product.rateSlabs?.[0]?.rate || 0;
      const purchasePrice = pricing.purchasePrice;
      const sellingPrice = pricing.sellingPrice;
      
      // Check for various warning conditions
      
      // 1. Selling price vs Master price discrepancy
      if (masterPrice > 0) {
        const sellingVsMasterDiff = Math.abs(sellingPrice - masterPrice) / masterPrice * 100;
        if (sellingVsMasterDiff > 30) {
          warnings.push({
            productId: product._id,
            productName: product.itemName,
            productCode: product.productCode,
            type: 'PRICE_DISCREPANCY',
            severity: sellingVsMasterDiff > 70 ? 'HIGH' : 'MEDIUM',
            message: `Selling price differs by ${sellingVsMasterDiff.toFixed(1)}% from master price`,
            details: {
              masterPrice,
              sellingPrice,
              difference: sellingVsMasterDiff,
              purchasePrice
            }
          });
        }
      }
      
      // 2. Negative margin
      if (purchasePrice > sellingPrice && sellingPrice > 0) {
        warnings.push({
          productId: product._id,
          productName: product.itemName,
          productCode: product.productCode,
          type: 'NEGATIVE_MARGIN',
          severity: 'HIGH',
          message: `Purchase price (₹${purchasePrice}) exceeds selling price (₹${sellingPrice})`,
          details: {
            purchasePrice,
            sellingPrice,
            loss: purchasePrice - sellingPrice
          }
        });
      }
      
      // 3. Missing purchase price for high-value items
      if (purchasePrice <= 0 && masterPrice > 1000) {
        warnings.push({
          productId: product._id,
          productName: product.itemName,
          productCode: product.productCode,
          type: 'MISSING_PURCHASE_PRICE',
          severity: 'MEDIUM',
          message: `No purchase price set for high-value product`,
          details: {
            masterPrice,
            purchasePrice: 0
          }
        });
      }
      
      // 4. Very low margin (less than 5%)
      if (purchasePrice > 0 && sellingPrice > 0) {
        const margin = ((sellingPrice - purchasePrice) / purchasePrice) * 100;
        if (margin < 5 && margin >= 0) {
          warnings.push({
            productId: product._id,
            productName: product.itemName,
            productCode: product.productCode,
            type: 'LOW_MARGIN',
            severity: 'MEDIUM',
            message: `Very low profit margin: ${margin.toFixed(2)}%`,
            details: {
              purchasePrice,
              sellingPrice,
              margin
            }
          });
        }
      }
      
      // 5. Outdated purchase price source
      if (pricing.purchasePriceSource === 'manual' && pricing.lastPurchasePriceUpdate) {
        const daysSinceUpdate = (new Date() - new Date(pricing.lastPurchasePriceUpdate)) / (1000 * 60 * 60 * 24);
        if (daysSinceUpdate > 90) {
          warnings.push({
            productId: product._id,
            productName: product.itemName,
            productCode: product.productCode,
            type: 'OUTDATED_PRICE',
            severity: 'LOW',
            message: `Purchase price not updated for ${Math.floor(daysSinceUpdate)} days`,
            details: {
              lastUpdate: pricing.lastPurchasePriceUpdate,
              daysSinceUpdate: Math.floor(daysSinceUpdate),
              source: pricing.purchasePriceSource
            }
          });
        }
      }
    }
    
    // Sort warnings by severity
    const severityOrder = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
    warnings.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);
    
    res.json({
      success: true,
      data: {
        warnings,
        summary: {
          total: warnings.length,
          high: warnings.filter(w => w.severity === 'HIGH').length,
          medium: warnings.filter(w => w.severity === 'MEDIUM').length,
          low: warnings.filter(w => w.severity === 'LOW').length
        }
      }
    });
    
  } catch (error) {
    console.error('Get price validation warnings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching price validation warnings',
      error: error.message
    });
  }
};

// @desc    Auto-create pricing records for all products without them
// @route   POST /api/dealer-pricing/auto-create-missing
// @access  Private
export const autoCreateMissingPricingRecords = async (req, res) => {
  try {
    const { DealerPricing, Product } = getModels(req.dbConnection);
    console.log('🔄 Auto-creating missing pricing records for all products...');
    
    // Get all products with rate slabs
    const allProducts = await Product.find({
      'rateSlabs.0.rate': { $gt: 0 }
    });
    
    console.log(`📦 Found ${allProducts.length} products with rate slabs`);
    
    // Get existing pricing records
    const existingPricingRecords = await DealerPricing.find({ isActive: true });
    const existingPricingMap = {};
    existingPricingRecords.forEach(pricing => {
      existingPricingMap[pricing.product.toString()] = pricing;
    });
    
    console.log(`💰 Found ${existingPricingRecords.length} existing pricing records`);
    
    let createdCount = 0;
    const results = [];
    
    // Process each product
    for (const product of allProducts) {
      const productId = product._id.toString();
      
      // Skip if pricing record already exists
      if (existingPricingMap[productId]) {
        continue;
      }
      
      const masterPrice = product.rateSlabs[0].rate;
      
      // Check for recent purchase orders
      const recentPO = await PurchaseOrder.findOne({
        'lines.productId': product._id,
        status: { $in: ['Approved', 'Completed'] }
      }).sort({ orderDate: -1 });
      
      let purchasePrice = masterPrice; // Default to Product Master price
      let purchasePriceSource = 'product_master';
      let lastPurchaseDate = null;
      let lastPurchaseSupplier = null;
      
      // If there's a recent purchase, use that price for purchase price
      if (recentPO) {
        const productLine = recentPO.lines.find(line => 
          line.productId && line.productId.toString() === productId
        );
        
        if (productLine && productLine.price > 0) {
          purchasePrice = productLine.price;
          purchasePriceSource = 'purchase_order';
          lastPurchaseDate = recentPO.orderDate;
          lastPurchaseSupplier = recentPO.supplierId;
        }
      }
      
      // Create new pricing record
      const newPricing = await DealerPricing.create({
        product: product._id,
        purchasePrice,
        sellingPrice: masterPrice,
        purchasePriceSource,
        lastPurchaseDate,
        lastPurchaseSupplier,
        isActive: true,
        createdBy: req.user?._id || null
      });
      
      createdCount++;
      results.push({
        productId: product._id,
        productName: product.itemName,
        productCode: product.productCode,
        masterPrice,
        purchasePrice,
        sellingPrice: masterPrice,
        source: purchasePriceSource
      });
      
      console.log(`✅ Created pricing for ${product.itemName}: Purchase ₹${purchasePrice}, Selling ₹${masterPrice} (${purchasePriceSource})`);
    }
    
    console.log(`🎉 Auto-created ${createdCount} missing pricing records`);
    
    res.json({
      success: true,
      message: `Auto-created ${createdCount} missing pricing records`,
      createdCount,
      results
    });
    
  } catch (error) {
    console.error('Auto-create missing pricing records error:', error);
    res.status(500).json({
      success: false,
      message: 'Error auto-creating missing pricing records',
      error: error.message
    });
  }
};

// @desc    Auto-sync system for new products (called when new product is created)
// @route   POST /api/dealer-pricing/auto-sync-new-product
// @access  Private
export const autoSyncNewProduct = async (req, res) => {
  try {
    const { DealerPricing, Product, PurchaseOrder, DiscountMapping } = getModels(req.dbConnection);
    const { productId } = req.body;
    
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }
    
    console.log(`🆕 Auto-syncing new product: ${productId}`);
    
    // Get the product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    // Check if pricing record already exists
    let pricing = await DealerPricing.findOne({ product: productId, isActive: true });
    
    if (pricing) {
      return res.json({
        success: true,
        message: 'Pricing record already exists',
        data: pricing
      });
    }
    
    // Get selling price from rate slabs
    const sellingPrice = product.rateSlabs && product.rateSlabs.length > 0
      ? product.rateSlabs[0].rate
      : 0;
    
    if (sellingPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Product has no valid rate slab price'
      });
    }
    
    // Create new pricing record with both purchase and selling price from Product Master
    pricing = new DealerPricing({
      product: productId,
      purchasePrice: sellingPrice, // Initially set to same as selling price from Product Master
      sellingPrice,
      purchasePriceSource: 'product_master',
      isActive: true,
      createdBy: req.user?._id || null
    });
    
    // Update discount information
    await pricing.updateAllDiscountInfo();
    
    // Enable auto-sync
    pricing.purchasePriceSource = 'auto_sync_enabled';
    
    // Save the record
    await pricing.save();
    
    // Log initial price setting
    try {
      await DealerPricingHistory.logPriceChange({
        product: productId,
        oldPrice: 0,
        newPrice: sellingPrice,
        changeType: 'manual',
        changeMethod: 'direct_update',
        reason: 'Auto-created pricing record for new product from Product Master',
        changedBy: req.user?._id || null
      });
      console.log(`📊 Initial price history logged: ${productId} - ₹0 → ₹${sellingPrice}`);
    } catch (historyError) {
      console.error('Error logging initial price history:', historyError);
      // Don't fail the main operation if history logging fails
    }
    
    console.log(`✅ Auto-created pricing record for new product: ${product.itemName} - ₹${sellingPrice}`);
    
    res.json({
      success: true,
      message: 'Auto-sync completed for new product',
      data: pricing
    });
    
  } catch (error) {
    console.error('Auto-sync new product error:', error);
    res.status(500).json({
      success: false,
      message: 'Error in auto-sync for new product',
      error: error.message
    });
  }
};