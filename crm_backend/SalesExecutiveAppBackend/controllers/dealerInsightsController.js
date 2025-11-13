import mongoose from 'mongoose';
import Dealer from '../../models/Dealer.js';
import DealerLedger from '../../models/DealerLedger.js';
import DealerInvoice from '../../models/DealerInvoice.js';
import DealerPayment from '../../models/DealerPayment.js';
import CreditNote from '../../models/CreditNote.js';
import Product from '../../models/Product.js';
import ProductRecommendation from '../../models/ProductRecommendation.js';

// Get complete dealer insights
export const getDealerInsights = async (req, res) => {
  try {
    const { dealerId } = req.params;

    console.log('📊 Fetching dealer insights for:', dealerId);

    // Get dealer details
    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      console.log('❌ Dealer not found:', dealerId);
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }

    console.log('✅ Dealer found:', dealer.name);

    // 1. Calculate Outstanding & Credit Status
    const outstandingData = await calculateOutstanding(dealerId, dealer);

    // 2. Calculate Ageing Analysis
    const ageingData = await calculateAgeing(dealerId);

    // 3. Get Last Purchase
    const lastPurchaseData = await getLastPurchase(dealerId);

    // 4. Get Purchase History
    const purchaseHistoryData = await getPurchaseHistory(dealerId);

    // 5. Calculate Scheme Points
    const schemePointsData = await calculateSchemePoints(dealerId);

    // 6. Get Product Recommendations
    const recommendationsData = await getProductRecommendations(dealerId);

    // Compile complete insights
    const insights = {
      dealer: {
        id: dealer._id,
        code: dealer.code,
        name: dealer.name,
        contactPerson: dealer.contactPerson,
        phone: dealer.phone,
        email: dealer.email
      },
      outstanding: outstandingData,
      ageing: ageingData,
      lastPurchase: lastPurchaseData,
      purchaseHistory: purchaseHistoryData,
      schemePoints: schemePointsData,
      recommendations: recommendationsData,
      lastUpdated: new Date()
    };

    res.json({
      success: true,
      insights
    });

  } catch (error) {
    console.error('Get dealer insights error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dealer insights',
      error: error.message
    });
  }
};

// Helper: Calculate Outstanding
async function calculateOutstanding(dealerId, dealer) {
  try {
    const dealerObjectId = new mongoose.Types.ObjectId(dealerId);

    // Get all non-cancelled invoices with their payment status
    const invoices = await DealerInvoice.find({
      dealer: dealerObjectId,
      status: { $ne: 'Cancelled' } // Include all except cancelled
    }).select('totalAmount paidAmount invoiceDate dueDate creditDays paymentStatus');

    // Calculate outstanding from invoices (totalAmount - paidAmount)
    let totalOutstanding = 0;
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalCreditDaysLeft = 0;
    let unpaidInvoicesCount = 0;

    invoices.forEach(invoice => {
      const invoiceAmount = invoice.totalAmount || 0;
      const paidAmount = invoice.paidAmount || 0;
      const outstanding = invoiceAmount - paidAmount;

      totalInvoiced += invoiceAmount;
      totalPaid += paidAmount;
      totalOutstanding += outstanding;

      // Calculate credit days left for unpaid/partially paid invoices
      if (outstanding > 0 && invoice.dueDate) {
        const daysLeft = Math.ceil((new Date(invoice.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
        totalCreditDaysLeft += daysLeft;
        unpaidInvoicesCount++;
      }
    });

    const creditLimit = dealer.creditLimit || 0;
    const creditDays = dealer.creditDays || 0;

    // Calculate credit utilization
    const utilizationPercent = creditLimit > 0 ? (totalOutstanding / creditLimit) * 100 : 0;

    // Calculate average credit days left
    const avgCreditDaysLeft = unpaidInvoicesCount > 0 
      ? Math.round(totalCreditDaysLeft / unpaidInvoicesCount) 
      : creditDays;

    // Determine status
    let status = 'safe';
    if (utilizationPercent >= 90 || avgCreditDaysLeft < 0) {
      status = 'critical';
    } else if (utilizationPercent >= 70 || avgCreditDaysLeft < 5) {
      status = 'warning';
    }

    console.log('💰 Outstanding calculation:', {
      totalInvoiced,
      totalPaid,
      totalOutstanding,
      utilizationPercent: Math.round(utilizationPercent),
      creditLimit,
      status
    });

    return {
      total: Math.max(0, totalOutstanding), // Ensure non-negative
      creditLimit,
      creditDays,
      creditDaysLeft: avgCreditDaysLeft,
      utilizationPercent: Math.max(0, Math.round(utilizationPercent)), // Ensure non-negative
      status,
      entriesCount: invoices.length
    };
  } catch (error) {
    console.error('Calculate outstanding error:', error);
    return {
      total: 0,
      creditLimit: dealer.creditLimit || 0,
      creditDays: dealer.creditDays || 0,
      creditDaysLeft: dealer.creditDays || 0,
      utilizationPercent: 0,
      status: 'safe',
      entriesCount: 0
    };
  }
}

// Helper: Calculate Ageing
async function calculateAgeing(dealerId) {
  try {
    const ledgerEntries = await DealerLedger.find({
      dealer: dealerId,
      runningBalance: { $gt: 0 }
    });

    const ageing = {
      '0-30': 0,
      '31-60': 0,
      '61-90': 0,
      '90+': 0
    };

    ledgerEntries.forEach(entry => {
      const days = entry.agingDays || 0;
      const amount = entry.runningBalance;

      if (days <= 30) {
        ageing['0-30'] += amount;
      } else if (days <= 60) {
        ageing['31-60'] += amount;
      } else if (days <= 90) {
        ageing['61-90'] += amount;
      } else {
        ageing['90+'] += amount;
      }
    });

    return ageing;
  } catch (error) {
    console.error('Calculate ageing error:', error);
    return { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  }
}

// Helper: Get Last Purchase
async function getLastPurchase(dealerId) {
  try {
    const dealerObjectId = new mongoose.Types.ObjectId(dealerId);
    
    console.log('🔍 Searching for last purchase for dealer:', dealerId);
    
    // First, check if any invoices exist
    const invoiceCount = await DealerInvoice.countDocuments({
      dealer: dealerObjectId
    });
    
    console.log(`📊 Total invoices for dealer: ${invoiceCount}`);
    
    // Get the last created invoice regardless of status
    const lastInvoice = await DealerInvoice.findOne({
      dealer: dealerObjectId,
      status: { $ne: 'Cancelled' } // Exclude only cancelled invoices
    })
      .sort({ createdAt: -1 }) // Sort by creation date, not invoice date
      .populate('items.product', 'itemName productCode')
      .lean();

    if (!lastInvoice) {
      console.log('⚠️ No invoices found for dealer:', dealerId);
      return {
        date: null,
        invoiceNumber: null,
        products: [],
        totalValue: 0,
        daysSinceLastPurchase: null
      };
    }

    const daysSince = Math.floor((new Date() - new Date(lastInvoice.invoiceDate)) / (1000 * 60 * 60 * 24));

    console.log('🛒 Last purchase found:', {
      invoiceNumber: lastInvoice.invoiceNumber,
      date: lastInvoice.invoiceDate,
      status: lastInvoice.status,
      itemsCount: lastInvoice.items?.length || 0,
      totalAmount: lastInvoice.totalAmount,
      daysSince
    });

    // Extract products from items
    const products = (lastInvoice.items || []).slice(0, 5).map(item => {
      console.log('📦 Item:', {
        productName: item.productName,
        productCode: item.productCode,
        quantity: item.quantity,
        totalPrice: item.totalPrice
      });
      
      return {
        name: item.productName || item.product?.itemName || 'Unknown Product',
        code: item.productCode || item.product?.productCode || 'N/A',
        quantity: item.quantity || 0,
        value: item.totalPrice || (item.quantity * item.unitPrice) || 0
      };
    });

    return {
      date: lastInvoice.invoiceDate,
      invoiceNumber: lastInvoice.invoiceNumber,
      products,
      totalValue: lastInvoice.totalAmount || 0,
      daysSinceLastPurchase: daysSince
    };
  } catch (error) {
    console.error('❌ Get last purchase error:', error);
    return {
      date: null,
      invoiceNumber: null,
      products: [],
      totalValue: 0,
      daysSinceLastPurchase: null
    };
  }
}

// Helper: Get Purchase History
async function getPurchaseHistory(dealerId) {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // Convert dealerId to ObjectId for aggregation
    const dealerObjectId = new mongoose.Types.ObjectId(dealerId);

    // Get invoices for different periods (exclude only cancelled)
    const [last30, last60, last90, totalOrders] = await Promise.all([
      DealerInvoice.aggregate([
        {
          $match: {
            dealer: dealerObjectId,
            invoiceDate: { $gte: thirtyDaysAgo },
            status: { $ne: 'Cancelled' }
          }
        },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
      ]),
      DealerInvoice.aggregate([
        {
          $match: {
            dealer: dealerObjectId,
            invoiceDate: { $gte: sixtyDaysAgo },
            status: { $ne: 'Cancelled' }
          }
        },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
      ]),
      DealerInvoice.aggregate([
        {
          $match: {
            dealer: dealerObjectId,
            invoiceDate: { $gte: ninetyDaysAgo },
            status: { $ne: 'Cancelled' }
          }
        },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
      ]),
      DealerInvoice.countDocuments({
        dealer: dealerObjectId,
        status: { $ne: 'Cancelled' }
      })
    ]);

    const last30Total = last30[0]?.total || 0;
    const last60Total = last60[0]?.total || 0;
    const last90Total = last90[0]?.total || 0;
    const last30Count = last30[0]?.count || 0;

    const averageOrderValue = last30Count > 0 ? last30Total / last30Count : 0;

    return {
      last30Days: last30Total,
      last60Days: last60Total,
      last90Days: last90Total,
      averageOrderValue: Math.round(averageOrderValue),
      totalOrders
    };
  } catch (error) {
    console.error('Get purchase history error:', error);
    return {
      last30Days: 0,
      last60Days: 0,
      last90Days: 0,
      averageOrderValue: 0,
      totalOrders: 0
    };
  }
}

// Helper: Calculate Scheme Points
async function calculateSchemePoints(dealerId) {
  try {
    const dealerObjectId = new mongoose.Types.ObjectId(dealerId);
    const pointsData = await DealerLedger.aggregate([
      { $match: { dealer: dealerObjectId } },
      {
        $group: {
          _id: null,
          totalEarned: { $sum: '$pointsEarned' },
          totalRedeemed: { $sum: '$pointsRedeemed' }
        }
      }
    ]);

    const earned = pointsData[0]?.totalEarned || 0;
    const redeemed = pointsData[0]?.totalRedeemed || 0;
    const available = earned - redeemed;

    // TODO: Get actual schemes from SchemeTarget model (to be created)
    // For now, return sample scheme structure
    return {
      totalEarned: earned,
      totalRedeemed: redeemed,
      availablePoints: available,
      schemes: [] // Will be populated from SchemeTarget model
    };
  } catch (error) {
    console.error('Calculate scheme points error:', error);
    return {
      totalEarned: 0,
      totalRedeemed: 0,
      availablePoints: 0,
      schemes: []
    };
  }
}

// Helper: Get Product Recommendations
async function getProductRecommendations(dealerId) {
  try {
    const dealerObjectId = new mongoose.Types.ObjectId(dealerId);
    
    // First, get manual recommendations from database
    const manualRecommendations = await ProductRecommendation.find({
      dealer: dealerObjectId,
      status: 'Active',
      $or: [
        { validUntil: { $exists: false } },
        { validUntil: null },
        { validUntil: { $gte: new Date() } }
      ]
    })
      .populate('product', 'itemName productCode')
      .sort({ priority: 1 })
      .limit(10)
      .lean();
    
    // Format manual recommendations
    const recommendations = manualRecommendations.map(rec => ({
      product: rec.product._id,
      productName: rec.product.itemName || rec.productName,
      productCode: rec.product.productCode || rec.productCode,
      reason: rec.reason,
      priority: rec.priority,
      suggestedAction: rec.suggestedAction,
      lastOrderedDate: null,
      isManual: true
    }));
    
    console.log(`📦 Found ${recommendations.length} manual recommendations for dealer`);
    
    return recommendations;

  } catch (error) {
    console.error('Get product recommendations error:', error);
    return [];
  }
}

// Get only outstanding summary (lightweight)
export const getOutstandingSummary = async (req, res) => {
  try {
    const { dealerId } = req.params;

    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }

    const outstandingData = await calculateOutstanding(dealerId, dealer);

    res.json({
      success: true,
      outstanding: outstandingData
    });

  } catch (error) {
    console.error('Get outstanding summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch outstanding summary',
      error: error.message
    });
  }
};

// Get only ageing analysis
export const getAgeingAnalysis = async (req, res) => {
  try {
    const { dealerId } = req.params;

    const ageingData = await calculateAgeing(dealerId);

    res.json({
      success: true,
      ageing: ageingData
    });

  } catch (error) {
    console.error('Get ageing analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ageing analysis',
      error: error.message
    });
  }
};
