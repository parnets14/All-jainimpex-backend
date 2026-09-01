/**
 * SE App — Order Request Controller
 *
 * Instead of creating a SalesOrder directly, the SE app submits a
 * DealerOrderRequest (source: 'SE') that goes through web approval first.
 * Once approved on the web, admin creates the actual SalesOrder.
 */

import { getModels }                    from '../utils/getModels.js';
import { dealerOrderRequestSchema }     from '../../models/DealerOrderRequest.js';
import { calculateDiscountLine }        from '../../utils/sequentialDiscountPolicy.js';
import {
  findDealerExtraDiscount,
  findProductDiscount
} from './salesOrderController.js';

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

        // Resolve every discount driver on the server. Client cap/direct/extra
        // fields are informational only and cannot authorize an invalid request.
        const discountInfo = await findProductDiscount(
          product._id,
          product,
          dealer.dealerType,
          req.dbConnection,
          user.allowedDiscountLevels || []
        );
        const directDiscountPct = discountInfo?.directDiscountPct || 0;
        const masterDiscountCap = discountInfo?.masterDiscountCap ?? null;
        const combinedLevelDiscountCap = discountInfo?.combinedLevelDiscountCap ?? null;
        const configuredLevels = discountInfo?.configuredLevels || [];
        const manualDiscountLevels = item.manualDiscountLevels || {};
        const selectedDiscountLevels = [];
        const stages = [];
        let levelDiscountPct = 0;

        if (directDiscountPct > 0) {
          stages.push({ key: 'direct', kind: 'direct', ratePercentage: directDiscountPct });
        }
        for (const [levelName, rawRate] of Object.entries(manualDiscountLevels)) {
          const enteredPct = Number(rawRate || 0);
          if (enteredPct <= 0) continue;
          const configuredLevel = configuredLevels.find(level => level.levelName === levelName);
          if (!configuredLevel) {
            const error = new Error(`Discount level "${levelName}" is not configured for ${product.itemName}`);
            error.name = 'DiscountPolicyError';
            error.code = 'DISCOUNT_LEVEL_NOT_FOUND';
            throw error;
          }
          if (!(user.allowedDiscountLevels || []).includes(levelName)) {
            const error = new Error(`Not allowed to use discount level: ${levelName}`);
            error.name = 'DiscountPolicyError';
            error.code = 'DISCOUNT_LEVEL_NOT_ALLOWED';
            throw error;
          }
          const maximum = Number(configuredLevel.discountPercentage || 0);
          if (!Number.isFinite(enteredPct) || enteredPct < 0 || enteredPct > maximum) {
            const error = new Error(`Discount level "${levelName}" must be between 0 and ${maximum}%`);
            error.name = 'DiscountPolicyError';
            error.code = 'DISCOUNT_LEVEL_RATE_EXCEEDED';
            throw error;
          }
          selectedDiscountLevels.push(levelName);
          levelDiscountPct += enteredPct;
          stages.push({ key: `level:${levelName}`, kind: 'level', levelName, ratePercentage: enteredPct });
        }

        const dealerExtraDiscountPct = findDealerExtraDiscount(product, dealer);
        if (dealerExtraDiscountPct > 0) {
          stages.push({ key: 'dealer-extra', kind: 'dealer_extra', ratePercentage: dealerExtraDiscountPct });
        }
        if (!discountInfo && stages.length > 0) {
          const error = new Error(`No applicable discount mapping exists for ${product.itemName}`);
          error.name = 'DiscountPolicyError';
          error.code = 'DISCOUNT_MAPPING_NOT_FOUND';
          throw error;
        }
        const hasDiscountStages = stages.some(
          (stage) => Number(stage.ratePercentage || 0) > 0
        );
        const hasPositiveLevelStages = stages.some(
          (stage) => stage.kind === 'level' && Number(stage.ratePercentage || 0) > 0
        );
        if (discountInfo && hasDiscountStages && masterDiscountCap === null) {
          const error = new Error(`Master discount cap is not configured for ${product.itemName}`);
          error.name = 'DiscountPolicyError';
          error.code = 'MASTER_DISCOUNT_CAP_NOT_CONFIGURED';
          throw error;
        }
        if (hasPositiveLevelStages && combinedLevelDiscountCap === null) {
          const error = new Error(`Combined selected-level discount cap is not configured for ${product.itemName}`);
          error.name = 'DiscountPolicyError';
          error.code = 'COMBINED_LEVEL_DISCOUNT_CAP_NOT_CONFIGURED';
          throw error;
        }

        const lineSubtotal = dealerPrice * item.quantity;
        const calculation = calculateDiscountLine({
          baseAmount: lineSubtotal,
          stages,
          gstPercentage: Number(product.gst || 0),
          masterDiscountCap,
          combinedLevelDiscountCap,
          allowedDiscountLevels: user.allowedDiscountLevels || [],
          enforceLevelPermissions: true,
          bypassLevelPermission: false
        });
        const totalDiscountPct = calculation.effectiveDiscountPercentage;
        const discountAmount = calculation.discountAmount;
        const finalPrice = calculation.finalAmount;
        const gstAmount = calculation.gstAmount;
        const lineTotal = calculation.finalAmount;

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
          discountMappingId:       discountInfo?.discountMappingId || null,
          discountMappingName:     discountInfo?.discountMappingName || '',
          directDiscountPct,
          selectedDiscountLevels,
          manualDiscountLevels,
          levelDiscountPct,
          dealerExtraDiscountPct,
          totalDiscountPct,
          masterDiscountCap,
          combinedLevelDiscountCap,
          masterDiscountCapApplied: calculation.masterDiscountCapApplied,
          combinedLevelDiscountCapApplied: calculation.combinedLevelDiscountCapApplied,
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
      const { notifyNewDealerOrder } = await import('../../services/adminNotificationService.js');
      notifyNewDealerOrder(dealer.name, request.requestNumber, req.company || 'jain-impex');
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
    const isPolicyError = error?.name === 'DiscountPolicyError' || error instanceof RangeError;
    return res.status(isPolicyError ? 400 : 500).json({
      success: false,
      message: isPolicyError ? error.message : 'Failed to submit order request',
      ...(error.code ? { code: error.code } : {}),
      ...(!isPolicyError ? { error: error.message } : {})
    });
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
