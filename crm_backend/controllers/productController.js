import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Subcategory from '../models/Subcategory.js';
import Brand from '../models/Brand.js';

// @desc    Get all products
// @route   GET /api/products
// @access  Private
export const getProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      category,
      subcategory,
      brand,
      status
    } = req.query;

    const filter = {};

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

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      populate: [
        { path: 'category', select: 'name' },
        { path: 'subcategory', select: 'name' },
        { path: 'brand', select: 'name' },
        { path: 'createdBy', select: 'name email' }
      ]
    };

    const products = await Product.find(filter)
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('brand', 'name')
      .populate('createdBy', 'name email')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Product.countDocuments(filter);

    res.json({
      success: true,
      products,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching products'
    });
  }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Private
export const getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name description')
      .populate('subcategory', 'name description')
      .populate('brand', 'name description')
      .populate('createdBy', 'name email');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      product
    });
  } catch (error) {
    console.error('Get product error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while fetching product'
    });
  }
};

// @desc    Create product
// @route   POST /api/products
// @access  Private
export const createProduct = async (req, res) => {
  try {
    const {
      productCode,
      HSNCode,
      itemName,
      description,
      unit,
      alternateUnit,
      gst,
      brand,
      category,
      subcategory,
      minStockLevel,
      rateSlabs
    } = req.body;

    // Check if product code already exists
    if (productCode) {
      const existingProduct = await Product.findOne({ productCode });
      if (existingProduct) {
        return res.status(400).json({
          success: false,
          message: 'Product code already exists'
        });
      }
    }

    // Validate category, subcategory, and brand relationships
    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      return res.status(400).json({
        success: false,
        message: 'Category not found'
      });
    }

    const subcategoryExists = await Subcategory.findById(subcategory);
    if (!subcategoryExists) {
      return res.status(400).json({
        success: false,
        message: 'Subcategory not found'
      });
    }

    const brandExists = await Brand.findById(brand);
    if (!brandExists) {
      return res.status(400).json({
        success: false,
        message: 'Brand not found'
      });
    }

    // Verify subcategory belongs to category
    if (subcategoryExists.category.toString() !== category) {
      return res.status(400).json({
        success: false,
        message: 'Subcategory does not belong to the selected category'
      });
    }

    // Verify brand belongs to subcategory
    if (brandExists.subcategory.toString() !== subcategory) {
      return res.status(400).json({
        success: false,
        message: 'Brand does not belong to the selected subcategory'
      });
    }

    const product = new Product({
      productCode,
      HSNCode,
      itemName,
      description,
      unit,
      alternateUnit,
      gst,
      brand,
      category,
      subcategory,
      minStockLevel,
      rateSlabs,
      createdBy: req.user._id
    });

    await product.save();

    // Populate the saved product
    await product.populate([
      { path: 'category', select: 'name' },
      { path: 'subcategory', select: 'name' },
      { path: 'brand', select: 'name' },
      { path: 'createdBy', select: 'name email' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    console.error('Create product error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while creating product'
    });
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private
export const updateProduct = async (req, res) => {
  try {
    const {
      productCode,
      HSNCode,
      itemName,
      description,
      unit,
      alternateUnit,
      gst,
      brand,
      category,
      subcategory,
      minStockLevel,
      rateSlabs,
      status
    } = req.body;

    let product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if product code already exists (excluding current product)
    if (productCode && productCode !== product.productCode) {
      const existingProduct = await Product.findOne({ productCode });
      if (existingProduct) {
        return res.status(400).json({
          success: false,
          message: 'Product code already exists'
        });
      }
    }

    // Validate relationships if category, subcategory, or brand are being updated
    if (category) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        return res.status(400).json({
          success: false,
          message: 'Category not found'
        });
      }
    }

    if (subcategory) {
      const subcategoryExists = await Subcategory.findById(subcategory);
      if (!subcategoryExists) {
        return res.status(400).json({
          success: false,
          message: 'Subcategory not found'
        });
      }

      // Verify subcategory belongs to category
      if (category && subcategoryExists.category.toString() !== category) {
        return res.status(400).json({
          success: false,
          message: 'Subcategory does not belong to the selected category'
        });
      }
    }

    if (brand) {
      const brandExists = await Brand.findById(brand);
      if (!brandExists) {
        return res.status(400).json({
          success: false,
          message: 'Brand not found'
        });
      }

      // Verify brand belongs to subcategory
      if (subcategory && brandExists.subcategory.toString() !== subcategory) {
        return res.status(400).json({
          success: false,
          message: 'Brand does not belong to the selected subcategory'
        });
      }
    }

    // Update product
    product = await Product.findByIdAndUpdate(
      req.params.id,
      {
        productCode,
        HSNCode,
        itemName,
        description,
        unit,
        alternateUnit,
        gst,
        brand,
        category,
        subcategory,
        minStockLevel,
        rateSlabs,
        status
      },
      {
        new: true,
        runValidators: true
      }
    ).populate([
      { path: 'category', select: 'name' },
      { path: 'subcategory', select: 'name' },
      { path: 'brand', select: 'name' },
      { path: 'createdBy', select: 'name email' }
    ]);

    res.json({
      success: true,
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error('Update product error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while updating product'
    });
  }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private
export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    await Product.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Delete product error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while deleting product'
    });
  }
};

// @desc    Get product statistics
// @route   GET /api/products/stats
// @access  Private
export const getProductStats = async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();
    const activeProducts = await Product.countDocuments({ status: 'active' });
    const inactiveProducts = await Product.countDocuments({ status: 'inactive' });

    // Products by category
    const productsByCategory = await Product.aggregate([
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'category'
        }
      },
      {
        $unwind: '$category'
      },
      {
        $group: {
          _id: '$category.name',
          count: { $sum: 1 }
        }
      }
    ]);

    // Products by brand
    const productsByBrand = await Product.aggregate([
      {
        $lookup: {
          from: 'brands',
          localField: 'brand',
          foreignField: '_id',
          as: 'brand'
        }
      },
      {
        $unwind: '$brand'
      },
      {
        $group: {
          _id: '$brand.name',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      stats: {
        totalProducts,
        activeProducts,
        inactiveProducts,
        productsByCategory,
        productsByBrand
      }
    });
  } catch (error) {
    console.error('Get product stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching product statistics'
    });
  }
};

// @desc    Get products by category
// @route   GET /api/products/category/:categoryId
// @access  Private
export const getProductsByCategory = async (req, res) => {
  try {
    const products = await Product.find({ category: req.params.categoryId })
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('brand', 'name')
      .sort({ itemName: 1 });

    res.json({
      success: true,
      products
    });
  } catch (error) {
    console.error('Get products by category error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching products by category'
    });
  }
};

// @desc    Get products by brand
// @route   GET /api/products/brand/:brandId
// @access  Private
export const getProductsByBrand = async (req, res) => {
  try {
    const products = await Product.find({ brand: req.params.brandId })
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('brand', 'name')
      .sort({ itemName: 1 });

    res.json({
      success: true,
      products
    });
  } catch (error) {
    console.error('Get products by brand error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching products by brand'
    });
  }
};