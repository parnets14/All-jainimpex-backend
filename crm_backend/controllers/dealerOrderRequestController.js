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
    const { company, status, page = 1, limit = 20, search } = req.query;
    if (!company) return res.status(400).json({ success: false, message: 'company query param required' });

    const db = getCompanyConnection(company);
    const { DealerOrderRequest } = getModels(db);

    const query = {};
    if (status && status !== 'All') query.status = status;
    if (search) {
      query.$or = [
        { requestNumber: { $regex: search, $options: 'i' } },
        { dealerName:    { $regex: search, $options: 'i' } },
        { dealerCode:    { $regex: search, $options: 'i' } },
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

    return res.json({
      success: true,
      requests,
      pagination: {
        currentPage:   parseInt(page),
        totalPages:    Math.ceil(total / parseInt(limit)),
        totalRequests: total,
        hasNext: skip + requests.length < total,
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

// ── GET /api/dealer-order-requests/:id/prefill?company=jain-impex ───────────
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
