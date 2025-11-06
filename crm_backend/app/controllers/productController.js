import Product from '../../models/Product.js';
import Category from '../../models/Category.js';
import Brand from '../../models/Brand.js';
import Dealer from '../../models/Dealer.js';
import DiscountMapping from '../../models/DiscountMapping.js';
import DealerPricing from '../../models/DealerPricing.js';

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

        // Get dealer-specific discount
        const discountMapping = await DiscountMapping.findOne({
          dealerCategory: { $in: dealer.dealerCategory },
          product: product._id
        });

        // Apply discount if exists
        if (discountMapping && discountMapping.discountPercentage > 0) {
          dealerPrice = dealerPrice * (1 - discountMapping.discountPercentage / 100);
        }

        return {
          ...product.toObject(),
          mrp: Math.round(mrp * 100) / 100,
          dealerPrice: Math.round(dealerPrice * 100) / 100,
          purchasePrice: dealerPricing?.purchasePrice || 0,
          hasOffer: discountMapping ? true : false,
          offerText: discountMapping ? discountMapping.description : null
        };
      })
    );

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

    // Get dealer-specific discount
    const discountMapping = await DiscountMapping.findOne({
      dealerCategory: { $in: dealer.dealerCategory },
      product: product._id
    });

    // Apply discount if exists
    if (discountMapping && discountMapping.discountPercentage > 0) {
      dealerPrice = dealerPrice * (1 - discountMapping.discountPercentage / 100);
    }

    res.json({
      success: true,
      product: {
        ...product.toObject(),
        mrp: Math.round(mrp * 100) / 100,
        dealerPrice: Math.round(dealerPrice * 100) / 100,
        purchasePrice: dealerPricing?.purchasePrice || 0,
        hasOffer: discountMapping ? true : false,
        offerText: discountMapping ? discountMapping.description : null
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

