/**
 * Dealer Order Request Controller — Web (Admin-facing)
 * Admin can list, approve, reject, and link Sales Orders to requests.
 */

import { getCompanyConnection } from '../config/multiDatabase.js';
import { dealerOrderRequestSchema } from '../models/DealerOrderRequest.js';
import { dealerSchema }             from '../models/Dealer.js';
import { salesOrderSchema }         from '../models/SalesOrder.js';
import { createAndSendNotification } from '../services/firebaseNotificationService.js';

const getModels = (db) => ({
  DealerOrderRequest: db.models.DealerOrderRequest || db.model('DealerOrderRequest', dealerOrderRequestSchema),
  Dealer:             db.models.Dealer             || db.model('Dealer',             dealerSchema),
  SalesOrder:         db.models.SalesOrder         || db.model('SalesOrder',         salesOrderSchema),
});

// ── GET /api/dealer-order-requests?company=jain-impex ───────────────────────
export const listOrderRequests = async (req, res) => {
  try {
    const { company, status, page = 1, limit = 20, search, hideFulfilled, dateFrom, dateTo } = req.query;
    if (!company) return res.status(400).json({ success: false, message: 'company query param required' });

    const db = getCompanyConnection(company);
    const { DealerOrderRequest, SalesOrder } = getModels(db);

    const query = {};
    if (status && status !== 'All') query.status = status;
    if (search) {
      query.$or = [
        { requestNumber: { $regex: search, $options: 'i' } },
        { dealerName:    { $regex: search, $options: 'i' } },
        { dealerCode:    { $regex: search, $options: 'i' } },
      ];
    }
    // Date range filter
    if (dateFrom || dateTo) {
      query.requestDate = {};
      if (dateFrom) query.requestDate.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query.requestDate.$lte = end;
      }
    }
    // Hide fulfilled = approved requests that already have a linked SO
    if (hideFulfilled === 'true') {
      query.$nor = [
        { status: 'Approved', salesOrders: { $exists: true, $not: { $size: 0 } } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [requests, total] = await Promise.all([
      DealerOrderRequest.find(query)
        .sort({ requestDate: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      DealerOrderRequest.countDocuments(query),
    ]);

    // Populate linked Sales Orders with real data (orderNumber, status, totalAmount)
    const allSoIds = requests.flatMap(r => r.salesOrders || []);
    let soMap = {};
    if (allSoIds.length > 0) {
      const sos = await SalesOrder.find({ _id: { $in: allSoIds } })
        .select('orderNumber status totalAmount orderDate')
        .lean();
      sos.forEach(so => { soMap[so._id.toString()] = so; });
    }

    const enriched = requests.map(r => ({
      ...r,
      linkedSalesOrders: (r.salesOrders || []).map(id => soMap[id.toString()] || { _id: id }),
      soCreated: (r.salesOrders || []).length > 0,
    }));

    return res.json({
      success: true,
      requests: enriched,
      pagination: {
        currentPage:   parseInt(page),
        totalPages:    Math.ceil(total / parseInt(limit)),
        totalRequests: total,
        hasNext: skip + enriched.length < total,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error('listOrderRequests error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET /api/dealer-order-requests/:id?company=jain-impex ───────────────────
export const getOrderRequest = async (req, res) => {
  try {
    const { company } = req.query;
    if (!company) return res.status(400).json({ success: false, message: 'company query param required' });

    const db = getCompanyConnection(company);
    const { DealerOrderRequest, SalesOrder } = getModels(db);

    const request = await DealerOrderRequest.findById(req.params.id).lean();
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

    let linkedSalesOrders = [];
    if (request.salesOrders?.length) {
      linkedSalesOrders = await SalesOrder.find({ _id: { $in: request.salesOrders } })
        .select('orderNumber status totalAmount orderDate products')
        .lean();
    }

    return res.json({ success: true, request: { ...request, linkedSalesOrders } });
  } catch (error) {
    console.error('getOrderRequest error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── PATCH /api/dealer-order-requests/:id/approve?company=jain-impex ─────────
export const approveOrderRequest = async (req, res) => {
  try {
    const { company } = req.query;
    if (!company) return res.status(400).json({ success: false, message: 'company query param required' });

    const db = getCompanyConnection(company);
    const { DealerOrderRequest } = getModels(db);

    const request = await DealerOrderRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.status !== 'Pending') {
      return res.status(400).json({ success: false, message: `Cannot approve a ${request.status} request` });
    }

    request.status     = 'Approved';
    request.approvedAt = new Date();
    request.approvedBy = req.user._id;
    await request.save();

    // Send push notification to dealer
    try {
      const { Dealer } = getModels(db);
      const dealer = await Dealer.findById(request.dealer).select('fcmToken').lean();
      await createAndSendNotification({
        db,
        dealerId: request.dealer,
        fcmToken: dealer?.fcmToken,
        type: 'order_request',
        title: 'Order Request Approved',
        message: `Your order request ${request.requestNumber} has been approved. A sales order will be created shortly.`,
        priority: 'high',
        metadata: { requestId: request._id.toString(), requestNumber: request.requestNumber },
      });
    } catch (notifErr) {
      console.error('Notification error (non-fatal):', notifErr.message);
    }

    return res.json({ success: true, message: 'Request approved', request });
  } catch (error) {
    console.error('approveOrderRequest error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── PATCH /api/dealer-order-requests/:id/reject?company=jain-impex ──────────
export const rejectOrderRequest = async (req, res) => {
  try {
    const { company } = req.query;
    if (!company) return res.status(400).json({ success: false, message: 'company query param required' });

    const db = getCompanyConnection(company);
    const { DealerOrderRequest } = getModels(db);

    const request = await DealerOrderRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.status !== 'Pending') {
      return res.status(400).json({ success: false, message: `Cannot reject a ${request.status} request` });
    }

    const { reason = '' } = req.body;
    request.status          = 'Rejected';
    request.rejectedAt      = new Date();
    request.rejectedBy      = req.user._id;
    request.rejectionReason = reason;
    await request.save();

    // Send push notification to dealer about rejection
    try {
      const { Dealer } = getModels(db);
      const dealer = await Dealer.findById(request.dealer).select('fcmToken').lean();
      await createAndSendNotification({
        db,
        dealerId: request.dealer,
        fcmToken: dealer?.fcmToken,
        type: 'order_request',
        title: 'Order Request Rejected',
        message: `Your order request ${request.requestNumber} has been rejected.${reason ? ` Reason: ${reason}` : ''}`,
        priority: 'high',
        metadata: { requestId: request._id.toString(), requestNumber: request.requestNumber, reason },
      });
    } catch (notifErr) {
      console.error('Notification error (non-fatal):', notifErr.message);
    }

    return res.json({ success: true, message: 'Request rejected', request });
  } catch (error) {
    console.error('rejectOrderRequest error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── PATCH /api/dealer-order-requests/:id/link-so?company=jain-impex ─────────
// Called after admin creates a Sales Order — links the SO back to the request
export const linkSalesOrder = async (req, res) => {
  try {
    const { company } = req.query;
    if (!company) return res.status(400).json({ success: false, message: 'company query param required' });

    const db = getCompanyConnection(company);
    const { DealerOrderRequest, SalesOrder } = getModels(db);

    const { salesOrderId } = req.body;
    if (!salesOrderId) return res.status(400).json({ success: false, message: 'salesOrderId required' });

    const [request, so] = await Promise.all([
      DealerOrderRequest.findById(req.params.id),
      SalesOrder.findById(salesOrderId),
    ]);

    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (!so)      return res.status(404).json({ success: false, message: 'Sales Order not found' });

    // Add SO to request's salesOrders array (avoid duplicates)
    if (!request.salesOrders.map(String).includes(String(salesOrderId))) {
      request.salesOrders.push(salesOrderId);
      await request.save();
    }

    return res.json({ success: true, message: 'Sales Order linked to request', request });
  } catch (error) {
    console.error('linkSalesOrder error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── POST /api/dealer-order-requests/:id/auto-link?company=jain-impex ────────
// Finds SOs created for the same dealer after this request was approved
// and links them automatically. Used when admin created SO without requestId param.
export const autoLinkSalesOrders = async (req, res) => {
  try {
    const { company } = req.query;
    if (!company) return res.status(400).json({ success: false, message: 'company query param required' });

    const db = getCompanyConnection(company);
    const { DealerOrderRequest, SalesOrder } = getModels(db);

    const request = await DealerOrderRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.status !== 'Approved') {
      return res.status(400).json({ success: false, message: 'Only approved requests can be linked' });
    }

    // Find SOs for the same dealer created after the request was approved (or submitted)
    const afterDate = request.approvedAt || request.requestDate;
    const windowEnd = new Date(afterDate);
    windowEnd.setDate(windowEnd.getDate() + 7); // look within 7 days after approval

    const candidateSOs = await SalesOrder.find({
      dealer: request.dealer,
      createdAt: { $gte: afterDate, $lte: windowEnd },
    }).select('_id orderNumber status totalAmount orderDate createdAt').lean();

    if (candidateSOs.length === 0) {
      return res.json({ success: true, linked: 0, message: 'No matching Sales Orders found in the 7-day window after approval' });
    }

    // Link all candidates that aren't already linked
    const existingIds = request.salesOrders.map(String);
    let linked = 0;
    for (const so of candidateSOs) {
      if (!existingIds.includes(String(so._id))) {
        request.salesOrders.push(so._id);
        linked++;
      }
    }

    if (linked > 0) await request.save();

    return res.json({
      success: true,
      linked,
      message: linked > 0 ? `Linked ${linked} Sales Order(s)` : 'All matching SOs were already linked',
      linkedOrders: candidateSOs,
    });
  } catch (error) {
    console.error('autoLinkSalesOrders error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};


// Returns data formatted for pre-filling the Sales Order Dashboard form
export const getPrefillData = async (req, res) => {
  try {
    const { company } = req.query;
    if (!company) return res.status(400).json({ success: false, message: 'company query param required' });

    const db = getCompanyConnection(company);
    const { DealerOrderRequest, Dealer } = getModels(db);

    const request = await DealerOrderRequest.findById(req.params.id).lean();
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.status !== 'Approved') {
      return res.status(400).json({ success: false, message: 'Only approved requests can be converted to Sales Orders' });
    }

    const dealer = await Dealer.findById(request.dealer).lean();

    return res.json({
      success: true,
      prefill: {
        requestId:   request._id,
        requestNumber: request.requestNumber,
        dealer:      dealer,
        dealerId:    request.dealer,
        dealerName:  request.dealerName,
        dealerCode:  request.dealerCode,
        products:    request.products.map(p => ({
          productId:   p.product,
          productCode: p.productCode,
          productName: p.productName,
          quantity:    p.quantity,
          dealerPrice: p.dealerPrice,
          gst:         p.gst,
        })),
        notes: request.notes,
      },
    });
  } catch (error) {
    console.error('getPrefillData error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
