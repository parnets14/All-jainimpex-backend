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

const normalizeGRNItemRemarks = (value) => (
  typeof value === 'string' ? value.trim().slice(0, 500) : ''
);

const PO_ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const getEffectiveApprovalInstant = (purchaseOrder) => {
  const value = purchaseOrder?.approvedAt
    || purchaseOrder?.updatedAt
    || purchaseOrder?.orderDate
    || purchaseOrder?.createdAt;
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
};

const getEffectivePOExpiration = (purchaseOrder) => {
  if (purchaseOrder?.expirationDate) {
    const explicitDate = new Date(purchaseOrder.expirationDate);
    if (Number.isFinite(explicitDate.getTime())) return explicitDate;
  }
  const approvedAt = getEffectiveApprovalInstant(purchaseOrder);
  return approvedAt ? new Date(approvedAt.getTime() + PO_ACTIVE_WINDOW_MS) : null;
};

const effectiveExpiryExpression = () => ({
  $ifNull: [
    '$expirationDate',
    {
      $dateAdd: {
        startDate: {
          $ifNull: [
            '$approvedAt',
            { $ifNull: ['$updatedAt', { $ifNull: ['$orderDate', '$createdAt'] }] }
          ]
        },
        unit: 'day',
        amount: 30
      }
    }
  ]
});

const futureEffectiveExpiryPredicate = (now) => ({
  $expr: { $gt: [effectiveExpiryExpression(), now] }
});

const isPurchaseOrderAvailable = (purchaseOrder, now = new Date()) => {
  const expirationDate = getEffectivePOExpiration(purchaseOrder);
  return purchaseOrder?.status === 'Approved'
    && !purchaseOrder.convertedToGRNId
    && expirationDate
    && expirationDate.getTime() > now.getTime();
};

const findGRNUsingPurchaseOrder = (GRN, purchaseOrderId, session = null) => {
  const query = GRN.findOne({
    $or: [
      { poId: purchaseOrderId },
      { poIds: purchaseOrderId }
    ]
  }).select('_id grnNo');
  return session ? query.session(session) : query;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

    // Support both single poId and multi poIds, but never claim the same PO twice.
    const requestedPoIds = Array.isArray(poIds) && poIds.length > 0 ? poIds : [poId];
    if (requestedPoIds.length === 0 || requestedPoIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        code: 'INVALID_PURCHASE_ORDER_IDS',
        message: 'At least one valid Purchase Order ID is required'
      });
    }

    const allPoIds = [...new Map(
      requestedPoIds.map((id) => {
        const objectId = new mongoose.Types.ObjectId(id);
        return [objectId.toHexString(), objectId];
      })
    ).values()];
    const primaryPoId = allPoIds[0];
    const grnId = new mongoose.Types.ObjectId();
    const claimTime = new Date();

    console.log('Creating GRN with data:', { poIds: allPoIds, warehouseId, itemCount: items?.length });

    // Validate quantities first
    validateGRNQuantities(items);

    // Existing GRN references reserve a PO even if legacy claim fields are absent.
    const existingGRN = await GRN.findOne({
      $or: [
        { poId: { $in: allPoIds } },
        { poIds: { $in: allPoIds } }
      ]
    }).select('_id grnNo').session(session);
    if (existingGRN) {
      await session.abortTransaction();
      return res.status(409).json({
        success: false,
        code: 'PURCHASE_ORDER_ALREADY_CONVERTED',
        message: `One or more Purchase Orders are already referenced by GRN ${existingGRN.grnNo || existingGRN._id}`
      });
    }

    // Atomically claim every source PO for the preallocated GRN before using its lines.
    const purchaseOrders = [];
    for (const pid of allPoIds) {
      const po = await PurchaseOrder.findOneAndUpdate(
        {
          _id: pid,
          status: 'Approved',
          convertedToGRNId: null,
          ...futureEffectiveExpiryPredicate(claimTime)
        },
        {
          $set: {
            convertedToGRNId: grnId,
            convertedAt: claimTime
          }
        },
        { new: true, session, runValidators: true, timestamps: false }
      )
        .populate('supplierId')
        .populate('lines.productId');

      if (!po) {
        const latestPO = await PurchaseOrder.findById(pid).session(session);
        const conflictingGRN = await findGRNUsingPurchaseOrder(GRN, pid, session);
        await session.abortTransaction();

        if (!latestPO) {
          return res.status(404).json({
            success: false,
            code: 'PURCHASE_ORDER_NOT_FOUND',
            message: `Purchase Order not found: ${pid}`
          });
        }
        if (latestPO.convertedToGRNId || conflictingGRN) {
          return res.status(409).json({
            success: false,
            code: 'PURCHASE_ORDER_ALREADY_CONVERTED',
            message: `PO ${latestPO.poNumber} has already been used by another GRN`
          });
        }
        if (latestPO.status === 'Expired' || getEffectivePOExpiration(latestPO)?.getTime() <= claimTime.getTime()) {
          return res.status(409).json({
            success: false,
            code: 'PURCHASE_ORDER_EXPIRED',
            message: `PO ${latestPO.poNumber} has expired and cannot be converted to a GRN`
          });
        }
        return res.status(409).json({
          success: false,
          code: 'PURCHASE_ORDER_NOT_AVAILABLE',
          message: `PO ${latestPO.poNumber} is ${latestPO.status} and is not available for GRN conversion`
        });
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
        matchedPO = purchaseOrders.find(po => po._id.toString() === item.sourcePOId.toString());
        poLine = matchedPO?.lines.find(l => l.productId._id.toString() === item.productId.toString());
      }
      
      // Fallback: search all POs for this product
      if (!poLine) {
        for (const po of purchaseOrders) {
          poLine = po.lines.find(l => l.productId._id.toString() === item.productId.toString());
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
        remarks: normalizeGRNItemRemarks(item.remarks),
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
      const excessApprovedAt = new Date();
      const excessPO = new PurchaseOrder({
        poNumber: excessPONumber,
        supplierId: primaryPO.supplierId._id,
        warehouseId,
        orderDate: new Date(),
        expectedDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'Approved',
        approvedAt: excessApprovedAt,
        approvedBy: req.user._id,
        convertedToGRNId: grnId,
        convertedAt: excessApprovedAt,
        statusHistory: [{
          fromStatus: 'Draft',
          toStatus: 'Approved',
          changedAt: excessApprovedAt,
          changedBy: req.user._id,
          reason: 'Auto-approved for excess quantities recorded by this GRN'
        }],
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
      _id: grnId,
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
    if (session.inTransaction()) await session.abortTransaction();
    if (error?.code === 112 || error?.hasErrorLabel?.('TransientTransactionError')) {
      return res.status(409).json({
        success: false,
        code: 'PURCHASE_ORDER_CLAIM_CONFLICT',
        message: 'A selected Purchase Order was claimed concurrently. Refresh and try again.'
      });
    }
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
  let grnLease = null;
  let stockLease = null;

  try {
    // Serialize the Draft -> received lifecycle before reading the item/warehouse
    // revision used to choose stock keys. Draft edit and delete use this same key.
    grnLease = await StockMovementService.acquireStockLeases(
      req.dbConnection,
      [`GRN:${req.params.id}`]
    );
    const leaseSource = await GRN.findById(req.params.id)
      .select('items.productId warehouseId')
      .lean();
    if (leaseSource) {
      stockLease = await StockMovementService.acquireStockLeases(
        req.dbConnection,
        (leaseSource.items || []).map((item) => StockMovementService.stockKey(
          item.productId,
          leaseSource.warehouseId
        ))
      );
    }

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
        expirationDate: null,
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
    const completedAt = new Date();
    for (const poId of (grn.poIds || [grn.poId])) {
      try {
        const associatedPO = await PurchaseOrder.findById(poId).session(session);
        if (associatedPO && associatedPO.status !== 'Completed') {
          await PurchaseOrder.updateOne(
            { _id: poId, status: associatedPO.status },
            {
              $set: { status: 'Completed' },
              $push: {
                statusHistory: {
                  fromStatus: associatedPO.status,
                  toStatus: 'Completed',
                  changedAt: completedAt,
                  changedBy: req.user?._id || null,
                  reason: `Completed by GRN ${grn.grnNo} inspection`
                }
              }
            },
            { session, runValidators: true }
          );
        }
      } catch (e) { /* non-critical */ }
    }

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

    // Post-transaction: recalculate the FIFO Pending-order queue once.
    try {
      const StockArrivalService = (await import('../services/stockArrivalService.js')).default;
      await StockArrivalService.refreshStockKeys(
        grn.items
          .filter((item) => Number(item.acceptedQuantity || 0) > 0)
          .map((item) => ({ productId: item.productId, warehouseId: grn.warehouseId })),
        req.dbConnection
      );
    } catch (e) {
      console.error('GRN stock queue refresh failed (non-critical):', e.message);
    }

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
    if (session.inTransaction()) await session.abortTransaction();
    if (handlePeriodLockError(error, res)) return;
    console.error('Inspect GRN error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.message
    });
  } finally {
    if (stockLease) {
      try {
        await StockMovementService.releaseStockLeases(req.dbConnection, stockLease);
      } catch (releaseError) {
        console.error('Failed to release GRN stock lease:', releaseError.message);
      }
    }
    if (grnLease) {
      try {
        await StockMovementService.releaseStockLeases(req.dbConnection, grnLease);
      } catch (releaseError) {
        console.error('Failed to release GRN lifecycle lease:', releaseError.message);
      }
    }
    session.endSession();
  }
};

// ─── EXTEND OR REACTIVATE PO EXPIRATION ───
export const extendPOExpiration = async (req, res) => {
  try {
    const { PurchaseOrder, GRN } = getModels(req.dbConnection);
    const { id } = req.params;
    const { newExpirationDate, days, reason } = req.body;
    const now = new Date();

    const po = await PurchaseOrder.findById(id);
    if (!po) return res.status(404).json({ success: false, message: 'PO not found' });

    if (!['Approved', 'Expired'].includes(po.status)) {
      return res.status(409).json({
        success: false,
        code: 'PURCHASE_ORDER_EXTENSION_NOT_ALLOWED',
        message: `Only Approved or Expired purchase orders can be extended; PO ${po.poNumber} is ${po.status}`
      });
    }

    const existingGRN = await findGRNUsingPurchaseOrder(GRN, po._id);
    if (po.convertedToGRNId || existingGRN) {
      return res.status(409).json({
        success: false,
        code: 'PURCHASE_ORDER_ALREADY_CONVERTED',
        message: `PO ${po.poNumber} has already been used by a GRN and cannot be extended`
      });
    }

    const hasExplicitDate = newExpirationDate !== undefined && newExpirationDate !== null && newExpirationDate !== '';
    const hasDays = days !== undefined && days !== null && days !== '';
    const extensionDays = hasDays ? Number(days) : 30;
    if (hasDays && (!Number.isFinite(extensionDays) || extensionDays <= 0)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_EXTENSION_DAYS',
        message: 'Extension days must be a finite positive number'
      });
    }

    let newDate;
    if (hasExplicitDate) {
      newDate = new Date(newExpirationDate);
      if (!Number.isFinite(newDate.getTime()) || newDate.getTime() <= now.getTime()) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_EXPIRATION_DATE',
          message: 'New expiration date must be a valid date strictly in the future'
        });
      }
    } else {
      if (!Number.isFinite(extensionDays) || extensionDays <= 0) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_EXTENSION_DAYS',
          message: 'Extension days must be a finite positive number'
        });
      }
      const effectiveExpiry = getEffectivePOExpiration(po);
      const baseTime = po.status === 'Approved'
        ? Math.max(effectiveExpiry?.getTime() || 0, now.getTime())
        : now.getTime();
      newDate = new Date(baseTime + extensionDays * 24 * 60 * 60 * 1000);
    }

    const previousExpirationDate = getEffectivePOExpiration(po);
    const reactivated = po.status === 'Expired';
    const update = {
      $set: {
        status: reactivated ? 'Approved' : po.status,
        expirationDate: newDate,
        expirationExtended: true,
        expirationNotified: false
      },
      $push: {
        expirationExtensions: {
          previousExpirationDate,
          newExpirationDate: newDate,
          extendedAt: now,
          extendedBy: req.user?._id || null,
          reason: typeof reason === 'string' ? reason.trim() : '',
          reactivated
        }
      },
      $inc: { __v: 1 }
    };

    if (reactivated) {
      update.$push.statusHistory = {
        fromStatus: 'Expired',
        toStatus: 'Approved',
        changedAt: now,
        changedBy: req.user?._id || null,
        reason: typeof reason === 'string' && reason.trim()
          ? reason.trim()
          : 'Purchase order reactivated by expiration extension'
      };
    }

    const updatedPO = await PurchaseOrder.findOneAndUpdate(
      {
        _id: po._id,
        status: po.status,
        convertedToGRNId: null,
        __v: po.__v
      },
      update,
      { new: true, runValidators: true }
    );

    if (!updatedPO) {
      return res.status(409).json({
        success: false,
        code: 'PURCHASE_ORDER_LIFECYCLE_CONFLICT',
        message: `PO ${po.poNumber} changed while its expiration was being extended. Refresh and try again.`
      });
    }

    res.json({
      success: true,
      message: reactivated
        ? `PO reactivated and extended to ${newDate.toLocaleDateString()}`
        : `PO expiration extended to ${newDate.toLocaleDateString()}`,
      data: updatedPO
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
  let grnLease = null;
  try {
    const { GRN } = getModels(req.dbConnection);
    const { id } = req.params;
    const updateData = req.body;

    grnLease = await StockMovementService.acquireStockLeases(
      req.dbConnection,
      [`GRN:${id}`]
    );

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

    // Source POs are claimed atomically when the Draft GRN is created. Allowing
    // an edit to replace them would split GRN references from PurchaseOrder claims,
    // so edits may change quantities/notes only, never the source PO set or primary PO.
    const currentSourceIds = [...new Set(
      (existingGRN.poIds?.length > 0 ? existingGRN.poIds : [existingGRN.poId])
        .filter(Boolean)
        .map((sourceId) => sourceId.toString())
    )].sort();
    const requestedSourceIds = [...new Set(
      (Array.isArray(updateData.poIds) && updateData.poIds.length > 0
        ? updateData.poIds
        : updateData.poId
          ? [updateData.poId]
          : currentSourceIds
      ).filter(Boolean).map((sourceId) => sourceId.toString())
    )].sort();
    const currentPrimaryPOId = existingGRN.poId?.toString();
    const requestedPrimaryPOId = updateData.poId?.toString() || currentPrimaryPOId;
    const sourcePOsChanged = requestedPrimaryPOId !== currentPrimaryPOId
      || requestedSourceIds.length !== currentSourceIds.length
      || requestedSourceIds.some((sourceId, index) => sourceId !== currentSourceIds[index]);

    if (sourcePOsChanged) {
      return res.status(409).json({
        success: false,
        code: 'GRN_SOURCE_POS_IMMUTABLE',
        message: 'Purchase Orders cannot be changed after a GRN is created. Delete this Draft GRN and create a new one to use different POs.'
      });
    }

    // Keep source identity and supplier server-controlled during Draft edits.
    delete updateData.poId;
    delete updateData.poIds;
    delete updateData.supplierId;

    // Keep status as Draft — stock is NOT updated on edit (only on inspection)
    updateData.status = 'Draft';

    // Remove fields that shouldn't be changed via edit
    delete updateData.inspectedBy;
    delete updateData.inspectedAt;

    // Recalculate totalAmount if items are updated
    if (updateData.items && Array.isArray(updateData.items)) {
      const currentSourceIdSet = new Set(currentSourceIds);
      const invalidSourceItem = updateData.items.find((item) => (
        item.sourcePOId && !currentSourceIdSet.has(item.sourcePOId.toString())
      ));
      if (invalidSourceItem) {
        return res.status(409).json({
          success: false,
          code: 'GRN_ITEM_SOURCE_PO_INVALID',
          message: 'A GRN item references a Purchase Order that is not attached to this Draft GRN.'
        });
      }

      updateData.totalAmount = updateData.items.reduce((sum, item) => {
        const accepted = (item.receivedQuantity || 0) - (item.damageQuantity || 0);
        item.acceptedQuantity = Math.max(0, accepted);
        item.totalPrice = item.acceptedQuantity * (item.unitPrice || 0);
        item.shortageQuantity = Math.max(0, (item.companyBillQuantity || 0) - (item.receivedQuantity || 0));
        item.remarks = normalizeGRNItemRemarks(item.remarks);
        return sum + item.totalPrice;
      }, 0);
    }

    const updatedGRN = await GRN.findOneAndUpdate(
      { _id: id, status: 'Draft', isInvoiceCreated: { $ne: true } },
      updateData,
      { new: true, runValidators: true }
    )
      .populate('poId', 'poNumber')
      .populate('poIds', 'poNumber')
      .populate('supplierId', 'name companyName')
      .populate('warehouseId', 'name location')
      .populate('items.productId', 'itemName productCode HSNCode')
      .populate('createdBy', 'name email');

    if (!updatedGRN) {
      return res.status(409).json({
        success: false,
        code: 'GRN_LIFECYCLE_CONFLICT',
        message: 'GRN changed while the Draft edit was being applied. Refresh and try again.'
      });
    }

    res.json({
      success: true,
      message: 'GRN updated successfully (Draft)',
      data: updatedGRN
    });
  } catch (error) {
    console.error('Update GRN error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.statusCode ? error.message : error.message
    });
  } finally {
    if (grnLease) {
      try {
        await StockMovementService.releaseStockLeases(req.dbConnection, grnLease);
      } catch (releaseError) {
        console.error('Failed to release GRN edit lease:', releaseError.message);
      }
    }
  }
};

export const deleteGRN = async (req, res) => {
  let grnLease = null;
  let session = null;
  try {
    const { GRN, PurchaseOrder } = getModels(req.dbConnection);
    const { id } = req.params;

    grnLease = await StockMovementService.acquireStockLeases(
      req.dbConnection,
      [`GRN:${id}`]
    );

    session = await req.dbConnection.startSession();
    await session.startTransaction();

    const grn = await GRN.findById(id).session(session);

    if (!grn) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'GRN not found'
      });
    }

    // Check if invoice has been created for this GRN
    if (grn.isInvoiceCreated) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: 'Cannot delete GRN. Supplier Invoice has already been created for this GRN.',
        invoiceId: grn.supplierInvoiceId,
        invoiceCreatedAt: grn.invoiceCreatedAt
      });
    }

    if (grn.status !== 'Draft') {
      await session.abortTransaction();
      return res.status(409).json({
        success: false,
        code: 'RECEIVED_GRN_REVERSAL_REQUIRED',
        message: 'Only Draft GRNs can be deleted. A received/inspected GRN must be reversed through a controlled stock-reversal workflow.'
      });
    }

    // The predicate is repeated at mutation time so an uncoordinated legacy
    // writer still cannot delete a posted or invoiced GRN.
    const deletedGRN = await GRN.findOneAndDelete({
      _id: id,
      status: 'Draft',
      isInvoiceCreated: { $ne: true }
    }).session(session);
    if (!deletedGRN) {
      await session.abortTransaction();
      return res.status(409).json({
        success: false,
        code: 'GRN_LIFECYCLE_CONFLICT',
        message: 'GRN changed while deletion was being applied. Refresh and try again.'
      });
    }

    const now = new Date();
    const claimedPOs = await PurchaseOrder.find({ convertedToGRNId: grn._id }).session(session);
    for (const po of claimedPOs) {
      const effectiveExpiry = getEffectivePOExpiration(po);
      const expiryElapsed = !effectiveExpiry || effectiveExpiry.getTime() <= now.getTime();
      const nextStatus = expiryElapsed ? 'Expired' : 'Approved';
      const update = {
        $set: {
          convertedToGRNId: null,
          convertedAt: null,
          status: nextStatus,
          expirationDate: effectiveExpiry
        }
      };

      if (po.status !== nextStatus) {
        update.$push = {
          statusHistory: {
            fromStatus: po.status,
            toStatus: nextStatus,
            changedAt: now,
            changedBy: req.user?._id || null,
            reason: `GRN ${grn.grnNo} was deleted and released this purchase order claim`
          }
        };
      }

      await PurchaseOrder.updateOne(
        { _id: po._id, convertedToGRNId: grn._id },
        update,
        { session, runValidators: true }
      );
    }

    await session.commitTransaction();

    res.json({
      success: true,
      message: 'GRN deleted successfully'
    });
  } catch (error) {
    if (session?.inTransaction()) await session.abortTransaction();
    console.error('Delete GRN error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.message
    });
  } finally {
    if (session) session.endSession();
    if (grnLease) {
      try {
        await StockMovementService.releaseStockLeases(req.dbConnection, grnLease);
      } catch (releaseError) {
        console.error('Failed to release GRN delete lease:', releaseError.message);
      }
    }
  }
};

export const getGRNStats = async (req, res) => {
  try {
    const { GRN, PurchaseOrder } = getModels(req.dbConnection);

    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    const [
      totalGRNs,
      monthlyGRNs,
      yearlyGRNs,
      statusCounts,
      totalValue,
      pendingResult
    ] = await Promise.all([
      GRN.countDocuments(),
      GRN.countDocuments({ createdAt: { $gte: startOfMonth } }),
      GRN.countDocuments({ createdAt: { $gte: startOfYear } }),
      GRN.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      GRN.aggregate([
        { $match: { status: { $ne: 'Cancelled' } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      PurchaseOrder.aggregate([
        { $match: { status: 'Approved' } },
        { $unwind: '$lines' },
        {
          $group: {
            _id: { poId: '$_id', productId: '$lines.productId' },
            orderedQuantity: { $sum: '$lines.quantity' }
          }
        },
        {
          $lookup: {
            from: GRN.collection.name,
            let: { poId: '$_id.poId', productId: '$_id.productId' },
            pipeline: [
              { $match: { status: { $ne: 'Cancelled' } } },
              { $unwind: '$items' },
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$items.productId', '$$productId'] },
                      {
                        $eq: [
                          { $ifNull: ['$items.sourcePOId', '$poId'] },
                          '$$poId'
                        ]
                      }
                    ]
                  }
                }
              },
              {
                $group: {
                  _id: null,
                  receivedQuantity: { $sum: { $ifNull: ['$items.receivedQuantity', 0] } }
                }
              }
            ],
            as: 'receipt'
          }
        },
        {
          $set: {
            receivedQuantity: {
              $ifNull: [{ $arrayElemAt: ['$receipt.receivedQuantity', 0] }, 0]
            }
          }
        },
        {
          $set: {
            remainingQuantity: {
              $max: [{ $subtract: ['$orderedQuantity', '$receivedQuantity'] }, 0]
            }
          }
        },
        { $match: { remainingQuantity: { $gt: 0 } } },
        { $group: { _id: '$_id.poId' } },
        { $count: 'count' }
      ])
    ]);

    res.json({
      success: true,
      data: {
        totalGRNs,
        monthlyGRNs,
        yearlyGRNs,
        statusCounts,
        totalValue: totalValue[0]?.total || 0,
        pendingGRN: pendingResult[0]?.count || 0,
        partialGRNs: statusCounts.find((status) => status._id === 'Partially Received')?.count || 0
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
    const { PurchaseOrder, GRN, Supplier } = getModels(req.dbConnection);
    const { search = '', supplierId = '' } = req.query;
    const now = new Date();
    const trimmedSearch = search.trim();

    if (supplierId && !mongoose.Types.ObjectId.isValid(supplierId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid supplier ID'
      });
    }

    const [primaryPOIds, additionalPOIds] = await Promise.all([
      GRN.distinct('poId'),
      GRN.distinct('poIds')
    ]);
    const usedPOIds = [...new Set(
      [...primaryPOIds, ...additionalPOIds].filter(Boolean).map((id) => id.toString())
    )].map((id) => new mongoose.Types.ObjectId(id));

    const query = {
      status: 'Approved',
      convertedToGRNId: null,
      _id: { $nin: usedPOIds },
      ...(supplierId && { supplierId: new mongoose.Types.ObjectId(supplierId) }),
      ...futureEffectiveExpiryPredicate(now)
    };

    if (trimmedSearch) {
      const safeSearch = escapeRegex(trimmedSearch);
      const matchingSuppliers = await Supplier.find({
        $or: [
          { name: { $regex: safeSearch, $options: 'i' } },
          { companyName: { $regex: safeSearch, $options: 'i' } }
        ]
      }).distinct('_id');

      query.$or = [
        { poNumber: { $regex: safeSearch, $options: 'i' } },
        { supplierId: { $in: matchingSuppliers } }
      ];
    }

    const purchaseOrders = await PurchaseOrder.find(query)
      .populate('supplierId', 'name companyName contactPerson email')
      .populate('warehouseId', 'name location')
      .populate('lines.productId', 'itemName productCode HSNCode description gst')
      .select('poNumber supplierId warehouseId lines orderDate expectedDate status approvedAt approvedBy expirationDate expirationExtended expirationNotified convertedToGRNId convertedAt createdAt updatedAt')
      .sort({ createdAt: -1 })
      .limit(20);

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