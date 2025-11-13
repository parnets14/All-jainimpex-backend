import ProductRecommendation from '../models/ProductRecommendation.js';
import Dealer from '../models/Dealer.js';
import Product from '../models/Product.js';

// Get all recommendations
export const getAllRecommendations = async (req, res) => {
  try {
    const { dealerId, status, page = 1, limit = 50 } = req.query;
    
    const filter = {};
    if (dealerId) filter.dealer = dealerId;
    if (status) filter.status = status;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const recommendations = await ProductRecommendation.find(filter)
      .populate('dealer', 'name code')
      .populate('product', 'itemName productCode')
      .populate('createdBy', 'name')
      .sort({ priority: 1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await ProductRecommendation.countDocuments(filter);
    
    res.json({
      success: true,
      recommendations,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total
      }
    });
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recommendations',
      error: error.message
    });
  }
};

// Create recommendation
export const createRecommendation = async (req, res) => {
  try {
    const { dealerId, productId, reason, priority, suggestedAction, validUntil, notes } = req.body;
    
    // Validate dealer and product
    const [dealer, product] = await Promise.all([
      Dealer.findById(dealerId),
      Product.findById(productId)
    ]);
    
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    const recommendation = await ProductRecommendation.create({
      dealer: dealerId,
      product: productId,
      productName: product.itemName,
      productCode: product.productCode,
      reason,
      priority: priority || 3,
      suggestedAction: suggestedAction || 'Introduce',
      validUntil,
      notes,
      createdBy: req.user._id
    });
    
    const populated = await ProductRecommendation.findById(recommendation._id)
      .populate('dealer', 'name code')
      .populate('product', 'itemName productCode')
      .populate('createdBy', 'name');
    
    res.status(201).json({
      success: true,
      recommendation: populated
    });
  } catch (error) {
    console.error('Create recommendation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create recommendation',
      error: error.message
    });
  }
};

// Update recommendation
export const updateRecommendation = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const recommendation = await ProductRecommendation.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    )
      .populate('dealer', 'name code')
      .populate('product', 'itemName productCode')
      .populate('createdBy', 'name');
    
    if (!recommendation) {
      return res.status(404).json({
        success: false,
        message: 'Recommendation not found'
      });
    }
    
    res.json({
      success: true,
      recommendation
    });
  } catch (error) {
    console.error('Update recommendation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update recommendation',
      error: error.message
    });
  }
};

// Delete recommendation
export const deleteRecommendation = async (req, res) => {
  try {
    const { id } = req.params;
    
    const recommendation = await ProductRecommendation.findByIdAndDelete(id);
    
    if (!recommendation) {
      return res.status(404).json({
        success: false,
        message: 'Recommendation not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Recommendation deleted successfully'
    });
  } catch (error) {
    console.error('Delete recommendation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete recommendation',
      error: error.message
    });
  }
};

// Mark as completed
export const markAsCompleted = async (req, res) => {
  try {
    const { id } = req.params;
    
    const recommendation = await ProductRecommendation.findByIdAndUpdate(
      id,
      {
        status: 'Completed',
        completedAt: new Date()
      },
      { new: true }
    )
      .populate('dealer', 'name code')
      .populate('product', 'itemName productCode');
    
    if (!recommendation) {
      return res.status(404).json({
        success: false,
        message: 'Recommendation not found'
      });
    }
    
    res.json({
      success: true,
      recommendation
    });
  } catch (error) {
    console.error('Mark completed error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark as completed',
      error: error.message
    });
  }
};

// Dismiss recommendation
export const dismissRecommendation = async (req, res) => {
  try {
    const { id } = req.params;
    
    const recommendation = await ProductRecommendation.findByIdAndUpdate(
      id,
      {
        status: 'Dismissed',
        dismissedAt: new Date(),
        dismissedBy: req.user._id
      },
      { new: true }
    )
      .populate('dealer', 'name code')
      .populate('product', 'itemName productCode');
    
    if (!recommendation) {
      return res.status(404).json({
        success: false,
        message: 'Recommendation not found'
      });
    }
    
    res.json({
      success: true,
      recommendation
    });
  } catch (error) {
    console.error('Dismiss recommendation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to dismiss recommendation',
      error: error.message
    });
  }
};
