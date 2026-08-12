import { grnSchema } from '../models/GRN.js';
import { purchaseOrderSchema } from '../models/PurchaseOrder.js';
import StockMovementService from '../services/stockMovementService.js';
import schemeService from '../services/schemeService.js';
import { counterSchema } from '../models/Counter.js';
import { supplierSchema } from '../models/Supplier.js';
import { warehouseSchema } from '../models/Warehouse.js';
import { productSchema } from '../models/Product.js';
import { userSchema } from '../models/User.js';
import { assertPeriodOpen, handlePeriodLockError } from '../services/periodLockService.js';
import mongoose from 'mongoose';

// Helper function to get models from company-specific connection
const getModels = (dbConnection) => {
  return {
    GRN: dbConnection.models.GRN || dbConnection.model('GRN', grnSchema),
    PurchaseOrder: dbConnection.models.PurchaseOrder || dbConnection.model('PurchaseOrder', purchaseOrderSchema),
    Counter: dbConnection.models.Counter || dbConnection.model('Counter', counterSchema),
    Supplier: dbConnection.models.Supplier || dbConnection.model('Supplier', supplierSchema),
    Warehouse: dbConnection.models.Warehouse || dbConnection.model('Warehouse', warehouseSchema),
    Product: dbConnection.models.Product || dbConnection.model('Product', productSchema),
    User: dbConnection.models.User || dbConnection.model('User', userSchema),
  };
};

// Atomic GRN number generation using Counter model
const generateGRNNumber = async (dbConnection) => {
  try {
    const { Counter } = getModels(dbConnection);
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
const fulfillPendingOutOfStockOrders = async (grn, session, dbConnection) => {
  try {
    console.log(`🔍 Checking for pending out-of-stock orders to fulfill for GRN: ${grn.grnNo}`);
    
    // Get SalesOrder model from company-specific connection
    const { salesOrderSchema } = await import('../models/SalesOrder.js');
    const SalesOrder = dbConnection.models.SalesOrder || dbConnection.model('SalesOrder', salesOrderSchema);
    
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
  // Get models from company-specific connection
  const { GRN, PurchaseOrder } = getModels(req.dbConnection);
  
  // Start MongoDB session for transaction from company-specific connection
  const session = await req.dbConnection.startSession();
  
  try {
    // Start transaction
    await session.startTransaction();
    
    const {
      poId,       // Primary PO (backward compat)
      poIds,      // Array of PO IDs (multi-PO support)
      warehouseId,
      items,
      remarks,
      receivedBy,
      inspectedBy
    } = req.body;

    // Support both single poId and multi poIds
    const allPoIds = poIds && poIds.length > 0 ? poIds : [poId];
    const primaryPoId = allPoIds[0];

    console.log('Creating GRN with data:', { poIds: allPoIds, warehouseId, itemCount: items?.length });

    // Validate quantities first
    validateGRNQuantities(items);

    // Validate ALL POs exist and are approved
    const purchaseOrders = [];
    for (const pid of allPoIds) {
      const po = await PurchaseOrder.findById(pid)
        .populate('supplierId')
        .populate('lines.productId')
        .session(session);

      if (!po) {
        await session.abortTransaction();
        return res.status(404).json({ success: false, message: `Purchase Order not found: ${pid}` });
      }
      if (po.status !== 'Approved') {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: `PO ${po.poNumber} is not Approved (status: ${po.status})` });
      }
      purchaseOrders.push(po);
    }

    const primaryPO = purchaseOrders[0];

    // Block GRNs dated in a closed financial year
    await assertPeriodOpen(req.dbConnection, req.body.grnDate || Date.now(), 'GRN');

    // Calculate totals and build GRN items
    let totalAmount = 0;
    const grnItems = [];
    const autoCreatedPOs = [];

    for (const item of items) {
      // Find which PO this item belongs to
      let matchedPO = null;
      let poLine = null;
      
      if (item.sourcePOId) {
        matchedPO = purchaseOrders.find(po => po._id.toString() === item.sourcePOId);
        poLine = matchedPO?.lines.find(l => l.productId._id.toString() === item.productId);
      }
      
      // Fallback: search all POs for this product
      if (!poLine) {
        for (const po of purchaseOrders) {
          poLine = po.lines.find(l => l.productId._id.toString() === item.productId);
          if (poLine) { matchedPO = po; break; }
        }
      }

      if (!poLine) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: `Product not found in any selected Purchase Order: ${item.productId}` });
      }

      const acceptedQuantity = item.receivedQuantity - (item.damageQuantity || 0);
      const companyBillQty = item.companyBillQuantity || item.receivedQuantity;
      const shortageQty = Math.max(0, companyBillQty - item.receivedQuantity);
      const itemTotal = acceptedQuantity * poLine.price;

      grnItems.push({
        serialNo: item.serialNo || null,
        productId: item.productId,
        sourcePOId: matchedPO._id,
        sourcePONumber: item.sourcePONumber || matchedPO.poNumber,
        poQuantity: item.poQuantity || poLine.quantity,
        companyBillQuantity: companyBillQty,
        receivedQuantity: item.receivedQuantity,
        damageQuantity: item.damageQuantity || 0,
        acceptedQuantity,
        shortageQuantity: shortageQty,
        unitPrice: poLine.price,
        gst: poLine.gst,
        totalPrice: itemTotal,
        purchaseDiscount: {
          hasDiscount: poLine.purchaseDiscount?.hasDiscount || false,
          directDiscountPercentage: poLine.purchaseDiscount?.directDiscountPercentage || 0,
          floatingDiscountPercentage: poLine.purchaseDiscount?.referenceFloatingDiscount || 0,
          floatingDiscountRange: {
            min: poLine.purchaseDiscount?.floatingDiscountRange?.min || 0,
            max: poLine.purchaseDiscount?.floatingDiscountRange?.max || 0,
            enabled: poLine.purchaseDiscount?.floatingDiscountRange?.enabled || false
          }
        }
      });

      totalAmount += itemTotal;
    }

    // --- EXCESS CHECK: Collect ALL excess items into ONE auto-PO ---
    const excessLines = [];
    for (const grnItem of grnItems) {
      if (grnItem.receivedQuantity > grnItem.poQuantity) {
        const excessQty = grnItem.receivedQuantity - grnItem.poQuantity;
        excessLines.push({
          productId: grnItem.productId,
          quantity: excessQty,
          price: grnItem.unitPrice,
          gst: grnItem.gst,
          total: excessQty * grnItem.unitPrice,
          purchaseDiscount: {
            hasDiscount: grnItem.purchaseDiscount?.hasDiscount || false,
            directDiscountPercentage: grnItem.purchaseDiscount?.directDiscountPercentage || 0,
            referenceFloatingDiscount: grnItem.purchaseDiscount?.floatingDiscountPercentage || 0,
            floatingDiscountRange: grnItem.purchaseDiscount?.floatingDiscountRange || { min: 0, max: 0, enabled: false },
            floatingDiscountEnabled: grnItem.purchaseDiscount?.floatingDiscountRange?.enabled || false,
            floatingDiscountMin: grnItem.purchaseDiscount?.floatingDiscountRange?.min || 0,
            floatingDiscountMax: grnItem.purchaseDiscount?.floatingDiscountRange?.max || 0,
          }
        });
      }
    }

    if (excessLines.length > 0) {
      const excessPONumber = await generatePONumber(req.dbConnection);
      const excessSubtotal = excessLines.reduce((s, l) => s + l.total, 0);
      const excessPO = new PurchaseOrder({
        poNumber: excessPONumber,
        supplierId: primaryPO.supplierId._id,
        warehouseId,
        orderDate: new Date(),
        expectedDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'Approved',
        isAutoCreated: true,
        autoCreatedReason: 'excess',
        expirationDate: null, // No expiration for approved excess POs — already used in GRN
        paymentTermsDays: primaryPO.paymentTermsDays,
        billingAddress: primaryPO.billingAddress,
        shippingAddress: primaryPO.shippingAddress,
        lines: excessLines,
        subtotal: excessSubtotal,
        gstTotal: 0,
        total: excessSubtotal,
        createdBy: req.user._id,
        notes: `Auto-created for excess quantities from GRN. ${excessLines.length} product(s).`
      });
      await excessPO.save({ session });

      autoCreatedPOs.push({
        poId: excessPO._id,
        poNumber: excessPONumber,
        reason: 'excess',
        quantity: excessLines.reduce((s, l) => s + l.quantity, 0),
        productId: excessLines.length === 1 ? excessLines[0].productId : null,
        createdAt: new Date()
      });

      allPoIds.push(excessPO._id);

      // Update GRN items' poQuantity to include excess and add excess PO to sourcePONumber
      for (const grnItem of grnItems) {
        const exLine = excessLines.find(l => l.productId.toString() === grnItem.productId.toString());
        if (exLine) {
          grnItem.poQuantity = grnItem.poQuantity + exLine.quantity;
          // Append excess PO number to source reference
          grnItem.sourcePONumber = grnItem.sourcePONumber 
            ? `${grnItem.sourcePONumber}, ${excessPONumber}` 
            : excessPONumber;
        }
      }

      console.log(`✅ Auto-created PO ${excessPONumber} with ${excessLines.length} excess product(s)`);
    }

    // Generate GRN number using atomic counter
    const grnNo = await generateGRNNumber(req.dbConnection);
    console.log('Generated GRN No:', grnNo);

    // ALWAYS create as Draft — inspection is mandatory second step
    const grnStatus = 'Draft';

    const grnData = {
      grnNo,
      poId: primaryPoId,
      poIds: allPoIds,
      supplierId: primaryPO.supplierId._id,
      warehouseId,
      items: grnItems,
      totalAmount,
      remarks: remarks || '',
      shortageNote: req.body.shortageNote || '',
      excessNote: req.body.excessNote || '',
      damageNote: req.body.damageNote || '',
      generalNote: req.body.generalNote || '',
      receivedBy: receivedBy || '',
      receivedAt: new Date(),
      inspectedBy: '',
      inspectedAt: null,
      autoCreatedPOs,
      createdBy: req.user._id,
      status: grnStatus
    };

    const grn = new GRN(grnData);
    await grn.save({ session });

    // Draft = NO stock update, NO PO completion. That happens at inspection.
    
    // Commit transaction
    await session.commitTransaction();
    
    // Populate the saved GRN for response
    const populatedGRN = await GRN.findById(grn._id)
      .populate('poId', 'poNumber')
      .populate('poIds', 'poNumber')
      .populate('supplierId', 'name companyName')
      .populate('warehouseId', 'name location')
      .populate('items.productId', 'itemName productCode HSNCode')
      .populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'GRN created as Draft. Inspection required to complete.',
      data: populatedGRN,
      autoCreatedPOs: autoCreatedPOs.length > 0 ? autoCreatedPOs : undefined
    });
  } catch (error) {
    await session.abortTransaction();
    if (handlePeriodLockError(error, res)) return;
    console.error('Create GRN error:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

// Helper to generate PO number for auto-created POs (matches existing format, retry-safe)
const generatePONumber = async (dbConnection) => {
  const { PurchaseOrder } = getModels(dbConnection);
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const datePrefix = `PO-${year}${month}${day}-`;

  // Get count of ALL POs with today's prefix
  const count = await PurchaseOrder.countDocuments({ poNumber: { $regex: `^${datePrefix}` } });
  let nextSeq = count + 1;

  // Retry loop to find unused number
  for (let attempt = 0; attempt < 20; attempt++) {
    const poNumber = `${datePrefix}${String(nextSeq).padStart(3, "0")}`;
    const exists = await PurchaseOrder.findOne({ poNumber }).lean();
    if (!exists) return poNumber;
    nextSeq++;
  }

  // Fallback: timestamp to guarantee uniqueness
  return `${datePrefix}T${Date.now().toString().slice(-5)}`;
};

// ─── STAGE 2: INSPECT GRN (completes the GRN, updates stock, creates POs for shortage) ───
export const inspectGRN = async (req, res) => {
  const { GRN, PurchaseOrder } = getModels(req.dbConnection);
  const session = await req.dbConnection.startSession();

  try {
    await session.startTransaction();

    const { id } = req.params;
    const { inspectedBy, shortageActions } = req.body;
    // shortageActions: [{ productId, action: 'createPO' | 'end' }]

    if (!inspectedBy) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Inspected By name is required' });
    }

    const grn = await GRN.findById(id).session(session);
    if (!grn) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'GRN not found' });
    }
    if (grn.status !== 'Draft') {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: `GRN is already ${grn.status}. Only Draft GRNs can be inspected.` });
    }

    // Check for shortage items (PO Qty > Received Qty) and handle
    // Collect all shortage items into ONE draft PO (if user wants)
    const autoCreatedPOs = [...(grn.autoCreatedPOs || [])];
    const shortageLines = [];

    for (const item of grn.items) {
      const shortageFromPO = item.poQuantity - item.receivedQuantity;
      if (shortageFromPO > 0) {
        // Match by productId + sourcePOId to handle same product from multiple POs
        const pidStr = item.productId.toString();
        const spoStr = item.sourcePOId ? item.sourcePOId.toString() : null;
        const action = shortageActions?.find(a => {
          if (a.productId !== pidStr) return false;
          // If sourcePOId is provided, match both; otherwise match productId only
          if (a.sourcePOId && spoStr) return a.sourcePOId === spoStr;
          return true;
        });
        if (action && action.action === 'createPO') {
          // Remove matched action to prevent duplicate matching for same productId
          const actionIdx = shortageActions.indexOf(action);
          if (actionIdx > -1) shortageActions.splice(actionIdx, 1);
          shortageLines.push({
            productId: item.productId,
            quantity: shortageFromPO,
            price: item.unitPrice,
            gst: item.gst,
            total: shortageFromPO * item.unitPrice,
            purchaseDiscount: {
              hasDiscount: item.purchaseDiscount?.hasDiscount || false,
              directDiscountPercentage: item.purchaseDiscount?.directDiscountPercentage || 0,
              referenceFloatingDiscount: item.purchaseDiscount?.floatingDiscountPercentage || 0,
              floatingDiscountRange: item.purchaseDiscount?.floatingDiscountRange || { min: 0, max: 0, enabled: false },
              floatingDiscountEnabled: item.purchaseDiscount?.floatingDiscountRange?.enabled || false,
              floatingDiscountMin: item.purchaseDiscount?.floatingDiscountRange?.min || 0,
              floatingDiscountMax: item.purchaseDiscount?.floatingDiscountRange?.max || 0,
            }
          });
        }
      }
    }

    // Create ONE draft PO for all shortage products
    if (shortageLines.length > 0) {
      const shortagePONumber = await generatePONumber(req.dbConnection);
      const shortageSubtotal = shortageLines.reduce((s, l) => s + l.total, 0);
      const shortagePO = new PurchaseOrder({
        poNumber: shortagePONumber,
        supplierId: grn.supplierId,
        warehouseId: grn.warehouseId,
        orderDate: new Date(),
        expectedDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        status: 'Draft',
        isAutoCreated: true,
        autoCreatedReason: 'shortage',
        parentGRNId: grn._id,
        expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days to approve
        paymentTermsDays: 30,
        billingAddress: 'As per original PO',
        shippingAddress: 'As per original PO',
        lines: shortageLines,
        subtotal: shortageSubtotal,
        gstTotal: 0,
        total: shortageSubtotal,
        createdBy: req.user._id,
        notes: `Auto-created for shortage. GRN: ${grn.grnNo}. ${shortageLines.length} product(s).`
      });
      await shortagePO.save({ session });
      autoCreatedPOs.push({
        poId: shortagePO._id,
        poNumber: shortagePONumber,
        reason: 'shortage',
        quantity: shortageLines.reduce((s, l) => s + l.quantity, 0),
        productId: shortageLines.length === 1 ? shortageLines[0].productId : null,
        createdAt: new Date()
      });
      console.log(`📝 Created Draft PO ${shortagePONumber} for shortage — ${shortageLines.length} product(s)`);
    }

    // GRN Status logic:
    // - Shortage exists + user chose "end" (no PO created) → Partially Received
    // - Shortage exists + user created PO → Received (shortage will be fulfilled by new PO)
    // - No shortage → Received
    const hasUnresolvedShortage = grn.items.some(item => {
      const shortage = item.poQuantity - item.receivedQuantity;
      if (shortage <= 0) return false;
      const pidStr = item.productId.toString();
      const spoStr = item.sourcePOId ? item.sourcePOId.toString() : null;
      // Check if this item was explicitly marked as "end" (or no action = default end)
      const action = req.body.shortageActions?.find(a => {
        if (a.productId !== pidStr) return false;
        if (a.sourcePOId && spoStr) return a.sourcePOId === spoStr;
        return true;
      });
      return !action || action.action === 'end';
    });
    const finalStatus = hasUnresolvedShortage ? 'Partially Received' : 'Received';

    // Update GRN
    grn.inspectedBy = inspectedBy;
    grn.inspectedAt = new Date();
    grn.status = finalStatus;
    grn.autoCreatedPOs = autoCreatedPOs;
    await grn.save({ session });

    // NOW update stock (only on inspection, not draft)
    try {
      await StockMovementService.createStockMovementsFromGRN(grn, false, session, req.dbConnection);
      console.log(`✅ Stock movements created for GRN: ${grn.grnNo}`);
    } catch (stockError) {
      console.error('Error creating stock movements:', stockError);
      await session.abortTransaction();
      return res.status(500).json({ success: false, message: `Inspection failed — stock error: ${stockError.message}` });
    }

    // Mark all associated POs as Completed
    for (const poId of (grn.poIds || [grn.poId])) {
      try {
        await PurchaseOrder.findByIdAndUpdate(poId, { status: 'Completed' }, { session });
      } catch (e) { /* non-critical */ }
    }

    // Check and fulfill pending out-of-stock orders
    try {
      await fulfillPendingOutOfStockOrders(grn, session, req.dbConnection);
    } catch (e) { /* non-critical */ }

    // Auto-Apply Purchase Schemes
    try {
      const schemeData = {
        supplierId: grn.supplierId,
        items: grn.items.map(item => ({
          productId: item.productId,
          acceptedQuantity: item.acceptedQuantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice
        })),
        totalAmount: grn.totalAmount,
        grnDate: new Date().toISOString()
      };
      const schemeResult = await schemeService.checkAndApplyPurchaseSchemesForGRN(schemeData);
      if (schemeResult.appliedSchemes.length > 0) {
        await schemeService.logSchemeApplication({
          grnId: grn._id,
          supplierId: grn.supplierId,
          appliedSchemes: schemeResult.appliedSchemes,
          totalBenefits: schemeResult.totalBenefits,
          appliedAt: new Date().toISOString()
        });
      }
    } catch (e) { /* non-critical */ }

    await session.commitTransaction();

    // Post-transaction: check waiting orders for stock
    try {
      const StockArrivalService = (await import('../services/stockArrivalService.js')).default;
      for (const item of grn.items) {
        await StockArrivalService.checkWaitingOrdersForStock(item.productId, grn.warehouseId, item.acceptedQuantity, req.dbConnection);
      }
    } catch (e) { /* non-critical */ }

    const populatedGRN = await GRN.findById(grn._id)
      .populate('poId', 'poNumber')
      .populate('poIds', 'poNumber')
      .populate('supplierId', 'name companyName')
      .populate('warehouseId', 'name location')
      .populate('items.productId', 'itemName productCode HSNCode')
      .populate('createdBy', 'name email');

    res.json({
      success: true,
      message: 'GRN inspection completed successfully. Stock updated.',
      data: populatedGRN,
      autoCreatedPOs: autoCreatedPOs.filter(p => p.reason === 'shortage')
    });
  } catch (error) {
    await session.abortTransaction();
    if (handlePeriodLockError(error, res)) return;
    console.error('Inspect GRN error:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

// ─── EXTEND PO EXPIRATION ───
export const extendPOExpiration = async (req, res) => {
  try {
    const { PurchaseOrder } = getModels(req.dbConnection);
    const { id } = req.params;
    const { newExpirationDate, days } = req.body;

    const po = await PurchaseOrder.findById(id);
    if (!po) return res.status(404).json({ success: false, message: 'PO not found' });
    if (!po.expirationDate) return res.status(400).json({ success: false, message: 'This PO has no expiration date' });

    let newDate;
    if (newExpirationDate) {
      newDate = new Date(newExpirationDate);
    } else {
      newDate = new Date(po.expirationDate.getTime() + (days || 30) * 24 * 60 * 60 * 1000);
    }

    po.expirationDate = newDate;
    po.expirationExtended = true;
    po.expirationNotified = false; // Reset so it notifies again 1 day before new date
    await po.save();

    res.json({
      success: true,
      message: `PO expiration extended to ${newDate.toLocaleDateString()}`,
      data: po
    });
  } catch (error) {
    console.error('Extend PO expiration error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getGRNs = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { GRN, Supplier, Warehouse, Product, User } = getModels(req.dbConnection);
    
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
    // Get models from company-specific connection
    const { GRN } = getModels(req.dbConnection);
    
    const grn = await GRN.findById(req.params.id)
      .populate('poId', 'poNumber status orderDate expectedDate')
      .populate('poIds', 'poNumber status orderDate expectedDate isAutoCreated autoCreatedReason')
      .populate('supplierId')
      .populate('warehouseId')
      .populate('items.productId')
      .populate('items.sourcePOId', 'poNumber')
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
    const { GRN } = getModels(req.dbConnection);
    
    const { id } = req.params;
    const updateData = req.body;

    const existingGRN = await GRN.findById(id);
    if (!existingGRN) {
      return res.status(404).json({ success: false, message: 'GRN not found' });
    }

    // Only Draft GRNs can be edited
    if (existingGRN.status !== 'Draft') {
      return res.status(403).json({
        success: false,
        message: `Cannot edit GRN. Status is "${existingGRN.status}". Only Draft GRNs can be edited.`
      });
    }

    // Check if invoice has been created
    if (existingGRN.isInvoiceCreated) {
      return res.status(403).json({
        success: false,
        message: 'Cannot edit GRN. Supplier Invoice has already been created.'
      });
    }

    // Keep status as Draft — stock is NOT updated on edit (only on inspection)
    updateData.status = 'Draft';
    
    // Remove fields that shouldn't be changed via edit
    delete updateData.inspectedBy;
    delete updateData.inspectedAt;

    // Recalculate totalAmount if items are updated
    if (updateData.items && Array.isArray(updateData.items)) {
      updateData.totalAmount = updateData.items.reduce((sum, item) => {
        const accepted = (item.receivedQuantity || 0) - (item.damageQuantity || 0);
        item.acceptedQuantity = Math.max(0, accepted);
        item.totalPrice = item.acceptedQuantity * (item.unitPrice || 0);
        item.shortageQuantity = Math.max(0, (item.companyBillQuantity || 0) - (item.receivedQuantity || 0));
        return sum + item.totalPrice;
      }, 0);
    }

    const updatedGRN = await GRN.findByIdAndUpdate(id, updateData, { new: true, runValidators: true })
      .populate('poId', 'poNumber')
      .populate('poIds', 'poNumber')
      .populate('supplierId', 'name companyName')
      .populate('warehouseId', 'name location')
      .populate('items.productId', 'itemName productCode HSNCode')
      .populate('createdBy', 'name email');

    res.json({
      success: true,
      message: 'GRN updated successfully (Draft)',
      data: updatedGRN
    });
  } catch (error) {
    console.error('Update GRN error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteGRN = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { GRN } = getModels(req.dbConnection);
    
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
      await StockMovementService.deleteStockMovementsForGRN(req.params.id, req.dbConnection);
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
    // Get models from company-specific connection
    const { GRN, PurchaseOrder } = getModels(req.dbConnection);
    
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
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);

    const totalValue = await GRN.aggregate([
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    // Pending GRN = Approved POs that don't have any GRN created yet
    const approvedPOs = await PurchaseOrder.find(
      { status: 'Approved' },
      { _id: 1 }
    ).lean();

    const approvedPOIds = approvedPOs.map(po => po._id);

    // Find which approved POs already have at least one GRN (any status except Cancelled)
    const poIdsWithGRN = await GRN.distinct('poId', {
      poId: { $in: approvedPOIds },
      status: { $ne: 'Cancelled' }
    });

    const pendingGRN = Math.max(0, approvedPOIds.length - poIdsWithGRN.length);

    res.json({
      success: true,
      data: {
        totalGRNs,
        monthlyGRNs,
        yearlyGRNs,
        statusCounts,
        totalValue: totalValue[0]?.total || 0,
        pendingGRN: Math.max(0, pendingGRN)
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
    // Get models from company-specific connection
    const { PurchaseOrder, GRN } = getModels(req.dbConnection);
    
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