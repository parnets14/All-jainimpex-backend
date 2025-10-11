import GRN from '../models/GRN.js';
import PurchaseOrder from '../models/PurchaseOrder.js';
import StockMovementService from '../services/stockMovementService.js';

export const createGRN = async (req, res) => {
  try {
    const {
      poId,
      warehouseId,
      items,
      remarks,
      receivedBy,
      inspectedBy
    } = req.body;

    console.log('Creating GRN with data:', { poId, warehouseId, items });

    // Validate PO exists and is approved
    const purchaseOrder = await PurchaseOrder.findById(poId)
      .populate('supplierId')
      .populate('lines.productId');

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        message: 'Purchase Order not found'
      });
    }

    if (purchaseOrder.status !== 'Approved') {
      return res.status(400).json({
        success: false,
        message: 'Only approved Purchase Orders can be used for GRN'
      });
    }

    // Calculate totals and validate quantities
    let totalAmount = 0;
    const grnItems = [];

    for (const item of items) {
      const poLine = purchaseOrder.lines.find(
        line => line.productId._id.toString() === item.productId
      );

      if (!poLine) {
        return res.status(400).json({
          success: false,
          message: `Product not found in Purchase Order: ${item.productId}`
        });
      }

      // Check if received quantity exceeds PO quantity
      const existingGRNs = await GRN.find({ poId });
      const totalReceived = existingGRNs.reduce((sum, grn) => {
        const grnItem = grn.items.find(gi => 
          gi.productId && gi.productId.toString() === item.productId
        );
        return sum + (grnItem ? grnItem.receivedQuantity : 0);
      }, 0);

      const remainingQuantity = poLine.quantity - totalReceived;
      
      if (item.receivedQuantity > remainingQuantity) {
        return res.status(400).json({
          success: false,
          message: `Received quantity (${item.receivedQuantity}) for product ${poLine.productId.itemName} exceeds remaining PO quantity (${remainingQuantity})`
        });
      }

      const acceptedQuantity = item.receivedQuantity - (item.damageQuantity || 0);
      const itemTotal = acceptedQuantity * poLine.price * (1 + poLine.gst / 100);

      grnItems.push({
        productId: item.productId,
        poQuantity: poLine.quantity,
        receivedQuantity: item.receivedQuantity,
        damageQuantity: item.damageQuantity || 0,
        acceptedQuantity,
        unitPrice: poLine.price,
        gst: poLine.gst,
        totalPrice: itemTotal
      });

      totalAmount += itemTotal;
    }

    // Generate GRN number in controller (alternative approach)
    const generateGRNNumber = async () => {
      try {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const dateString = `${year}${month}${day}`;
        
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);
        
        const todayGRNs = await GRN.find({
          createdAt: {
            $gte: startOfDay,
            $lte: endOfDay
          }
        }).sort({ grnNo: -1 }).limit(1);
        
        let sequence = 1;
        if (todayGRNs.length > 0) {
          const lastGRN = todayGRNs[0];
          const lastSequence = parseInt(lastGRN.grnNo.split('-').pop());
          if (!isNaN(lastSequence)) {
            sequence = lastSequence + 1;
          }
        }
        
        return `GRN-${dateString}-${String(sequence).padStart(3, '0')}`;
      } catch (error) {
        console.error('Error generating GRN number in controller:', error);
        return `GRN-ALT-${Date.now()}`;
      }
    };

    const grnNo = await generateGRNNumber();
    console.log('Generated GRN No in controller:', grnNo);

    const grnData = {
      grnNo, // Explicitly set the GRN number
      poId,
      supplierId: purchaseOrder.supplierId._id,
      warehouseId,
      items: grnItems,
      totalAmount,
      remarks: remarks || '',
      receivedBy: receivedBy || '',
      inspectedBy: inspectedBy || '',
      createdBy: req.user._id,
      status: 'Received'
    };

    console.log('GRN data to save:', grnData);

    const grn = new GRN(grnData);
    await grn.save();
    
    // Create stock movements for this GRN
    try {
      await StockMovementService.createStockMovementsFromGRN(grn);
      console.log(`✅ Stock movements created for GRN: ${grn.grnNo}`);
    } catch (stockError) {
      console.error('Error creating stock movements:', stockError);
      // Don't fail the GRN creation if stock movement creation fails
    }
    
    // Populate the saved GRN for response
    const populatedGRN = await GRN.findById(grn._id)
      .populate('poId', 'poNumber')
      .populate('supplierId', 'name companyName')
      .populate('warehouseId', 'name location')
      .populate('items.productId', 'itemName productCode HSNCode')
      .populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'GRN created successfully',
      data: populatedGRN
    });
  } catch (error) {
    console.error('Create GRN error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getGRNs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      status = '',
      startDate,
      endDate,
      supplierId,
      warehouseId
    } = req.query;

    const query = {};

    // Search filter
    if (search) {
      query.$or = [
        { grnNo: { $regex: search, $options: 'i' } },
        { 'poId.poNumber': { $regex: search, $options: 'i' } }
      ];
    }

    // Status filter
    if (status && status !== 'all') {
      query.status = status;
    }

    // Date range filter
    if (startDate || endDate) {
      query.grnDate = {};
      if (startDate) query.grnDate.$gte = new Date(startDate);
      if (endDate) query.grnDate.$lte = new Date(endDate);
    }

    // Supplier filter
    if (supplierId) {
      query.supplierId = supplierId;
    }

    // Warehouse filter
    if (warehouseId) {
      query.warehouseId = warehouseId;
    }

    // Manual pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get GRNs with population
    const grns = await GRN.find(query)
      .populate('poId', 'poNumber')
      .populate('supplierId', 'name companyName')
      .populate('warehouseId', 'name location')
      .populate('items.productId', 'itemName productCode')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Get total count
    const totalRecords = await GRN.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / limitNum);

    res.json({
      success: true,
      data: grns,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
        limit: limitNum
      }
    });
  } catch (error) {
    console.error('Get GRNs error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ... keep other controller functions the same
export const getGRN = async (req, res) => {
  try {
    const grn = await GRN.findById(req.params.id)
      .populate('poId')
      .populate('supplierId')
      .populate('warehouseId')
      .populate('items.productId')
      .populate('createdBy', 'name email');

    if (!grn) {
      return res.status(404).json({
        success: false,
        message: 'GRN not found'
      });
    }

    res.json({
      success: true,
      data: grn
    });
  } catch (error) {
    console.error('Get GRN error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const updateGRN = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const grn = await GRN.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('poId')
      .populate('supplierId')
      .populate('warehouseId')
      .populate('items.productId')
      .populate('createdBy', 'name email');

    if (!grn) {
      return res.status(404).json({
        success: false,
        message: 'GRN not found'
      });
    }

    res.json({
      success: true,
      message: 'GRN updated successfully',
      data: grn
    });
  } catch (error) {
    console.error('Update GRN error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const deleteGRN = async (req, res) => {
  try {
    const grn = await GRN.findByIdAndDelete(req.params.id);

    if (!grn) {
      return res.status(404).json({
        success: false,
        message: 'GRN not found'
      });
    }

    res.json({
      success: true,
      message: 'GRN deleted successfully'
    });
  } catch (error) {
    console.error('Delete GRN error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getGRNStats = async (req, res) => {
  try {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    const [
      totalGRNs,
      monthlyGRNs,
      yearlyGRNs,
      statusCounts
    ] = await Promise.all([
      GRN.countDocuments(),
      GRN.countDocuments({ createdAt: { $gte: startOfMonth } }),
      GRN.countDocuments({ createdAt: { $gte: startOfYear } }),
      GRN.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    const totalValue = await GRN.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: '$totalAmount' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        totalGRNs,
        monthlyGRNs,
        yearlyGRNs,
        statusCounts,
        totalValue: totalValue[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Get GRN stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getApprovedPOs = async (req, res) => {
  try {
    const { search = '' } = req.query;

    console.log('Searching approved POs with:', search);

    const query = {
      status: 'Approved'
    };

    // Add search condition if search term exists
    if (search.trim()) {
      query.$or = [
        { poNumber: { $regex: search, $options: 'i' } },
        { 'supplierId.name': { $regex: search, $options: 'i' } },
        { 'supplierId.companyName': { $regex: search, $options: 'i' } }
      ];
    }

    const purchaseOrders = await PurchaseOrder.find(query)
      .populate('supplierId', 'name companyName contactPerson email')
      .populate('warehouseId', 'name location')
      .populate('lines.productId', 'itemName productCode HSNCode description gst')
      .select('poNumber supplierId warehouseId lines orderDate expectedDate status')
      .sort({ createdAt: -1 })
      .limit(20);

    console.log(`Found ${purchaseOrders.length} approved POs`);

    res.json({
      success: true,
      data: purchaseOrders
    });
  } catch (error) {
    console.error('Get approved POs error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};