/**
 * SE App — Order Request Controller
 *
 * Instead of creating a SalesOrder directly, the SE app submits a
 * DealerOrderRequest (source: 'SE') that goes through web approval first.
 * Once approved on the web, admin creates the actual SalesOrder.
 */

import { getModels }                    from '../utils/getModels.js';
import { dealerOrderRequestSchema }     from '../../models/DealerOrderRequest.js';

const getOrCreateDOR = (conn) =>
  conn.models.DealerOrderRequest || conn.model('DealerOrderRequest', dealerOrderRequestSchema);

// ── POST /api/se/order-requests ───────────────────────────────────────────────
// SE app submits a cart as an order request (pending web approval)
export const createOrderRequest = async (req, res) => {
  try {
    const user = req.user;
    const { dealerId, products, customerNotes } = req.body;
    const { Dealer, Product, DealerPricing } = getModels(req);
    const DealerOrderRequest = getOrCreateDOR(req.dbConnection);

    if (!dealerId || !products?.length) {
      return res.status(400).json({ success: false, message: 'Dealer and products are required' });
    }

    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      return res.status(404).json({ success: false, message: 'Dealer not found' });
    }

    // Build request products with pricing
    let grossAmount      = 0;
    let totalGst         = 0;
    let totalDiscountAmt = 0;

    const requestProducts = await Promise.all(
      products.map(async (item) => {
        const product = await Product.findById(item.productId)
          .populate('brand', 'name')
          .populate('category', 'name')
          .populate('subcategory', 'name')
          .lean();

        if (!product) return null;

        const pricing = await DealerPricing.findOne({ product: item.productId, isActive: true });
        // Use MRP (GST inclusive) as the base price
        const dealerPrice = product.mrp || product.totalAmount || ((pricing?.sellingPrice || product.rateSlabs?.[0]?.rate || 0) * (1 + (product.gst || 0) / 100));

        // Use discount data passed from the cart (already calculated on client)
        const directDiscountPct      = item.directDiscountPct      || 0;
        const dealerExtraDiscountPct = item.dealerExtraDiscountPct || 0;
        const manualDiscountLevels   = item.manualDiscountLevels   || {};

        // Derive selectedDiscountLevels (level names with pct > 0) and levelDiscountPct
        const selectedDiscountLevels = Object.entries(manualDiscountLevels)
          .filter(([, pct]) => (pct || 0) > 0)
          .map(([name]) => name);
        const levelDiscountPct = Object.values(manualDiscountLevels)
          .reduce((sum, pct) => sum + (parseFloat(pct) || 0), 0);

        const totalDiscountPct = directDiscountPct + levelDiscountPct + dealerExtraDiscountPct;

        // Apply discounts SEQUENTIALLY on MRP (not flat additive)
        const lineSubtotal = dealerPrice * item.quantity;
        let currentAmount = lineSubtotal;
        let discountAmount = 0;

        // 1. Direct discount
        if (directDiscountPct > 0) {
          const amt = currentAmount * (directDiscountPct / 100);
          currentAmount -= amt;
          discountAmount += amt;
        }
        // 2. Level discounts sequentially
        Object.entries(manualDiscountLevels).forEach(([, pct]) => {
          const p = parseFloat(pct) || 0;
          if (p > 0) {
            const amt = currentAmount * (p / 100);
            currentAmount -= amt;
            discountAmount += amt;
          }
        });
        // 3. Dealer extra discount
        if (dealerExtraDiscountPct > 0) {
          const amt = currentAmount * (dealerExtraDiscountPct / 100);
          currentAmount -= amt;
          discountAmount += amt;
        }

        discountAmount = Math.round(discountAmount * 100) / 100;
        const finalPrice = Math.round(currentAmount * 100) / 100;
        // GST is reverse-calculated (MRP already includes GST)
        const gstRate = product.gst || 0;
        const gstAmount = gstRate > 0 ? Math.round((finalPrice - finalPrice / (1 + gstRate / 100)) * 100) / 100 : 0;
        const lineTotal = finalPrice; // MRP after sequential discounts (GST already included)

        grossAmount += lineSubtotal;
        totalGst    += gstAmount;
        totalDiscountAmt += discountAmount;

        return {
          product:     item.productId,
          productCode: product.productCode || '',
          productName: product.itemName,
          HSNCode:     product.HSNCode || '',
          quantity:    item.quantity,
          unit:        product.unit || '',
          dealerPrice,
          gst:         product.gst || 0,
          totalPrice:  lineSubtotal,
          brand:       product.brand?.name || '',
          category:    product.category?.name || '',
          subcategory: product.subcategory?.name || '',
          warehouseId:   item.warehouseId || null,
          warehouseName: item.warehouseName || '',
          isOutOfStock:  item.isOutOfStock || false,
          // Discount fields
          discountMappingId:       item.discountMappingId || null,
          discountMappingName:     item.discountMappingName || '',
          directDiscountPct,
          selectedDiscountLevels,
          manualDiscountLevels:    item.manualDiscountLevels || {},
          levelDiscountPct,
          dealerExtraDiscountPct,
          totalDiscountPct,
          discountAmount,
          finalPrice,
          gstAmount,
          lineTotal,
        };
      })
    );

    const validProducts = requestProducts.filter(Boolean);
    if (validProducts.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid products found' });
    }

    // totalAmount = grossAmount - discount (GST already included in MRP, don't add)
    const totalAmount = grossAmount - totalDiscountAmt;

    // Generate SER-YYYY-NNNN request number
    const requestNumber = await DealerOrderRequest.generateRequestNumber('SE');

    const request = await DealerOrderRequest.create({
      requestNumber,
      dealer:              dealer._id,
      dealerName:          dealer.name,
      dealerCode:          dealer.code,
      dealerPhone:         dealer.phone || '',
      products:            validProducts,
      grossAmount,
      totalDiscount:       totalDiscountAmt,
      totalGst,
      totalAmount,
      notes:               customerNotes || '',
      status:              'Pending',
      source:              'SE',
      salesExecutive:      user._id,
      salesExecutiveName:  user.name,
      requestDate:         new Date(),
    });

    console.log(`✅ SE order request created: ${request.requestNumber} by ${user.name}`);

    // Notify admin via Firebase RTDB
    try {
      const { notifyNewOrderRequest } = await import('../../services/adminNotificationService.js');
      const company = req.company || 'jain-impex';
      notifyNewOrderRequest(company, {
        dealerName: dealer.name,
        orderNumber: request.requestNumber,
        amount: request.totalAmount,
      });
    } catch (e) { /* non-blocking */ }

    res.status(201).json({
      success: true,
      message: 'Order request submitted for approval',
      request: {
        _id:           request._id,
        requestNumber: request.requestNumber,
        status:        request.status,
        totalAmount:   request.totalAmount,
        dealerName:    dealer.name,
      },
    });
  } catch (error) {
    console.error('createOrderRequest error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit order request', error: error.message });
  }
};

// ── DELETE /api/se/order-requests/:id ────────────────────────────────────────
// SE can only delete their own Pending requests (not yet approved/rejected)
export const deleteOrderRequest = async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const DealerOrderRequest = getOrCreateDOR(req.dbConnection);

    const request = await DealerOrderRequest.findById(id);

    if (!request) {
      return res.status(404).json({ success: false, message: 'Order request not found' });
    }

    // Only the SE who submitted it can delete it
    if (request.salesExecutive?.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You can only delete your own requests' });
    }

    // Only Pending requests can be deleted
    if (request.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot delete a ${request.status} request. Only Pending requests can be deleted.`,
      });
    }

    await DealerOrderRequest.findByIdAndDelete(id);

    console.log(`🗑️ SE order request deleted: ${request.requestNumber} by ${user.name}`);

    res.json({
      success: true,
      message: 'Order request deleted successfully',
      requestNumber: request.requestNumber,
    });
  } catch (error) {
    console.error('deleteOrderRequest error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete order request', error: error.message });
  }
};
export const getMyOrderRequests = async (req, res) => {
  try {
    const user = req.user;
    const { status, page = 1, limit = 20 } = req.query;
    const DealerOrderRequest = getOrCreateDOR(req.dbConnection);

    const query = { source: 'SE', salesExecutive: user._id };
    if (status && status !== 'all') query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [requests, total] = await Promise.all([
      DealerOrderRequest.find(query)
        .sort({ requestDate: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      DealerOrderRequest.countDocuments(query),
    ]);

    res.json({
      success: true,
      requests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('getMyOrderRequests error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch order requests', error: error.message });
  }
};
