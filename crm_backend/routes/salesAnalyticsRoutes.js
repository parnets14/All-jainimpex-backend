import express from 'express';
import SalesOrder from '../models/SalesOrder.js';
import DealerInvoice from '../models/DealerInvoice.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Get product sales analytics for multiple products (30-day sales)
router.get('/products', protect, async (req, res) => {
  try {
    // Handle both productIds and productIds[] formats (axios sends arrays as productIds[])
    let productIds = req.query.productIds || req.query['productIds[]'];
    const period = req.query.period || '30days';
    
    if (!productIds || (Array.isArray(productIds) && productIds.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Product IDs are required'
      });
    }

    const productIdArray = Array.isArray(productIds) ? productIds : [productIds];
    
    // Calculate date range based on period
    const endDate = new Date();
    let startDate = new Date();
    
    switch (period) {
      case '1day':
        startDate.setDate(endDate.getDate() - 1);
        break;
      case '7days':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30days':
      default:
        startDate.setDate(endDate.getDate() - 30);
        break;
    }

    // Aggregate sales data from both SalesOrder and DealerInvoice collections
    const salesOrderData = await SalesOrder.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $in: ['confirmed', 'delivered', 'completed'] }
        }
      },
      { $unwind: '$products' },
      {
        $match: {
          'products.productId': { $in: productIdArray.map(id => id.toString()) }
        }
      },
      {
        $group: {
          _id: '$products.productId',
          totalQuantity: { $sum: '$products.quantity' }
        }
      }
    ]);

    const dealerInvoiceData = await DealerInvoice.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $in: ['confirmed', 'delivered', 'completed'] }
        }
      },
      { $unwind: '$products' },
      {
        $match: {
          'products.productId': { $in: productIdArray.map(id => id.toString()) }
        }
      },
      {
        $group: {
          _id: '$products.productId',
          totalQuantity: { $sum: '$products.quantity' }
        }
      }
    ]);

    // Combine data from both sources
    const combinedData = {};
    
    salesOrderData.forEach(item => {
      combinedData[item._id] = (combinedData[item._id] || 0) + item.totalQuantity;
    });
    
    dealerInvoiceData.forEach(item => {
      combinedData[item._id] = (combinedData[item._id] || 0) + item.totalQuantity;
    });

    // Format response
    const result = productIdArray.map(productId => ({
      productId: productId.toString(),
      totalQuantity: combinedData[productId.toString()] || 0
    }));

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error fetching product sales analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales analytics',
      error: error.message
    });
  }
});

// Get detailed sales analytics for a single product
router.get('/product-details', protect, async (req, res) => {
  try {
    const { productId, warehouseId } = req.query;
    
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    const now = new Date();
    
    // Calculate different time periods
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Base match criteria
    const baseMatch = {
      'products.productId': productId.toString(),
      status: { $in: ['confirmed', 'delivered', 'completed'] }
    };

    if (warehouseId) {
      baseMatch.warehouseId = warehouseId;
    }

    // Helper function to get sales data for a period
    const getSalesForPeriod = async (startDate, endDate = now) => {
      const matchCriteria = {
        ...baseMatch,
        createdAt: { $gte: startDate, $lte: endDate }
      };

      const salesOrderResult = await SalesOrder.aggregate([
        { $match: matchCriteria },
        { $unwind: '$products' },
        { $match: { 'products.productId': productId.toString() } },
        { $group: { _id: null, totalQuantity: { $sum: '$products.quantity' } } }
      ]);

      const dealerInvoiceResult = await DealerInvoice.aggregate([
        { $match: matchCriteria },
        { $unwind: '$products' },
        { $match: { 'products.productId': productId.toString() } },
        { $group: { _id: null, totalQuantity: { $sum: '$products.quantity' } } }
      ]);

      const salesOrderQty = salesOrderResult[0]?.totalQuantity || 0;
      const dealerInvoiceQty = dealerInvoiceResult[0]?.totalQuantity || 0;
      
      return salesOrderQty + dealerInvoiceQty;
    };

    // Get sales for different periods
    const [oneDaySales, sevenDaysSales, oneMonthSales, totalSales] = await Promise.all([
      getSalesForPeriod(oneDayAgo),
      getSalesForPeriod(sevenDaysAgo),
      getSalesForPeriod(oneMonthAgo),
      getSalesForPeriod(new Date('2020-01-01')) // Total sales from a far back date
    ]);

    // Get monthly breakdown for the last 12 months
    const monthlyBreakdown = [];
    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      
      const monthlySales = await getSalesForPeriod(monthStart, monthEnd);
      
      monthlyBreakdown.push({
        month: monthStart.toLocaleString('default', { month: 'short' }),
        year: monthStart.getFullYear(),
        quantity: monthlySales
      });
    }

    // Get yearly breakdown for the last 3 years
    const yearlyBreakdown = [];
    for (let i = 2; i >= 0; i--) {
      const yearStart = new Date(now.getFullYear() - i, 0, 1);
      const yearEnd = new Date(now.getFullYear() - i, 11, 31);
      
      const yearlySales = await getSalesForPeriod(yearStart, yearEnd);
      
      yearlyBreakdown.push({
        year: now.getFullYear() - i,
        quantity: yearlySales
      });
    }

    res.json({
      success: true,
      data: {
        oneDaySales,
        sevenDaysSales,
        oneMonthSales,
        totalSales,
        monthlyBreakdown: monthlyBreakdown.filter(m => m.quantity > 0),
        yearlyBreakdown: yearlyBreakdown.filter(y => y.quantity > 0)
      }
    });

  } catch (error) {
    console.error('Error fetching detailed product sales analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch detailed sales analytics',
      error: error.message
    });
  }
});

export default router;