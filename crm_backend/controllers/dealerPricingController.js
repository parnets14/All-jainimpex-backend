import DealerPricing from '../models/DealerPricing.js';
import Product from '../models/Product.js';
import PurchaseOrder from '../models/PurchaseOrder.js';

// @desc    Get all dealer pricing records
// @route   GET /api/dealer-pricing
// @access  Private
export const getDealerPricing = async (req, res) => {
  try {
    const { page = 1, limit = 50, search, productId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = { isActive: true };
    
    if (productId) {
      filter.product = productId;
    }

    if (search) {
      // Search in product name via populate
      const products = await Product.find({
        $or: [
          { itemName: { $regex: search, $options: 'i' } },
          { productCode: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      
      filter.product = { $in: products.map(p => p._id) };
    }

    const pricingRecords = await DealerPricing.find(filter)
      .populate('product', 'itemName productCode brand category subcategory')
      .populate('lastPurchaseSupplier', 'name companyName')
      .populate('createdBy', 'name email')
      .sort({ updatedAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await DealerPricing.countDocuments(filter);

    res.json({
      success: true,
      data: pricingRecords,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalRecords: total,
        hasNext: skip + pricingRecords.length < total,
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



