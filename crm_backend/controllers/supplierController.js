// controllers/supplierController.js
import Supplier from "../models/Supplier.js";
import SchemeType from "../models/SchemeType.js";
import PaymentTerm from "../models/PaymentTerm.js";

// Generate supplier code
const generateSupplierCode = async (companyName) => {
  if (!companyName) return "";
  
  const words = companyName.split(' ');
  let initials = '';
  
  if (words.length === 1) {
    initials = words[0].substring(0, 2).toUpperCase();
  } else {
    initials = words.map(word => word[0]).join('').toUpperCase();
    if (initials.length > 2) {
      initials = initials.substring(0, 2);
    }
  }
  
  // Find the next sequential number
  const existingCodes = await Supplier.find({ code: new RegExp(`^${initials}\\d+$`) })
    .select('code')
    .lean();
  
  let nextNum = 1;
  while (existingCodes.some(supplier => supplier.code === `${initials}${nextNum.toString().padStart(3, '0')}`)) {
    nextNum++;
  }
  
  return `${initials}${nextNum.toString().padStart(3, '0')}`;
};

// Get all suppliers with filters
export const getSuppliers = async (req, res) => {
  try {
    const {
      search,
      status,
      schemeType,
      paymentTerm,
      page = 1,
      limit = 10
    } = req.query;

    let filter = {};

    // Search filter
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { gstin: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } },
        { companyName: { $regex: search, $options: 'i' } }
      ];
    }

    // Status filter
    if (status !== undefined) {
      filter.isActive = status === 'true';
    }

    // Scheme type filter
    if (schemeType) {
      filter.schemeTypeId = schemeType;
    }

    // Payment terms filter
    if (paymentTerm) {
      filter.paymentTermId = paymentTerm;
    }

    const skip = (page - 1) * limit;

    const suppliers = await Supplier.find(filter)
      .populate('schemeTypeId', 'name code')
      .populate('paymentTermId', 'name days code')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Supplier.countDocuments(filter);

    res.json({
      success: true,
      data: suppliers,
      pagination: {
        current: parseInt(page),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get suppliers error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching suppliers',
      error: error.message
    });
  }
};

// Get supplier by ID
export const getSupplierById = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id)
      .populate('schemeTypeId', 'name code')
      .populate('paymentTermId', 'name days code');

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found'
      });
    }

    res.json({
      success: true,
      data: supplier
    });
  } catch (error) {
    console.error('Get supplier error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching supplier',
      error: error.message
    });
  }
};

// Create new supplier
export const createSupplier = async (req, res) => {
  try {
    const {
      name,
      companyName,
      gstin,
      contactPerson,
      phone,
      phone2,
      email,
      address,
      schemeTypeId,
      paymentTermId,
      customPaymentTerm,
      creditDays = 30,
      bankName,
      accountNumber,
      ifscCode,
      isActive = true,
      extraDiscounts = []
    } = req.body;

    // Generate supplier code
    const code = await generateSupplierCode(companyName);

    // Check if supplier with same GSTIN already exists (if GSTIN provided)
    if (gstin) {
      const existingSupplier = await Supplier.findOne({ gstin });
      if (existingSupplier) {
        return res.status(400).json({
          success: false,
          message: 'Supplier with this GSTIN already exists'
        });
      }
    }

    const supplier = new Supplier({
      code,
      name,
      companyName,
      gstin,
      contactPerson,
      phone,
      phone2,
      email,
      address,
      schemeTypeId,
      paymentTermId,
      customPaymentTerm,
      creditDays,
      bankName,
      accountNumber,
      ifscCode,
      isActive,
      extraDiscounts,
      createdBy: req.user._id
    });

    await supplier.save();

    const populatedSupplier = await Supplier.findById(supplier._id)
      .populate('schemeTypeId', 'name code')
      .populate('paymentTermId', 'name days code');

    res.status(201).json({
      success: true,
      message: 'Supplier created successfully',
      data: populatedSupplier
    });
  } catch (error) {
    console.error('Create supplier error:', error);
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating supplier',
      error: error.message
    });
  }
};

// Update supplier
export const updateSupplier = async (req, res) => {
  try {
    const {
      name,
      companyName,
      gstin,
      contactPerson,
      phone,
      phone2,
      email,
      address,
      schemeTypeId,
      paymentTermId,
      customPaymentTerm,
      creditDays,
      bankName,
      accountNumber,
      ifscCode,
      isActive,
      extraDiscounts
    } = req.body;

    const supplier = await Supplier.findById(req.params.id);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found'
      });
    }

    // Check if GSTIN is being changed and if it already exists
    if (gstin && gstin !== supplier.gstin) {
      const existingSupplier = await Supplier.findOne({ gstin });
      if (existingSupplier) {
        return res.status(400).json({
          success: false,
          message: 'Supplier with this GSTIN already exists'
        });
      }
    }

    // Update fields
    Object.assign(supplier, {
      name,
      companyName,
      gstin,
      contactPerson,
      phone,
      phone2,
      email,
      address,
      schemeTypeId,
      paymentTermId,
      customPaymentTerm,
      ...(creditDays !== undefined && { creditDays }),
      bankName,
      accountNumber,
      ifscCode,
      isActive,
      ...(extraDiscounts !== undefined && { extraDiscounts })
    });

    await supplier.save();

    const updatedSupplier = await Supplier.findById(supplier._id)
      .populate('schemeTypeId', 'name code')
      .populate('paymentTermId', 'name days code');

    res.json({
      success: true,
      message: 'Supplier updated successfully',
      data: updatedSupplier
    });
  } catch (error) {
    console.error('Update supplier error:', error);
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error updating supplier',
      error: error.message
    });
  }
};

// Delete supplier
export const deleteSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found'
      });
    }

    await Supplier.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Supplier deleted successfully'
    });
  } catch (error) {
    console.error('Delete supplier error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting supplier',
      error: error.message
    });
  }
};

// Get supplier dashboard stats
export const getSupplierStats = async (req, res) => {
  try {
    const total = await Supplier.countDocuments();
    const active = await Supplier.countDocuments({ isActive: true });
    const inactive = await Supplier.countDocuments({ isActive: false });
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentlyAdded = await Supplier.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });

    res.json({
      success: true,
      data: {
        total,
        active,
        inactive,
        recentlyAdded
      }
    });
  } catch (error) {
    console.error('Get supplier stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching supplier stats',
      error: error.message
    });
  }
};