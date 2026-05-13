import mongoose from 'mongoose';
import { dealerSchema }                from '../../models/Dealer.js';
import { dealerLedgerSchema }          from '../../models/DealerLedger.js';
import { dealerInvoiceSchema }         from '../../models/DealerInvoice.js';
import { dealerPaymentSchema }         from '../../models/DealerPayment.js';
import { creditNoteSchema }            from '../../models/CreditNote.js';
import { productSchema }               from '../../models/Product.js';
import { productRecommendationSchema } from '../../models/ProductRecommendation.js';
import { regionSchema }                from '../../models/Region.js';
import { routeSchema }                 from '../../models/Route.js';
import { brandSchema }                 from '../../models/Brand.js';
import { categorySchema }              from '../../models/Category.js';
import { subcategorySchema }           from '../../models/Subcategory.js';
import { dealerCategorySchema }        from '../../models/DealerCategory.js';

// Helper — get or create model on a specific connection
const m = (conn, name, schema) => conn.models[name] || conn.model(name, schema);

// ── Get all models from company connection ────────────────────────────────────
const getModels = (conn) => ({
  Dealer:                m(conn, 'Dealer',                dealerSchema),
  DealerLedger:          m(conn, 'DealerLedger',          dealerLedgerSchema),
  DealerInvoice:         m(conn, 'DealerInvoice',         dealerInvoiceSchema),
  DealerPayment:         m(conn, 'DealerPayment',         dealerPaymentSchema),
  CreditNote:            m(conn, 'CreditNote',            creditNoteSchema),
  Product:               m(conn, 'Product',               productSchema),
  ProductRecommendation: m(conn, 'ProductRecommendation', productRecommendationSchema),
  Region:                m(conn, 'Region',                regionSchema),
  Route:                 m(conn, 'Route',                 routeSchema),
  Brand:                 m(conn, 'Brand',                 brandSchema),
  Category:              m(conn, 'Category',              categorySchema),
  Subcategory:           m(conn, 'Subcategory',           subcategorySchema),
  DealerCategory:        m(conn, 'DealerCategory',        dealerCategorySchema),
});

// ── GET /api/se/dealer-insights/:dealerId ─────────────────────────────────────
export const getDealerInsights = async (req, res) => {
  try {
    const { dealerId } = req.params;
    const models = getModels(req.dbConnection);
    const { Dealer, DealerLedger, DealerInvoice, DealerPayment, CreditNote,
            Product, ProductRecommendation } = models;

    console.log(`📊 Fetching dealer insights for: ${dealerId} in ${req.company}`);

    const dealer = await Dealer.findById(dealerId)
      .populate('regionId', 'name')
      .populate('routeId', 'name')
      .populate('allowedBrands', 'name')
      .populate('allowedCategories', 'name')
      .populate('allowedSubcategories', 'name')
      .lean();

    if (!dealer) {
      return res.status(404).json({ success: false, message: 'Dealer not found' });
    }

    console.log('✅ Dealer found:', dealer.name);

    // Run all calculations in parallel — each receives the models it needs
    const [outstandingData, ageingData, lastPurchaseData, purchaseHistoryData,
           schemePointsData, recommendationsData] = await Promise.all([
      calculateOutstanding(dealerId, dealer, { DealerInvoice }),
      calculateAgeing(dealerId, { DealerLedger }),
      getLastPurchase(dealerId, { DealerInvoice, Product }),
      getPurchaseHistory(dealerId, { DealerInvoice }),
      calculateSchemePoints(dealerId, { DealerLedger }),
      getProductRecommendations(dealerId, { ProductRecommendation, Product }),
    ]);

    const insights = {
      dealer: {
        id:            dealer._id,
        code:          dealer.code,
        name:          dealer.name,
        contactPerson: dealer.contactPerson,
        phone:         dealer.phone,
        email:         dealer.email,
        address:       dealer.address,
        altAddress:    dealer.altAddress,
        city:          dealer.location?.addressComponents?.city || '',
        state:         dealer.location?.addressComponents?.state || '',
        location:      dealer.location,
        dealerType:    dealer.dealerType,
        gst:           dealer.gst,
        pan:           dealer.pan,
        aadhar:        dealer.aadhar,
        creditLimit:   dealer.creditLimit,
        creditDays:    dealer.creditDays,
        creditDaysRegular: dealer.creditDaysRegular,
        creditDaysCD:  dealer.creditDaysCD,
        salesTarget:   dealer.salesTarget,
        advanceBalance: dealer.advanceBalance,
        isActive:      dealer.isActive,
        totalOrders:   dealer.totalOrders,
        totalValue:    dealer.totalValue,
        region:        dealer.regionId,
        route:         dealer.routeId,
        allowedBrands:       dealer.allowedBrands,
        allowedCategories:   dealer.allowedCategories,
        allowedSubcategories: dealer.allowedSubcategories,
        extraDiscounts: dealer.extraDiscounts || [],
        image:         dealer.image,
        createdAt:     dealer.createdAt,
      },
      outstanding:     outstandingData,
      ageing:          ageingData,
      lastPurchase:    lastPurchaseData,
      purchaseHistory: purchaseHistoryData,
      schemePoints:    schemePointsData,
      recommendations: recommendationsData,
      lastUpdated:     new Date(),
    };

    res.json({ success: true, insights });

  } catch (error) {
    console.error('Get dealer insights error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dealer insights',
      error: error.message,
    });
  }
};

// ── GET /api/se/dealer-insights/:dealerId/profile ─────────────────────────────
// Full dealer profile — all fields from Dealer master
export const getDealerProfile = async (req, res) => {
  try {
    const { dealerId } = req.params;
    const { Dealer, Region, Route } = getModels(req.dbConnection);

    const dealer = await Dealer.findById(dealerId)
      .populate('regionId',  'name')
      .populate('routeId',   'name')
      .populate('allowedBrands',        'name')
      .populate('allowedCategories',    'name')
      .populate('allowedSubcategories', 'name')
      .populate('dealerCategory',       'name')
      .lean();

    if (!dealer) {
      return res.status(404).json({ success: false, message: 'Dealer not found' });
    }

    res.json({ success: true, dealer });
  } catch (error) {
    console.error('getDealerProfile error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Helper: Calculate Outstanding ────────────────────────────────────────────
async function calculateOutstanding(dealerId, dealer, { DealerInvoice }) {
  try {
    const dealerObjectId = new mongoose.Types.ObjectId(String(dealerId));

    const invoices = await DealerInvoice.find({
      dealer: dealerObjectId,
      status: { $ne: 'Cancelled' },
      isDeleted: { $ne: true },
    }).select('totalAmount paidAmount pendingAmount invoiceDate dueDate creditDays paymentStatus');

    const now = new Date();
    let totalOutstanding = 0, totalInvoiced = 0, totalPaid = 0;
    let totalCreditDaysLeft = 0, unpaidCount = 0;
    let overdueCount = 0, overdueAmount = 0;
    let nearExpiryCount = 0, nearExpiryAmount = 0; // Due within 7 days

    invoices.forEach(inv => {
      const outstanding = inv.pendingAmount != null
        ? inv.pendingAmount
        : ((inv.totalAmount || 0) - (inv.paidAmount || 0));
      totalInvoiced    += inv.totalAmount || 0;
      totalPaid        += inv.paidAmount  || 0;
      totalOutstanding += outstanding;

      if (outstanding > 0 && inv.dueDate) {
        const daysLeft = Math.ceil((new Date(inv.dueDate) - now) / 86400000);
        totalCreditDaysLeft += daysLeft;
        unpaidCount++;

        if (daysLeft < 0) {
          // Overdue
          overdueCount++;
          overdueAmount += outstanding;
        } else if (daysLeft <= 7) {
          // Near to expiry (due within 7 days)
          nearExpiryCount++;
          nearExpiryAmount += outstanding;
        }
      }
    });

    const creditLimit        = dealer.creditLimit || 0;
    const utilizationPercent = creditLimit > 0 ? (totalOutstanding / creditLimit) * 100 : 0;
    const avgCreditDaysLeft  = unpaidCount > 0
      ? Math.round(totalCreditDaysLeft / unpaidCount)
      : (dealer.creditDays || 0);

    let status = 'safe';
    if (utilizationPercent >= 90 || avgCreditDaysLeft < 0) status = 'critical';
    else if (utilizationPercent >= 70 || avgCreditDaysLeft < 5) status = 'warning';

    console.log('💰 Outstanding calculation:', {
      totalInvoiced, totalPaid, totalOutstanding,
      utilizationPercent: Math.round(utilizationPercent), creditLimit, status,
      overdueCount, overdueAmount, nearExpiryCount, nearExpiryAmount,
    });

    return {
      total:              Math.max(0, totalOutstanding),
      creditLimit,
      creditDays:         dealer.creditDays || 0,
      creditDaysRegular:  dealer.creditDaysRegular || 0,
      creditDaysCD:       dealer.creditDaysCD || 0,
      creditDaysLeft:     avgCreditDaysLeft,
      utilizationPercent: Math.max(0, Math.round(utilizationPercent)),
      status,
      entriesCount:       invoices.length,
      // Overdue & Near Expiry breakdown
      overdue: {
        count:  overdueCount,
        amount: overdueAmount,
      },
      nearExpiry: {
        count:  nearExpiryCount,
        amount: nearExpiryAmount,
      },
    };
  } catch (error) {
    console.error('Calculate outstanding error:', error);
    return {
      total: 0, creditLimit: dealer.creditLimit || 0,
      creditDays: dealer.creditDays || 0,
      creditDaysRegular: dealer.creditDaysRegular || 0,
      creditDaysCD: dealer.creditDaysCD || 0,
      creditDaysLeft: dealer.creditDays || 0,
      utilizationPercent: 0, status: 'safe', entriesCount: 0,
      overdue: { count: 0, amount: 0 },
      nearExpiry: { count: 0, amount: 0 },
    };
  }
}

// ── Helper: Calculate Ageing ──────────────────────────────────────────────────
async function calculateAgeing(dealerId, { DealerLedger }) {
  try {
    const ledgerEntries = await DealerLedger.find({
      dealer: dealerId,
      runningBalance: { $gt: 0 },
    });

    const ageing = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };

    ledgerEntries.forEach(entry => {
      const days   = entry.agingDays || 0;
      const amount = entry.runningBalance;
      if      (days <= 30) ageing['0-30']  += amount;
      else if (days <= 60) ageing['31-60'] += amount;
      else if (days <= 90) ageing['61-90'] += amount;
      else                 ageing['90+']   += amount;
    });

    return ageing;
  } catch (error) {
    console.error('Calculate ageing error:', error);
    return { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  }
}

// ── Helper: Get Last Purchase ─────────────────────────────────────────────────
async function getLastPurchase(dealerId, { DealerInvoice, Product }) {
  try {
    const dealerObjectId = new mongoose.Types.ObjectId(String(dealerId));
    console.log('🔍 Searching for last purchase for dealer:', dealerId);

    const lastInvoice = await DealerInvoice.findOne({
      dealer: dealerObjectId,
      status: { $ne: 'Cancelled' },
    })
      .sort({ createdAt: -1 })
      .populate('items.product', 'itemName productCode')
      .lean();

    if (!lastInvoice) {
      return { date: null, invoiceNumber: null, products: [], totalValue: 0, daysSinceLastPurchase: null };
    }

    const daysSince = Math.floor((new Date() - new Date(lastInvoice.invoiceDate)) / 86400000);

    const products = (lastInvoice.items || []).slice(0, 5).map(item => ({
      name:     item.productName || item.product?.itemName || 'Unknown',
      code:     item.productCode || item.product?.productCode || 'N/A',
      quantity: item.quantity || 0,
      value:    item.totalPrice || (item.quantity * item.unitPrice) || 0,
    }));

    return {
      date:                  lastInvoice.invoiceDate,
      invoiceNumber:         lastInvoice.invoiceNumber,
      products,
      totalValue:            lastInvoice.totalAmount || 0,
      daysSinceLastPurchase: daysSince,
    };
  } catch (error) {
    console.error('❌ Get last purchase error:', error);
    return { date: null, invoiceNumber: null, products: [], totalValue: 0, daysSinceLastPurchase: null };
  }
}

// ── Helper: Get Purchase History ──────────────────────────────────────────────
async function getPurchaseHistory(dealerId, { DealerInvoice }) {
  try {
    const dealerObjectId = new mongoose.Types.ObjectId(String(dealerId));
    const now = new Date();
    const d30 = new Date(now); d30.setDate(d30.getDate() - 30);
    const d60 = new Date(now); d60.setDate(d60.getDate() - 60);
    const d90 = new Date(now); d90.setDate(d90.getDate() - 90);

    const [last30, last60, last90, totalOrders] = await Promise.all([
      DealerInvoice.aggregate([
        { $match: { dealer: dealerObjectId, invoiceDate: { $gte: d30 }, status: { $ne: 'Cancelled' } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ]),
      DealerInvoice.aggregate([
        { $match: { dealer: dealerObjectId, invoiceDate: { $gte: d60 }, status: { $ne: 'Cancelled' } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ]),
      DealerInvoice.aggregate([
        { $match: { dealer: dealerObjectId, invoiceDate: { $gte: d90 }, status: { $ne: 'Cancelled' } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ]),
      DealerInvoice.countDocuments({ dealer: dealerObjectId, status: { $ne: 'Cancelled' } }),
    ]);

    const last30Total = last30[0]?.total || 0;
    const last30Count = last30[0]?.count || 0;

    return {
      last30Days:         last30Total,
      last60Days:         last60[0]?.total || 0,
      last90Days:         last90[0]?.total || 0,
      averageOrderValue:  last30Count > 0 ? Math.round(last30Total / last30Count) : 0,
      totalOrders,
    };
  } catch (error) {
    console.error('Get purchase history error:', error);
    return { last30Days: 0, last60Days: 0, last90Days: 0, averageOrderValue: 0, totalOrders: 0 };
  }
}

// ── Helper: Calculate Scheme Points ──────────────────────────────────────────
async function calculateSchemePoints(dealerId, { DealerLedger }) {
  try {
    const dealerObjectId = new mongoose.Types.ObjectId(String(dealerId));
    const pointsData = await DealerLedger.aggregate([
      { $match: { dealer: dealerObjectId } },
      { $group: { _id: null, totalEarned: { $sum: '$pointsEarned' }, totalRedeemed: { $sum: '$pointsRedeemed' } } },
    ]);

    const earned   = pointsData[0]?.totalEarned   || 0;
    const redeemed = pointsData[0]?.totalRedeemed || 0;

    return { totalEarned: earned, totalRedeemed: redeemed, availablePoints: earned - redeemed, schemes: [] };
  } catch (error) {
    console.error('Calculate scheme points error:', error);
    return { totalEarned: 0, totalRedeemed: 0, availablePoints: 0, schemes: [] };
  }
}

// ── Helper: Get Product Recommendations ──────────────────────────────────────
async function getProductRecommendations(dealerId, { ProductRecommendation, Product }) {
  try {
    const dealerObjectId = new mongoose.Types.ObjectId(String(dealerId));

    const recs = await ProductRecommendation.find({
      dealer: dealerObjectId,
      status: 'Active',
      $or: [
        { validUntil: { $exists: false } },
        { validUntil: null },
        { validUntil: { $gte: new Date() } },
      ],
    })
      .populate('product', 'itemName productCode')
      .sort({ priority: 1 })
      .limit(10)
      .lean();

    return recs.map(rec => ({
      product:       rec.product?._id,
      productName:   rec.product?.itemName  || rec.productName,
      productCode:   rec.product?.productCode || rec.productCode,
      reason:        rec.reason,
      priority:      rec.priority,
      suggestedAction: rec.suggestedAction,
      isManual:      true,
    }));
  } catch (error) {
    console.error('Get product recommendations error:', error);
    return [];
  }
}

// ── GET /api/se/dealer-insights/:dealerId/outstanding ─────────────────────────
export const getOutstandingSummary = async (req, res) => {
  try {
    const { dealerId } = req.params;
    const { Dealer, DealerInvoice } = getModels(req.dbConnection);

    const dealer = await Dealer.findById(dealerId);
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const outstandingData = await calculateOutstanding(dealerId, dealer, { DealerInvoice });
    res.json({ success: true, outstanding: outstandingData });
  } catch (error) {
    console.error('Get outstanding summary error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET /api/se/dealer-insights/:dealerId/ageing ──────────────────────────────
export const getAgeingAnalysis = async (req, res) => {
  try {
    const { dealerId } = req.params;
    const { DealerLedger } = getModels(req.dbConnection);

    const ageingData = await calculateAgeing(dealerId, { DealerLedger });
    res.json({ success: true, ageing: ageingData });
  } catch (error) {
    console.error('Get ageing analysis error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
