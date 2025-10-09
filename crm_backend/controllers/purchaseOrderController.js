// purchaseOrderController.js - Updated with performance improvements
import PurchaseOrder from '../models/PurchaseOrder.js';
import Product from '../models/Product.js';
import Supplier from '../models/Supplier.js';
import Warehouse from '../models/Warehouse.js';

// Generate PO Number
const generatePONumber = async () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  const lastPO = await PurchaseOrder.findOne().sort({ createdAt: -1 });
  let sequence = 1;
  
  if (lastPO && lastPO.poNumber) {
    const lastSequence = parseInt(lastPO.poNumber.split('-').pop());
    sequence = lastSequence + 1;
  }
  
  return `PO-${year}${month}${day}-${String(sequence).padStart(3, '0')}`;
};

// Create Purchase Order
export const createPurchaseOrder = async (req, res) => {
  try {
    console.log('📝 [START] Creating purchase order');
    
    const {
      supplierId,
      warehouseId,
      expectedDate,
      paymentTermsDays,
      billingAddress,
      shippingAddress,
      lines,
      notes
    } = req.body;

    console.log('📝 [DATA] Received data:', { 
      supplierId, 
      warehouseId, 
      linesCount: lines?.length 
    });

    // Validate required fields
    if (!supplierId || !warehouseId || !expectedDate || !lines || lines.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Supplier, warehouse, expected date, and at least one product line are required'
      });
    }

    // Validate supplier exists
    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found'
      });
    }

    // Validate warehouse exists
    const warehouse = await Warehouse.findById(warehouseId);
    if (!warehouse) {
      return res.status(404).json({
        success: false,
        message: 'Warehouse not found'
      });
    }

    // Validate products exist
    for (const line of lines) {
      const product = await Product.findById(line.productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product not found: ${line.productId}`
        });
      }
      
      // Set default values for new fields if not provided
      line.lastPrice = line.lastPrice || product.lastPurchasedPrice || 0;
      line.currentPrice = line.currentPrice || product.currentPrice || 0;
      line.last30DayPurchaseQuantity = line.last30DayPurchaseQuantity || product.last30dPurchasedQty || 0;
    }

    // Generate PO number
    const poNumber = await generatePONumber();
    console.log('📝 [PO_NUMBER] Generated:', poNumber);

    // Create purchase order
    const purchaseOrder = new PurchaseOrder({
      poNumber,
      supplierId,
      warehouseId,
      orderDate: new Date(),
      expectedDate,
      paymentTermsDays: paymentTermsDays || 30,
      billingAddress,
      shippingAddress,
      lines,
      notes,
      createdBy: req.user._id
    });

    await purchaseOrder.save();
    console.log('📝 [SAVED] Purchase order saved with ID:', purchaseOrder._id);

    // Populate with minimal fields for performance
    const populatedPO = await PurchaseOrder.findById(purchaseOrder._id)
      .populate('supplierId', 'name email gstin contactPerson')
      .populate('warehouseId', 'name address contact')
      .populate('lines.productId', 'itemName productCode HSNCode description gst')
      .populate('createdBy', 'name email');

    console.log('📝 [COMPLETE] Purchase order created successfully');

    res.status(201).json({
      success: true,
      message: 'Purchase order created successfully',
      data: populatedPO
    });

  } catch (error) {
    console.error('❌ [ERROR] Create purchase order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating purchase order',
      error: error.message
    });
  }
};

// Get All Purchase Orders - Optimized version
export const getPurchaseOrders = async (req, res) => {
  try {
    console.log('📦 [START] Getting purchase orders');
    
    const {
      page = 1,
      limit = 50, // Reduced limit for better performance
      search,
      status,
      supplierId,
      warehouseId,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};

    // Search
    if (search) {
      query.poNumber = { $regex: search, $options: 'i' };
    }

    // Filter by status
    if (status && status !== 'all') {
      query.status = status;
    }

    // Filter by supplier
    if (supplierId) {
      query.supplierId = supplierId;
    }

    // Filter by warehouse
    if (warehouseId) {
      query.warehouseId = warehouseId;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.orderDate = {};
      if (startDate) query.orderDate.$gte = new Date(startDate);
      if (endDate) query.orderDate.$lte = new Date(endDate);
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    console.log('📦 [QUERY] Executing with filter:', JSON.stringify(query));

    // Use lean for better performance with selective population
    const purchaseOrders = await PurchaseOrder.find(query)
      .populate('supplierId', 'name email gstin contactPerson')
      .populate('warehouseId', 'name address contact')
      .populate('lines.productId', 'itemName productCode HSNCode description gst')
      .populate('createdBy', 'name email')
      .sort(sort)
      .limit(Number(limit))
      .skip((page - 1) * limit)
      .lean();

    console.log('📦 [RESULT] Found', purchaseOrders.length, 'purchase orders');

    const total = await PurchaseOrder.countDocuments(query);

    console.log('📦 [COMPLETE] Sending response');

    res.json({
      success: true,
      data: purchaseOrders,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        pages: Math.ceil(total / limit),
        totalRecords: total
      }
    });

  } catch (error) {
    console.error('❌ [ERROR] Get purchase orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching purchase orders',
      error: error.message
    });
  }
};

// Update Purchase Order
export const updatePurchaseOrder = async (req, res) => {
  try {
    console.log('🔄 [START] Updating purchase order:', req.params.id);
    
    const {
      supplierId,
      warehouseId,
      expectedDate,
      paymentTermsDays,
      billingAddress,
      shippingAddress,
      lines,
      status,
      notes
    } = req.body;

    const purchaseOrder = await PurchaseOrder.findById(req.params.id);

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        message: 'Purchase order not found'
      });
    }

    // Validate supplier if provided
    if (supplierId) {
      const supplier = await Supplier.findById(supplierId);
      if (!supplier) {
        return res.status(404).json({
          success: false,
          message: 'Supplier not found'
        });
      }
      purchaseOrder.supplierId = supplierId;
    }

    // Validate warehouse if provided
    if (warehouseId) {
      const warehouse = await Warehouse.findById(warehouseId);
      if (!warehouse) {
        return res.status(404).json({
          success: false,
          message: 'Warehouse not found'
        });
      }
      purchaseOrder.warehouseId = warehouseId;
    }

    // Update fields
    if (expectedDate) purchaseOrder.expectedDate = expectedDate;
    if (paymentTermsDays) purchaseOrder.paymentTermsDays = paymentTermsDays;
    if (billingAddress) purchaseOrder.billingAddress = billingAddress;
    if (shippingAddress) purchaseOrder.shippingAddress = shippingAddress;
    if (status) purchaseOrder.status = status;
    if (notes !== undefined) purchaseOrder.notes = notes;

    // Update lines if provided
    if (lines) {
      // Validate products in lines and set default values
      for (const line of lines) {
        const product = await Product.findById(line.productId);
        if (!product) {
          return res.status(404).json({
            success: false,
            message: `Product not found: ${line.productId}`
          });
        }
        
        // Set default values for new fields
        line.lastPrice = line.lastPrice || product.lastPurchasedPrice || 0;
        line.currentPrice = line.currentPrice || product.currentPrice || 0;
        line.last30DayPurchaseQuantity = line.last30DayPurchaseQuantity || product.last30dPurchasedQty || 0;
      }
      purchaseOrder.lines = lines;
    }

    await purchaseOrder.save();
    console.log('🔄 [SAVED] Purchase order updated');

    const updatedPO = await PurchaseOrder.findById(purchaseOrder._id)
      .populate('supplierId', 'name email gstin contactPerson')
      .populate('warehouseId', 'name address contact')
      .populate('lines.productId', 'itemName productCode HSNCode description gst');

    console.log('🔄 [COMPLETE] Purchase order updated successfully');

    res.json({
      success: true,
      message: 'Purchase order updated successfully',
      data: updatedPO
    });

  } catch (error) {
    console.error('❌ [ERROR] Update purchase order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating purchase order',
      error: error.message
    });
  }
};

// Other controller methods remain the same...
export const getPurchaseOrderById = async (req, res) => {
  try {
    console.log('🔍 [START] Getting purchase order by ID:', req.params.id);
    
    const purchaseOrder = await PurchaseOrder.findById(req.params.id)
      .populate('supplierId', 'name email gstin contactPerson address')
      .populate('warehouseId', 'name address contact')
      .populate('lines.productId', 'itemName productCode HSNCode description gst rateSlabs')
      .populate('createdBy', 'name email');

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        message: 'Purchase order not found'
      });
    }

    console.log('🔍 [COMPLETE] Found purchase order');

    res.json({
      success: true,
      data: purchaseOrder
    });

  } catch (error) {
    console.error('❌ [ERROR] Get purchase order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching purchase order',
      error: error.message
    });
  }
};

// Delete Purchase Order
export const deletePurchaseOrder = async (req, res) => {
  try {
    console.log('🗑️ [START] Deleting purchase order:', req.params.id);
    
    const purchaseOrder = await PurchaseOrder.findById(req.params.id);

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        message: 'Purchase order not found'
      });
    }

    // Prevent deletion of approved or completed POs
    if (['Approved', 'Completed'].includes(purchaseOrder.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete approved or completed purchase orders'
      });
    }

    await PurchaseOrder.findByIdAndDelete(req.params.id);

    console.log('🗑️ [COMPLETE] Purchase order deleted');

    res.json({
      success: true,
      message: 'Purchase order deleted successfully'
    });

  } catch (error) {
    console.error('❌ [ERROR] Delete purchase order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting purchase order',
      error: error.message
    });
  }
};

// Update Purchase Order Status
export const updatePurchaseOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const purchaseOrder = await PurchaseOrder.findById(req.params.id);

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        message: 'Purchase order not found'
      });
    }

    purchaseOrder.status = status;
    await purchaseOrder.save();

    res.json({
      success: true,
      message: 'Purchase order status updated successfully',
      data: purchaseOrder
    });

  } catch (error) {
    console.error('Update purchase order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating purchase order status',
      error: error.message
    });
  }
};

// Get Purchase Order Statistics
export const getPurchaseOrderStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.orderDate = {};
      if (startDate) dateFilter.orderDate.$gte = new Date(startDate);
      if (endDate) dateFilter.orderDate.$lte = new Date(endDate);
    }

    const stats = await PurchaseOrder.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalValue: { $sum: '$total' }
        }
      }
    ]);

    const totalStats = await PurchaseOrder.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalValue: { $sum: '$total' },
          averageOrderValue: { $avg: '$total' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        statusStats: stats,
        totalStats: totalStats[0] || { totalOrders: 0, totalValue: 0, averageOrderValue: 0 }
      }
    });

  } catch (error) {
    console.error('Get purchase order stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching purchase order statistics',
      error: error.message
    });
  }
};