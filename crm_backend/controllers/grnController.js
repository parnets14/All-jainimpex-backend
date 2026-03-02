import GRN from '../models/GRN.js';
import PurchaseOrder from '../models/PurchaseOrder.js';
import StockMovementService from '../services/stockMovementService.js';
import schemeService from '../services/schemeService.js';
import Counter from '../models/Counter.js';
import mongoose from 'mongoose';

// Atomic GRN number generation using Counter model
const generateGRNNumber = async () => {
  try {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateString = `${year}${month}${day}`;
    
    // Use atomic counter to prevent race conditions
    const sequence = await Counter.getNextSequence(`grn-${dateString}`);
    
    return `GRN-${dateString}-${String(sequence).padStart(3, '0')}`;
  } catch (error) {
    console.error('Error generating GRN number:', error);
    // Fallback: use timestamp
    return `GRN-${Date.now()}`;
  }
};

// Validate GRN quantities
const validateGRNQuantities = (items) => {
  for (const item of items) {
    if (!item.receivedQuantity || item.receivedQuantity <= 0) {
      throw new Error(`Received quantity must be greater than 0 for product ${item.productId}`);
    }
    
    if (item.damageQuantity < 0) {
      throw new Error(`Damage quantity cannot be negative for product ${item.productId}`);
    }
    
    if (item.damageQuantity > item.receivedQuantity) {
      throw new Error(`Damage quantity (${item.damageQuantity}) cannot exceed received quantity (${item.receivedQuantity}) for product ${item.productId}`);
    }
    
    const acceptedQty = item.receivedQuantity - (item.damageQuantity || 0);
    if (acceptedQty < 0) {
      throw new Error(`Accepted quantity cannot be negative for product ${item.productId}`);
    }
  }
};

// Function to check and fulfill pending out-of-stock orders when stock becomes available
const fulfillPendingOutOfStockOrders = async (grn, session) => {
  try {
    console.log(`🔍 Checking for pending out-of-stock orders to fulfill for GRN: ${grn.grnNo}`);
    
    // Import SalesOrder model
    const SalesOrder = (await import('../models/SalesOrder.js')).default;
    
    // Get all pending out-of-stock orders
    const pendingOrders = await SalesOrder.find({
      isOutOfStock: true,
      status: "Pending"
    }).session(session);
    
    console.log(`📊 Found ${pendingOrders.length} pending out-of-stock orders`);
    
    if (pendingOrders.length === 0) {
      return;
    }
    
    // Check each GRN item against pending orders
    for (const grnItem of grn.items) {
      const productId = grnItem.productId.toString();
      const warehouseId = grn.warehouseId.toString();
      const availableQuantity = grnItem.acceptedQuantity;
      
      console.log(`🔍 Checking product ${productId} in warehouse ${warehouseId}: ${availableQuantity} units available`);
      
      // Find pending orders for this product
      const relevantOrders = pendingOrders.filter(order => 
        order.products.some(product => 
          product.product.toString() === productId && 
          (product.warehouse === null || product.warehouse.toString() === warehouseId)
        )
      );
      
      if (relevantOrders.length === 0) {
        console.log(`   ℹ️ No pending orders found for this product`);
        continue;
      }
      
      console.log(`   📋 Found ${relevantOrders.length} pending orders for this product`);
      
      let remainingStock = availableQuantity;
      const fulfilledOrders = [];
      
      // Try to fulfill orders (FIFO - first in, first out)
      for (const order of relevantOrders.sort((a, b) => new Date(a.orderDate) - new Date(b.orderDate))) {
        const orderProduct = order.products.find(product => 
          product.product.toString() === productId
        );
        
        if (!orderProduct) continue;
        
        const requiredQuantity = orderProduct.quantity;
        
        if (remainingStock >= requiredQuantity) {
          // Can fulfill this order completely
          console.log(`   ✅ Can fulfill order ${order.orderNumber}: ${requiredQuantity} units`);
          
          // Update the order to assign warehouse and mark as ready
          orderProduct.warehouse = grn.warehouseId;
          orderProduct.warehouseName = grn.warehouseId.name || 'Assigned Warehouse';
          
          // Mark order as no longer out-of-stock
          order.isOutOfStock = false;
          order.stockValidation = []; // Clear stock validation
          
          // Save the order
          await order.save({ session });
          
          fulfilledOrders.push({
            orderNumber: order.orderNumber,
            quantity: requiredQuantity
          });
          
          remainingStock -= requiredQuantity;
        } else if (remainingStock > 0) {
          // Can partially fulfill this order
          console.log(`   ⚠️ Can only partially fulfill order ${order.orderNumber}: ${remainingStock}/${requiredQuantity} units`);
          // For now, we don't handle partial fulfillment - could be added later
        } else {
          // No more stock available
          console.log(`   ❌ No more stock available for order ${order.orderNumber}`);
          break;
        }
      }
      
      if (fulfilledOrders.length > 0) {
        console.log(`   🎉 Fulfilled ${fulfilledOrders.length} orders for product ${productId}:`);
        fulfilledOrders.forEach(order => {
          console.log(`     - ${order.orderNumber}: ${order.quantity} units`);
        });
      }
    }
    
    console.log(`✅ Completed pending order fulfillment check for GRN: ${grn.grnNo}`);
  } catch (error) {
    console.error('Error in fulfillPendingOutOfStockOrders:', error);
    throw error;
  }
};

export const createGRN = async (req, res) => {
  // Start MongoDB session for transaction
  const session = await mongoose.startSession();
  
  try {
    // Start transaction
    await session.startTransaction();
    
    const {
      poId,
      warehouseId,
      items,
      remarks,
      receivedBy,
      inspectedBy
    } = req.body;

    console.log('Creating GRN with data:', { poId, warehouseId, items });

    // Validate quantities first
    validateGRNQuantities(items);

    // Validate PO exists and is approved
    const purchaseOrder = await PurchaseOrder.findById(poId)
      .populate('supplierId')
      .populate('lines.productId')
      .session(session);

    if (!purchaseOrder) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Purchase Order not found'
      });
    }

    if (purchaseOrder.status !== 'Approved') {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Only approved Purchase Orders can be used for GRN. Current status: ${purchaseOrder.status}`
      });
    }

    // Calculate totals and validate quantities with cumulative tracking
    let totalAmount = 0;
    const grnItems = [];

    for (const item of items) {
      const poLine = purchaseOrder.lines.find(
        line => line.productId._id.toString() === item.productId
      );

      if (!poLine) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Product not found in Purchase Order: ${item.productId}`
        });
      }

      // Check cumulative received quantity across all GRNs
      const existingGRNs = await GRN.find({ poId }).session(session);
      const totalReceived = existingGRNs.reduce((sum, grn) => {
        const grnItem = grn.items.find(gi => 
          gi.productId && gi.productId.toString() === item.productId
        );
        return sum + (grnItem ? grnItem.receivedQuantity : 0);
      }, 0);

      const remainingQuantity = poLine.quantity - totalReceived;
      
      // Allow receiving more than ordered quantity (supplier may send extra)
      // No validation check - accept whatever quantity is received
      
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

    // Generate GRN number using atomic counter
    const grnNo = await generateGRNNumber();
    console.log('Generated GRN No:', grnNo);

    // Determine GRN status based on received quantities
    let grnStatus = 'Received'; // Default to fully received
    let hasShortage = false;
    let hasOverage = false;
    
    // Check each item for deviations
    for (const item of grnItems) {
      if (item.acceptedQuantity < item.poQuantity) {
        hasShortage = true;
      }
      if (item.acceptedQuantity > item.poQuantity) {
        hasOverage = true;
      }
    }
    
    // Set status based on deviations
    if (hasShortage && hasOverage) {
      grnStatus = 'Partially Received'; // Mixed: some short, some over
    } else if (hasShortage) {
      grnStatus = 'Partially Received'; // Some items short
    } else if (hasOverage) {
      grnStatus = 'Received'; // All received (some extra) - still mark as received
    }
    // else: grnStatus remains 'Received' (all exact match)

    const grnData = {
      grnNo,
      poId,
      supplierId: purchaseOrder.supplierId._id,
      warehouseId,
      items: grnItems,
      totalAmount,
      remarks: remarks || '',
      receivedBy: receivedBy || '',
      inspectedBy: inspectedBy || '',
      createdBy: req.user._id,
      status: grnStatus
    };

    console.log('GRN data to save:', grnData);

    const grn = new GRN(grnData);
    await grn.save({ session });
    
    // Create stock movements for this GRN within transaction
    // Create stock movements for this GRN within transaction
    try {
      await StockMovementService.createStockMovementsFromGRN(grn, false, session);
      console.log(`✅ Stock movements created for GRN: ${grn.grnNo}`);
    } catch (stockError) {
      console.error('Error creating stock movements:', stockError);
      await session.abortTransaction();
      return res.status(500).json({
        success: false,
        message: `GRN created but stock movement failed: ${stockError.message}`
      });
    }
    
    // Check and fulfill pending out-of-stock orders
    try {
      await fulfillPendingOutOfStockOrders(grn, session);
      console.log(`✅ Checked and fulfilled pending out-of-stock orders for GRN: ${grn.grnNo}`);
    } catch (fulfillError) {
      console.error('Error fulfilling pending orders:', fulfillError);
      // Don't fail the GRN creation if pending order fulfillment fails
    }
    
    // Auto-Apply Purchase Schemes for GRN
    try {
      const grnData = {
        supplierId: purchaseOrder.supplierId._id,
        items: grnItems.map(item => ({
          productId: item.productId,
          category: item.productId?.category,
          subcategory: item.productId?.subcategory,
          brand: item.productId?.brand,
          acceptedQuantity: item.acceptedQuantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice
        })),
        totalAmount: totalAmount,
        grnDate: new Date().toISOString()
      };

      const schemeResult = await schemeService.checkAndApplyPurchaseSchemesForGRN(grnData);
      
      if (schemeResult.appliedSchemes.length > 0) {
        console.log(`✅ Applied ${schemeResult.appliedSchemes.length} purchase schemes for GRN: ${grn.grnNo}`);
        
        // Log scheme applications
        await schemeService.logSchemeApplication({
          grnId: grn._id,
          supplierId: purchaseOrder.supplierId._id,
          appliedSchemes: schemeResult.appliedSchemes,
          totalBenefits: schemeResult.totalBenefits,
          appliedAt: new Date().toISOString()
        });
      }
    } catch (schemeError) {
      console.error('Error applying purchase schemes for GRN:', schemeError);
      // Don't fail the GRN creation if scheme application fails
    }
    
    // Commit transaction
    await session.commitTransaction();
    
    // IMPORTANT: Check waiting orders for stock arrival (after transaction commits)
    // This runs outside the transaction to avoid blocking GRN creation
    try {
      const StockArrivalService = (await import('../services/stockArrivalService.js')).default;
      
      for (const item of grnItems) {
        await StockArrivalService.checkWaitingOrdersForStock(
          item.productId,
          warehouseId,
          item.acceptedQuantity
        );
      }
      console.log(`✅ Checked waiting orders for stock arrival after GRN: ${grn.grnNo}`);
    } catch (arrivalError) {
      console.error('⚠️  Error checking waiting orders (non-critical):', arrivalError);
      // Don't fail GRN creation if stock arrival check fails
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
    // Rollback transaction on error
    await session.abortTransaction();
    console.error('Create GRN error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  } finally {
    // End session
    session.endSession();
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

    // Get the existing GRN to compare changes
    const existingGRN = await GRN.findById(id);
    if (!existingGRN) {
      return res.status(404).json({
        success: false,
        message: 'GRN not found'
      });
    }

    // Check if invoice has been created for this GRN
    if (existingGRN.isInvoiceCreated) {
      return res.status(403).json({
        success: false,
        message: 'Cannot edit GRN. Supplier Invoice has already been created for this GRN.',
        invoiceId: existingGRN.supplierInvoiceId,
        invoiceCreatedAt: existingGRN.invoiceCreatedAt
      });
    }

    // If items are being updated, recalculate status and handle stock movements
    if (updateData.items && Array.isArray(updateData.items)) {
      let grnStatus = 'Received'; // Default to fully received
      let hasShortage = false;
      let hasOverage = false;
      
      // Check each item for deviations
      for (const item of updateData.items) {
        if (item.acceptedQuantity < item.poQuantity) {
          hasShortage = true;
        }
        if (item.acceptedQuantity > item.poQuantity) {
          hasOverage = true;
        }
      }
      
      // Set status based on deviations
      if (hasShortage && hasOverage) {
        grnStatus = 'Partially Received'; // Mixed: some short, some over
      } else if (hasShortage) {
        grnStatus = 'Partially Received'; // Some items short
      } else if (hasOverage) {
        grnStatus = 'Received'; // All received (some extra) - still mark as received
      }
      // else: grnStatus remains 'Received' (all exact match)
      
      updateData.status = grnStatus;

      // Handle stock movements for updated items
      try {
        // Delete existing stock movements for this GRN
        await StockMovementService.deleteStockMovementsForGRN(id);
        console.log(`✅ Deleted existing stock movements for GRN: ${existingGRN.grnNo}`);

        // Update the GRN first
        const updatedGRN = await GRN.findByIdAndUpdate(
          id,
          updateData,
          { new: true, runValidators: true }
        )
          .populate('poId')
          .populate('supplierId')
          .populate('warehouseId')
          .populate('items.productId')
          .populate('createdBy', 'name email');

        // Create new stock movements for the updated GRN
        await StockMovementService.createStockMovementsFromGRN(updatedGRN);
        console.log(`✅ Created new stock movements for updated GRN: ${updatedGRN.grnNo}`);

        res.json({
          success: true,
          message: 'GRN updated successfully',
          data: updatedGRN
        });
      } catch (stockError) {
        console.error('Error updating stock movements:', stockError);
        // Still return success for GRN update, but log the stock error
        res.json({
          success: true,
          message: 'GRN updated successfully, but there was an issue updating stock movements',
          data: updatedGRN
        });
      }
    } else {
      // If no items are being updated, just update the GRN normally
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

      res.json({
        success: true,
        message: 'GRN updated successfully',
        data: grn
      });
    }
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
    const grn = await GRN.findById(req.params.id);
    
    if (!grn) {
      return res.status(404).json({
        success: false,
        message: 'GRN not found'
      });
    }

    // Check if invoice has been created for this GRN
    if (grn.isInvoiceCreated) {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete GRN. Supplier Invoice has already been created for this GRN.',
        invoiceId: grn.supplierInvoiceId,
        invoiceCreatedAt: grn.invoiceCreatedAt
      });
    }

    // Delete associated stock movements first
    try {
      await StockMovementService.deleteStockMovementsForGRN(req.params.id);
      console.log(`✅ Deleted stock movements for GRN: ${grn.grnNo}`);
    } catch (stockError) {
      console.error('Error deleting stock movements:', stockError);
      // Continue with GRN deletion even if stock movement deletion fails
    }

    // Delete the GRN
    await GRN.findByIdAndDelete(req.params.id);

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

    // Get all approved POs
    const allPurchaseOrders = await PurchaseOrder.find(query)
      .populate('supplierId', 'name companyName contactPerson email')
      .populate('warehouseId', 'name location')
      .populate('lines.productId', 'itemName productCode HSNCode description gst')
      .select('poNumber supplierId warehouseId lines orderDate expectedDate status')
      .sort({ createdAt: -1 });

    // Get all PO IDs that already have GRNs
    const existingGRNs = await GRN.find({}, { poId: 1 });
    const poIdsWithGRNs = existingGRNs.map(grn => grn.poId.toString());

    // Filter out POs that already have GRNs
    const purchaseOrders = allPurchaseOrders.filter(po => 
      !poIdsWithGRNs.includes(po._id.toString())
    ).slice(0, 20); // Limit to 20 after filtering

    console.log(`Found ${allPurchaseOrders.length} approved POs, ${purchaseOrders.length} without existing GRNs`);

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