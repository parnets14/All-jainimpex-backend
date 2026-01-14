import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Subcategory from '../models/Subcategory.js';
import ExtendedSubcategory from '../models/ExtendedSubcategory.js';
import Brand from '../models/Brand.js';
import GRN from '../models/GRN.js';

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
      subcategory1,
      subcategory2,
      subcategory3,
      subcategory4,
      subcategory5,
      brand,
      status,
      salesType,
      productType
    } = req.query;

    const filter = {};

    // Enhanced search filter - searches across multiple fields
    if (search) {
      // First, try to find matching categories, subcategories, and brands by name
      const [matchingCategories, matchingSubcategories, matchingBrands, matchingExtended1, matchingExtended2, matchingExtended3, matchingExtended4, matchingExtended5] = await Promise.all([
        Category.find({ name: { $regex: search, $options: 'i' } }).select('_id'),
        Subcategory.find({ name: { $regex: search, $options: 'i' } }).select('_id'),
        Brand.find({ name: { $regex: search, $options: 'i' } }).select('_id'),
        ExtendedSubcategory.find({ name: { $regex: search, $options: 'i' }, level: 1 }).select('_id'),
        ExtendedSubcategory.find({ name: { $regex: search, $options: 'i' }, level: 2 }).select('_id'),
        ExtendedSubcategory.find({ name: { $regex: search, $options: 'i' }, level: 3 }).select('_id'),
        ExtendedSubcategory.find({ name: { $regex: search, $options: 'i' }, level: 4 }).select('_id'),
        ExtendedSubcategory.find({ name: { $regex: search, $options: 'i' }, level: 5 }).select('_id')
      ]);

      const categoryIds = matchingCategories.map(c => c._id);
      const subcategoryIds = matchingSubcategories.map(s => s._id);
      const brandIds = matchingBrands.map(b => b._id);
      const extended1Ids = matchingExtended1.map(e => e._id);
      const extended2Ids = matchingExtended2.map(e => e._id);
      const extended3Ids = matchingExtended3.map(e => e._id);
      const extended4Ids = matchingExtended4.map(e => e._id);
      const extended5Ids = matchingExtended5.map(e => e._id);

      filter.$or = [
        { productCode: { $regex: search, $options: 'i' } },
        { itemName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { HSNCode: { $regex: search, $options: 'i' } },
        ...(categoryIds.length > 0 ? [{ category: { $in: categoryIds } }] : []),
        ...(subcategoryIds.length > 0 ? [{ subcategory: { $in: subcategoryIds } }] : []),
        ...(brandIds.length > 0 ? [{ brand: { $in: brandIds } }] : []),
        ...(extended1Ids.length > 0 ? [{ subcategory1: { $in: extended1Ids } }] : []),
        ...(extended2Ids.length > 0 ? [{ subcategory2: { $in: extended2Ids } }] : []),
        ...(extended3Ids.length > 0 ? [{ subcategory3: { $in: extended3Ids } }] : []),
        ...(extended4Ids.length > 0 ? [{ subcategory4: { $in: extended4Ids } }] : []),
        ...(extended5Ids.length > 0 ? [{ subcategory5: { $in: extended5Ids } }] : [])
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

    // Extended subcategory filters
    if (subcategory1) {
      filter.subcategory1 = subcategory1;
    }
    if (subcategory2) {
      filter.subcategory2 = subcategory2;
    }
    if (subcategory3) {
      filter.subcategory3 = subcategory3;
    }
    if (subcategory4) {
      filter.subcategory4 = subcategory4;
    }
    if (subcategory5) {
      filter.subcategory5 = subcategory5;
    }

    // Brand filter
    if (brand) {
      filter.brand = brand;
    }

    // Status filter
    if (status) {
      filter.status = status;
    }

    // Sales Type filter
    if (salesType) {
      filter.salesType = salesType;
    }

    // Product Type filter
    if (productType) {
      filter.productType = productType;
    }

    const products = await Product.find(filter)
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('subcategory1', 'name')
      .populate('subcategory2', 'name')
      .populate('subcategory3', 'name')
      .populate('subcategory4', 'name')
      .populate('subcategory5', 'name')
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
      .populate('subcategory1', 'name description')
      .populate('subcategory2', 'name description')
      .populate('subcategory3', 'name description')
      .populate('subcategory4', 'name description')
      .populate('subcategory5', 'name description')
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
      unitPrice,
      gst,
      brand,
      category,
      subcategory,
      subcategory1,
      subcategory2,
      subcategory3,
      subcategory4,
      subcategory5,
      rateSlabs,
      minStockLevel,
      images,
      salesType,      // FIX: Added missing salesType
      productType     // FIX: Added missing productType
    } = req.body;

    // Convert empty productCode to undefined for auto-generation
    const finalProductCode = productCode && productCode.trim() !== '' ? productCode : undefined;

    // Check if product code already exists
    if (finalProductCode) {
      const existingProduct = await Product.findOne({ productCode: finalProductCode });
      if (existingProduct) {
        return res.status(400).json({
          success: false,
          message: 'Product code already exists'
        });
      }
    }

    // Validate required relationships
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

    // Validate extended subcategories if provided
    const extendedSubcategories = [subcategory1, subcategory2, subcategory3, subcategory4, subcategory5];
    for (let i = 0; i < extendedSubcategories.length; i++) {
      if (extendedSubcategories[i]) {
        const extSubcat = await ExtendedSubcategory.findById(extendedSubcategories[i]);
        if (!extSubcat) {
          return res.status(400).json({
            success: false,
            message: `Extended subcategory ${i + 1} not found`
          });
        }
        
        // Verify it belongs to the correct category and subcategory
        if (extSubcat.category.toString() !== category || extSubcat.subcategory.toString() !== subcategory) {
          return res.status(400).json({
            success: false,
            message: `Extended subcategory ${i + 1} does not belong to the selected category and subcategory`
          });
        }
      }
    }

    const product = new Product({
      productCode: finalProductCode,
      HSNCode,
      itemName,
      description,
      unit,
      alternateUnit,
      unitPrice,
      gst,
      brand,
      category,
      subcategory,
      subcategory1: subcategory1 || undefined,
      subcategory2: subcategory2 || undefined,
      subcategory3: subcategory3 || undefined,
      subcategory4: subcategory4 || undefined,
      subcategory5: subcategory5 || undefined,
      minStockLevel,
      rateSlabs,
      images: Array.isArray(images) ? images : [],
      salesType: salesType || 'Regular Sale',      // FIX: Include salesType with default
      productType: productType || 'Regular Product', // FIX: Include productType with default
      createdBy: req.user._id
    });
    
    console.log('📸 Creating product with images:', product.images);

    await product.save();

    // Populate the saved product
    await product.populate([
      { path: 'category', select: 'name' },
      { path: 'subcategory', select: 'name' },
      { path: 'subcategory1', select: 'name' },
      { path: 'subcategory2', select: 'name' },
      { path: 'subcategory3', select: 'name' },
      { path: 'subcategory4', select: 'name' },
      { path: 'subcategory5', select: 'name' },
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
      unitPrice,
      gst,
      brand,
      category,
      subcategory,
      subcategory1,
      subcategory2,
      subcategory3,
      subcategory4,
      subcategory5,
      rateSlabs,
      status,
      minStockLevel,
      images,
      salesType,      // FIX: Added missing salesType
      productType     // FIX: Added missing productType
    } = req.body;

    // Convert empty productCode to undefined for auto-generation
    const finalProductCode = productCode && productCode.trim() !== '' ? productCode : undefined;

    let product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if product code already exists (excluding current product)
    if (finalProductCode && finalProductCode !== product.productCode) {
      const existingProduct = await Product.findOne({ productCode: finalProductCode });
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

    // Update product fields
    product.productCode = finalProductCode;
    product.HSNCode = HSNCode;
    product.itemName = itemName;
    product.description = description;
    product.unit = unit;
    product.alternateUnit = alternateUnit;
    product.unitPrice = unitPrice;
    product.gst = gst;
    product.brand = brand;
    product.category = category;
    product.subcategory = subcategory;
    product.subcategory1 = subcategory1 || undefined;
    product.subcategory2 = subcategory2 || undefined;
    product.subcategory3 = subcategory3 || undefined;
    product.subcategory4 = subcategory4 || undefined;
    product.subcategory5 = subcategory5 || undefined;
    product.minStockLevel = minStockLevel;
    product.rateSlabs = rateSlabs;
    product.status = status;
    
    // FIX: Update salesType and productType
    if (salesType !== undefined) {
      product.salesType = salesType;
    }
    if (productType !== undefined) {
      product.productType = productType;
    }
    
    // Update images if provided
    if (images !== undefined) {
      product.images = Array.isArray(images) ? images : [];
      console.log('📸 Updating product images:', {
        count: product.images.length,
        images: product.images,
        productId: product._id,
        productCode: product.productCode
      });
    } else {
      console.log('⚠️ Images field not provided in request body');
    }

    // Save the product to trigger pre-save hooks
    await product.save();

    // Populate the updated product
    await product.populate([
      { path: 'category', select: 'name' },
      { path: 'subcategory', select: 'name' },
      { path: 'subcategory1', select: 'name' },
      { path: 'subcategory2', select: 'name' },
      { path: 'subcategory3', select: 'name' },
      { path: 'subcategory4', select: 'name' },
      { path: 'subcategory5', select: 'name' },
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

// @desc    Upload product image
// @route   POST /api/products/upload-image
// @access  Private
export const uploadProductImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    // Return the image URL
    const imageUrl = `/uploads/${req.file.filename}`;

    res.status(200).json({
      success: true,
      message: 'Image uploaded successfully',
      url: imageUrl,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Upload product image error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while uploading image'
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

    // Calculate low stock items using same logic as Stock Management page
    // The Stock Management page counts individual warehouse entries, not unique products
    const products = await Product.find({});
    let lowStockCount = 0;
    const lowStockDetails = [];

    for (const product of products) {
      // Get all GRNs for this product
      const grns = await GRN.find({ 'items.productId': product._id });
      
      // Group by warehouse (same as Stock Management page)
      const warehouseStock = {};
      
      grns.forEach(grn => {
        if (!grn.warehouseId) return;
        
        const warehouseId = grn.warehouseId.toString();
        
        if (!warehouseStock[warehouseId]) {
          warehouseStock[warehouseId] = {
            totalQty: 0,
            damagedQty: 0,
            blockedQty: 0
          };
        }
        
        grn.items.forEach(item => {
          const itemProductId = item.productId?._id ? item.productId._id.toString() : item.productId.toString();
          const targetProductId = product._id.toString();
          
          if (itemProductId === targetProductId) {
            warehouseStock[warehouseId].totalQty += item.acceptedQuantity || 0;
            warehouseStock[warehouseId].damagedQty += item.damageQuantity || 0;
            // Note: blockedQty is not in GRN data, so it stays 0
          }
        });
      });

      // Check each warehouse entry for low stock (same as Stock Management page)
      Object.values(warehouseStock).forEach(warehouse => {
        const netStock = warehouse.totalQty - warehouse.damagedQty - warehouse.blockedQty;
        
        if (product.minStockLevel && netStock <= product.minStockLevel) {
          lowStockCount++;
          lowStockDetails.push({
            productId: product._id,
            productName: product.itemName,
            totalQty: warehouse.totalQty,
            damagedQty: warehouse.damagedQty,
            blockedQty: warehouse.blockedQty,
            netStock: netStock,
            minStockLevel: product.minStockLevel
          });
        }
      });
    }

    console.log('Low stock calculation:', {
      lowStockCount,
      lowStockDetails,
      totalProducts,
      activeProducts
    });

    res.json({
      success: true,
      data: {
        totalProducts,
        activeProducts,
        inactiveProducts,
        lowStockItems: lowStockCount,
        lowStock: lowStockCount, // Alternative key for compatibility
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

// @desc    Export products to PDF
// @route   GET /api/products/export/pdf
// @access  Private
export const exportProductsToPDF = async (req, res) => {
  try {
    const { search, category, subcategory, brand, status } = req.query;

    const filter = {};

    // Apply same filters as getProducts
    if (search) {
      filter.$or = [
        { productCode: { $regex: search, $options: 'i' } },
        { itemName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (category) filter.category = category;
    if (subcategory) filter.subcategory = subcategory;
    if (brand) filter.brand = brand;
    if (status) filter.status = status;

    const products = await Product.find(filter)
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('brand', 'name')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    // Create PDF content
    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument({ margin: 50 });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=products-${new Date().toISOString().split('T')[0]}.pdf`);

    // Pipe PDF to response
    doc.pipe(res);

    // Add title
    doc.fontSize(20).text('Product Master Report', { align: 'center' });
    doc.fontSize(12).text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown();

    // Add summary
    doc.fontSize(14).text(`Total Products: ${products.length}`, { align: 'left' });
    doc.moveDown();

    // Add table headers
    const tableTop = doc.y;
    const itemCodeX = 50;
    const itemNameX = 150;
    const categoryX = 300;
    const brandX = 400;
    const unitX = 480;
    const statusX = 520;

    doc.fontSize(10)
       .text('Code', itemCodeX, tableTop)
       .text('Name', itemNameX, tableTop)
       .text('Category', categoryX, tableTop)
       .text('Brand', brandX, tableTop)
       .text('Unit', unitX, tableTop)
       .text('Status', statusX, tableTop);

    // Draw header line
    doc.moveTo(itemCodeX, tableTop + 15)
       .lineTo(570, tableTop + 15)
       .stroke();

    let currentY = tableTop + 25;

    // Add product rows
    products.forEach((product, index) => {
      if (currentY > 700) { // Start new page if needed
        doc.addPage();
        currentY = 50;
      }

      doc.fontSize(8)
         .text(product.productCode || 'N/A', itemCodeX, currentY)
         .text(product.itemName.substring(0, 20) + (product.itemName.length > 20 ? '...' : ''), itemNameX, currentY)
         .text(product.category?.name || 'N/A', categoryX, currentY)
         .text(product.brand?.name || 'N/A', brandX, currentY)
         .text(product.unit || 'N/A', unitX, currentY)
         .text(product.status || 'N/A', statusX, currentY);

      currentY += 20;
    });

    // Finalize PDF
    doc.end();

  } catch (error) {
    console.error('Export PDF error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while exporting PDF'
    });
  }
};

// @desc    Export products to Excel
// @route   GET /api/products/export/excel
// @access  Private
export const exportProductsToExcel = async (req, res) => {
  try {
    const { search, category, subcategory, brand, status } = req.query;

    const filter = {};

    // Apply same filters as getProducts
    if (search) {
      filter.$or = [
        { productCode: { $regex: search, $options: 'i' } },
        { itemName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (category) filter.category = category;
    if (subcategory) filter.subcategory = subcategory;
    if (brand) filter.brand = brand;
    if (status) filter.status = status;

    const products = await Product.find(filter)
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('subcategory1', 'name')
      .populate('subcategory2', 'name')
      .populate('subcategory3', 'name')
      .populate('subcategory4', 'name')
      .populate('subcategory5', 'name')
      .populate('brand', 'name')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Products');

    // Set column headers
    worksheet.columns = [
      { header: 'Product Code', key: 'productCode', width: 15 },
      { header: 'HSN Code', key: 'hsnCode', width: 12 },
      { header: 'Item Name', key: 'itemName', width: 30 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Subcategory', key: 'subcategory', width: 20 },
      { header: 'Extended Level 1', key: 'subcategory1', width: 20 },
      { header: 'Extended Level 2', key: 'subcategory2', width: 20 },
      { header: 'Extended Level 3', key: 'subcategory3', width: 20 },
      { header: 'Brand', key: 'brand', width: 20 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Alternate Unit', key: 'alternateUnit', width: 15 },
      { header: 'GST (%)', key: 'gst', width: 10 },
      { header: 'Min Stock Level', key: 'minStockLevel', width: 15 },
      { header: 'Total Amount', key: 'totalAmount', width: 15 },
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Created Date', key: 'createdAt', width: 15 },
      { header: 'Created By', key: 'createdBy', width: 20 }
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6F3FF' }
    };

    // Add data rows
    products.forEach(product => {
      worksheet.addRow({
        productCode: product.productCode || '',
        hsnCode: product.HSNCode || '',
        itemName: product.itemName || '',
        description: product.description || '',
        category: product.category?.name || '',
        subcategory: product.subcategory?.name || '',
        subcategory1: product.subcategory1?.name || '',
        subcategory2: product.subcategory2?.name || '',
        subcategory3: product.subcategory3?.name || '',
        brand: product.brand?.name || '',
        unit: product.unit || '',
        alternateUnit: product.alternateUnit || '',
        gst: product.gst || 0,
        minStockLevel: product.minStockLevel || 0,
        totalAmount: product.totalAmount || 0,
        status: product.status || '',
        createdAt: product.createdAt ? new Date(product.createdAt).toLocaleDateString() : '',
        createdBy: product.createdBy?.name || ''
      });
    });

    // Add summary row
    worksheet.addRow({});
    worksheet.addRow({
      productCode: 'SUMMARY',
      itemName: `Total Products: ${products.length}`,
      category: `Generated: ${new Date().toLocaleDateString()}`
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=products-${new Date().toISOString().split('T')[0]}.xlsx`);

    // Write to response
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Export Excel error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while exporting Excel'
    });
  }
};

// @desc    Get products by category hierarchy
// @route   GET /api/products/category-hierarchy/:categoryHierarchyId
// @access  Private
export const getProductsByCategoryHierarchy = async (req, res) => {
  try {
    const products = await Product.find({ categoryHierarchy: req.params.categoryHierarchyId })
      .populate('categoryHierarchy', 'name level')
      .populate('brand', 'name')
      .sort({ itemName: 1 });

    res.json({
      success: true,
      products
    });
  } catch (error) {
    console.error('Get products by category hierarchy error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching products by category hierarchy'
    });
  }
};

// @desc    Get products by brand
// @route   GET /api/products/brand/:brandId
// @access  Private
export const getProductsByBrand = async (req, res) => {
  try {
    const products = await Product.find({ brand: req.params.brandId })
      .populate('categoryHierarchy', 'name level')
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