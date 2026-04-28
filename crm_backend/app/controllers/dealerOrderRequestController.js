/**
 * Dealer Order Request Controller — App (Dealer-facing)
 * Dealers submit cart as a request; admin approves/rejects from web.
 */

import { dealerOrderRequestSchema } from '../../models/DealerOrderRequest.js';
import { dealerSchema }             from '../../models/Dealer.js';
import { productSchema }            from '../../models/Product.js';
import { dealerPricingSchema }      from '../../models/DealerPricing.js';
import { salesOrderSchema }         from '../../models/SalesOrder.js';

const getModels = (db) => ({
  DealerOrderRequest: db.models.DealerOrderRequest || db.model('DealerOrderRequest', dealerOrderRequestSchema),
  Dealer:             db.models.Dealer             || db.model('Dealer',             dealerSchema),
  Product:            db.models.Product            || db.model('Product',            productSchema),
  DealerPricing:      db.models.DealerPricing      || db.model('DealerPricing',      dealerPricingSchema),
  SalesOrder:         db.models.SalesOrder         || db.model('SalesOrder',         salesOrderSchema),
});

// ── POST /api/app/order-requests ─────────────────────────────────────────────
// Dealer submits cart as a new order request
export const createOrderRequest = async (req, res) => {
  try {
    const { DealerOrderRequest, Dealer, Product, DealerPricing } = getModels(req.dbConnection);

    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const { products: cartItems = [], notes = '' } = req.body;

    if (!cartItems.length) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    // Build product lines with pricing snapshot
    const productLines = [];
    let grossAmount = 0;
    let totalGst    = 0;

    for (const item of cartItems) {
      const product = await Product.findById(item.productId)
        .populate('brand', 'name')
        .populate('category', 'name')
        .populate('subcategory', 'name')
        .lean();

      if (!product) continue;

      // Get dealer price from DealerPricing (snapshot at request time)
      const pricing = await DealerPricing.findOne({ product: item.productId, isActive: true });
      const dealerPrice = pricing?.sellingPrice || product.rateSlabs?.[0]?.rate || 0;
      const gstRate     = product.gst || 0;
      const lineTotal   = dealerPrice * item.quantity;
      const lineGst     = (lineTotal * gstRate) / 100;

      grossAmount += lineTotal;
      totalGst    += lineGst;

      productLines.push({
        product:     product._id,
        productCode: product.productCode || '',
        productName: product.itemName    || '',
        HSNCode:     product.HSNCode     || '',
        quantity:    item.quantity,
        unit:        product.unit        || '',
        dealerPrice,
        gst:         gstRate,
        totalPrice:  lineTotal,
        brand:       product.brand?.name       || '',
        category:    product.category?.name    || '',
        subcategory: product.subcategory?.name || '',
      });
    }

    if (!productLines.length) {
      return res.status(400).json({ success: false, message: 'No valid products in cart' });
    }

    const requestNumber = await DealerOrderRequest.generateRequestNumber();

    const request = await DealerOrderRequest.create({
      requestNumber,
      dealer:      dealer._id,
      dealerName:  dealer.name,
      dealerCode:  dealer.code,
      dealerPhone: dealer.phone,
      products:    productLines,
      grossAmount,
      totalGst,
      totalAmount: grossAmount + totalGst,
      notes,
      status:      'Pending',
      requestDate: new Date(),
    });

    return res.status(201).json({
      success: true,
      message: 'Order request submitted successfully',
      request: {
        _id:           request._id,
        requestNumber: request.requestNumber,
        status:        request.status,
        totalAmount:   request.totalAmount,
        requestDate:   request.requestDate,
      },
    });
  } catch (error) {
    console.error('createOrderRequest error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET /api/app/order-requests ──────────────────────────────────────────────
// Dealer views their own requests + linked SOs
export const getMyOrderRequests = async (req, res) => {
  try {
    const { DealerOrderRequest, Dealer, SalesOrder } = getModels(req.dbConnection);

    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const { page = 1, limit = 20, status } = req.query;
    const query = { dealer: dealer._id };
    if (status && status !== 'All') query.status = status;

    const skip    = (parseInt(page) - 1) * parseInt(limit);
    const [requests, total] = await Promise.all([
      DealerOrderRequest.find(query)
        .sort({ requestDate: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      DealerOrderRequest.countDocuments(query),
    ]);

    // Attach linked SalesOrder summaries
    const enriched = await Promise.all(
      requests.map(async (req) => {
        let linkedSOs = [];
        if (req.salesOrders?.length) {
          linkedSOs = await SalesOrder.find({ _id: { $in: req.salesOrders } })
            .select('orderNumber status totalAmount orderDate products')
            .lean();
        }
        return { ...req, linkedSalesOrders: linkedSOs };
      })
    );

    return res.json({
      success: true,
      requests: enriched,
      pagination: {
        currentPage:  parseInt(page),
        totalPages:   Math.ceil(total / parseInt(limit)),
        totalRequests: total,
        hasNext: skip + requests.length < total,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error('getMyOrderRequests error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET /api/app/order-requests/:id ─────────────────────────────────────────
export const getOrderRequestDetail = async (req, res) => {
  try {
    const { DealerOrderRequest, Dealer, SalesOrder } = getModels(req.dbConnection);

    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const request = await DealerOrderRequest.findOne({
      _id: req.params.id,
      dealer: dealer._id,
    }).lean();

    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

    let linkedSalesOrders = [];
    if (request.salesOrders?.length) {
      linkedSalesOrders = await SalesOrder.find({ _id: { $in: request.salesOrders } })
        .select('orderNumber status totalAmount orderDate products')
        .lean();
    }

    return res.json({ success: true, request: { ...request, linkedSalesOrders } });
  } catch (error) {
    console.error('getOrderRequestDetail error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
