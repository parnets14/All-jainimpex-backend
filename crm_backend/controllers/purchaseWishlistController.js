import PurchaseWishlist from '../models/PurchaseWishlist.js';
import Product from '../models/Product.js';

// Get all purchase wishlists for the current user
const getPurchaseWishlists = async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const userId = req.user._id;

    // Fix the isActive parsing - if no query param is provided, default to true
    const isActiveValue = req.query.isActive !== undefined ? req.query.isActive === 'true' : true;

    const query = { 
      createdBy: userId,
      isActive: isActiveValue
    };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const wishlists = await PurchaseWishlist.find(query)
      .populate({
        path: 'items.productId',
        select: 'productCode itemName description basePrice currentPrice gst rateSlabs brandId categoryId subcategoryId brandName categoryName subcategoryName',
        model: 'Product'
      })
      .populate('createdBy', 'name email')
      .sort({ lastUpdated: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await PurchaseWishlist.countDocuments(query);

    // Transform the data to include product details in items
    const transformedWishlists = wishlists.map(wishlist => ({
      ...wishlist.toObject(),
      items: wishlist.items.map(item => ({
        ...item.toObject(),
        product: item.productId
      }))
    }));

    res.json({
      success: true,
      data: transformedWishlists,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalRecords: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching purchase wishlists:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch purchase wishlists',
      error: error.message
    });
  }
};

// Get a specific purchase wishlist
const getPurchaseWishlist = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const wishlist = await PurchaseWishlist.findOne({
      _id: id,
      createdBy: userId,
      isActive: true
    })
      .populate({
        path: 'items.productId',
        select: 'productCode itemName description basePrice currentPrice gst rateSlabs brandId categoryId subcategoryId brandName categoryName subcategoryName supplier',
        model: 'Product'
      })
      .populate('createdBy', 'name email');

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    // Transform the data
    const transformedWishlist = {
      ...wishlist.toObject(),
      items: wishlist.items.map(item => ({
        ...item.toObject(),
        product: item.productId
      }))
    };

    res.json({
      success: true,
      data: transformedWishlist
    });
  } catch (error) {
    console.error('Error fetching purchase wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch purchase wishlist',
      error: error.message
    });
  }
};

// Create a new purchase wishlist
const createPurchaseWishlist = async (req, res) => {
  try {
    const { name, description, items = [], tags = [] } = req.body;
    const userId = req.user._id;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Wishlist name is required'
      });
    }

    // Check if wishlist with same name already exists for this user
    const existingWishlist = await PurchaseWishlist.findOne({
      name: name.trim(),
      createdBy: userId,
      isActive: true
    });

    if (existingWishlist) {
      return res.status(400).json({
        success: false,
        message: 'A wishlist with this name already exists'
      });
    }

    // Validate product IDs if items are provided
    if (items.length > 0) {
      const productIds = items.map(item => item.productId);
      const validProducts = await Product.find({ _id: { $in: productIds } });
      
      if (validProducts.length !== productIds.length) {
        return res.status(400).json({
          success: false,
          message: 'Some products are invalid'
        });
      }
    }

    // Calculate estimated cost (basic calculation)
    let totalEstimatedCost = 0;
    if (items.length > 0) {
      const productIds = items.map(item => item.productId);
      const products = await Product.find({ _id: { $in: productIds } });
      
      totalEstimatedCost = items.reduce((total, item) => {
        const product = products.find(p => p._id.toString() === item.productId);
        if (product && product.basePrice) {
          return total + (product.basePrice * item.requestedQuantity);
        }
        return total;
      }, 0);
    }

    const wishlist = new PurchaseWishlist({
      name: name.trim(),
      description: description?.trim() || '',
      createdBy: userId,
      items: items.map(item => ({
        productId: item.productId,
        requestedQuantity: item.requestedQuantity || 1,
        notes: item.notes || '',
        priority: item.priority || 'normal'
      })),
      tags: tags.filter(tag => tag && tag.trim()),
      totalEstimatedCost
    });

    await wishlist.save();

    // Populate the created wishlist
    const populatedWishlist = await PurchaseWishlist.findById(wishlist._id)
      .populate({
        path: 'items.productId',
        select: 'productCode itemName description basePrice currentPrice gst rateSlabs brandId categoryId subcategoryId brandName categoryName subcategoryName',
        model: 'Product'
      })
      .populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'Purchase wishlist created successfully',
      data: populatedWishlist
    });
  } catch (error) {
    console.error('Error creating purchase wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create purchase wishlist',
      error: error.message
    });
  }
};

// Update a purchase wishlist
const updatePurchaseWishlist = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, tags } = req.body;
    const userId = req.user._id;

    const wishlist = await PurchaseWishlist.findOne({
      _id: id,
      createdBy: userId,
      isActive: true
    });

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    // Check if new name conflicts with existing wishlist
    if (name && name.trim() !== wishlist.name) {
      const existingWishlist = await PurchaseWishlist.findOne({
        name: name.trim(),
        createdBy: userId,
        isActive: true,
        _id: { $ne: id }
      });

      if (existingWishlist) {
        return res.status(400).json({
          success: false,
          message: 'A wishlist with this name already exists'
        });
      }
    }

    // Update fields
    if (name) wishlist.name = name.trim();
    if (description !== undefined) wishlist.description = description.trim();
    if (tags) wishlist.tags = tags.filter(tag => tag && tag.trim());

    await wishlist.save();

    // Populate the updated wishlist
    const populatedWishlist = await PurchaseWishlist.findById(wishlist._id)
      .populate({
        path: 'items.productId',
        select: 'productCode itemName description basePrice currentPrice gst rateSlabs brandId categoryId subcategoryId brandName categoryName subcategoryName',
        model: 'Product'
      })
      .populate('createdBy', 'name email');

    res.json({
      success: true,
      message: 'Purchase wishlist updated successfully',
      data: populatedWishlist
    });
  } catch (error) {
    console.error('Error updating purchase wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update purchase wishlist',
      error: error.message
    });
  }
};

// Delete a purchase wishlist (soft delete)
const deletePurchaseWishlist = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const wishlist = await PurchaseWishlist.findOne({
      _id: id,
      createdBy: userId,
      isActive: true
    });

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    wishlist.isActive = false;
    await wishlist.save();

    res.json({
      success: true,
      message: 'Purchase wishlist deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting purchase wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete purchase wishlist',
      error: error.message
    });
  }
};

// Add items to wishlist
const addItemsToWishlist = async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;
    const userId = req.user._id;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Items array is required'
      });
    }

    const wishlist = await PurchaseWishlist.findOne({
      _id: id,
      createdBy: userId,
      isActive: true
    });

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    // Validate product IDs
    const productIds = items.map(item => item.productId);
    const validProducts = await Product.find({ _id: { $in: productIds } });
    
    if (validProducts.length !== productIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some products are invalid'
      });
    }

    // Add items (avoid duplicates)
    const existingProductIds = wishlist.items.map(item => item.productId.toString());
    const newItems = items.filter(item => !existingProductIds.includes(item.productId));

    if (newItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'All products are already in the wishlist'
      });
    }

    wishlist.items.push(...newItems.map(item => ({
      productId: item.productId,
      requestedQuantity: item.requestedQuantity || 1,
      notes: item.notes || '',
      priority: item.priority || 'normal'
    })));

    // Recalculate estimated cost
    const allProductIds = wishlist.items.map(item => item.productId);
    const products = await Product.find({ _id: { $in: allProductIds } });
    
    wishlist.totalEstimatedCost = wishlist.items.reduce((total, item) => {
      const product = products.find(p => p._id.toString() === item.productId.toString());
      if (product && product.basePrice) {
        return total + (product.basePrice * item.requestedQuantity);
      }
      return total;
    }, 0);

    await wishlist.save();

    // Populate the updated wishlist
    const populatedWishlist = await PurchaseWishlist.findById(wishlist._id)
      .populate({
        path: 'items.productId',
        select: 'productCode itemName description basePrice currentPrice gst rateSlabs brandId categoryId subcategoryId brandName categoryName subcategoryName',
        model: 'Product'
      })
      .populate('createdBy', 'name email');

    res.json({
      success: true,
      message: `${newItems.length} item(s) added to wishlist successfully`,
      data: populatedWishlist
    });
  } catch (error) {
    console.error('Error adding items to wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add items to wishlist',
      error: error.message
    });
  }
};

// Remove item from wishlist
const removeItemFromWishlist = async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const userId = req.user._id;

    const wishlist = await PurchaseWishlist.findOne({
      _id: id,
      createdBy: userId,
      isActive: true
    });

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    const itemIndex = wishlist.items.findIndex(item => item._id.toString() === itemId);
    
    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in wishlist'
      });
    }

    wishlist.items.splice(itemIndex, 1);

    // Recalculate estimated cost
    if (wishlist.items.length > 0) {
      const productIds = wishlist.items.map(item => item.productId);
      const products = await Product.find({ _id: { $in: productIds } });
      
      wishlist.totalEstimatedCost = wishlist.items.reduce((total, item) => {
        const product = products.find(p => p._id.toString() === item.productId.toString());
        if (product && product.basePrice) {
          return total + (product.basePrice * item.requestedQuantity);
        }
        return total;
      }, 0);
    } else {
      wishlist.totalEstimatedCost = 0;
    }

    await wishlist.save();

    res.json({
      success: true,
      message: 'Item removed from wishlist successfully'
    });
  } catch (error) {
    console.error('Error removing item from wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove item from wishlist',
      error: error.message
    });
  }
};

// Update wishlist item
const updateWishlistItem = async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { requestedQuantity, notes, priority } = req.body;
    const userId = req.user._id;

    const wishlist = await PurchaseWishlist.findOne({
      _id: id,
      createdBy: userId,
      isActive: true
    });

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    const item = wishlist.items.find(item => item._id.toString() === itemId);
    
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in wishlist'
      });
    }

    // Update item fields
    if (requestedQuantity !== undefined) item.requestedQuantity = requestedQuantity;
    if (notes !== undefined) item.notes = notes;
    if (priority !== undefined) item.priority = priority;

    // Recalculate estimated cost
    const productIds = wishlist.items.map(item => item.productId);
    const products = await Product.find({ _id: { $in: productIds } });
    
    wishlist.totalEstimatedCost = wishlist.items.reduce((total, item) => {
      const product = products.find(p => p._id.toString() === item.productId.toString());
      if (product && product.basePrice) {
        return total + (product.basePrice * item.requestedQuantity);
      }
      return total;
    }, 0);

    await wishlist.save();

    res.json({
      success: true,
      message: 'Wishlist item updated successfully'
    });
  } catch (error) {
    console.error('Error updating wishlist item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update wishlist item',
      error: error.message
    });
  }
};

export {
  getPurchaseWishlists,
  getPurchaseWishlist,
  createPurchaseWishlist,
  updatePurchaseWishlist,
  deletePurchaseWishlist,
  addItemsToWishlist,
  removeItemFromWishlist,
  updateWishlistItem
};