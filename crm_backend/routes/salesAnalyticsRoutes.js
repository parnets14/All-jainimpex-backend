import express from 'express';
import mongoose from 'mongoose';
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
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '3months':
        startDate.setDate(endDate.getDate() - 90);
        break;
      case '6months':
        startDate.setDate(endDate.getDate() - 180);
        break;
      case '1year':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
        break;
    }

    // Aggregate sales data from SalesOrder collection only (as requested)
    // Only count orders with "Delivered" status
    const salesOrderData = await SalesOrder.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'Delivered' // Only count delivered orders
        }
      },
      { $unwind: '$products' },
      {
        $match: {
          'products.product': { $in: productIdArray.map(id => new mongoose.Types.ObjectId(id.toString())) }
        }
      },
      {
        $group: {
          _id: '$products.product',
          totalQuantity: { $sum: '$products.quantity' }
        }
      }
    ]);

    // Format response (only sales orders, no dealer invoices)
    const result = productIdArray.map(productId => ({
      productId: productId.toString(),
      totalQuantity: salesOrderData.find(item => item._id.toString() === productId.toString())?.totalQuantity || 0
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
    const { productId, warehouseId, period, startDate, endDate } = req.query;
    
    console.log('🔍 [DEBUG] Detailed Analytics API called with:', {
      productId,
      warehouseId,
      period,
      startDate,
      endDate
    });
    
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    const now = new Date();
    console.log('🔍 [DEBUG] Current time:', now.toISOString());
    
    // Calculate different time periods based on period parameter
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    console.log('🔍 [DEBUG] Date ranges:', {
      oneDayAgo: oneDayAgo.toISOString(),
      sevenDaysAgo: sevenDaysAgo.toISOString(),
      oneMonthAgo: oneMonthAgo.toISOString()
    });

    // Handle custom date range
    let customStartDate = null;
    let customEndDate = null;
    if (period === 'custom' && startDate && endDate) {
      customStartDate = new Date(startDate);
      customEndDate = new Date(endDate);
      // Ensure end date includes the full day
      customEndDate.setHours(23, 59, 59, 999);
    }

    // Base match criteria - only count delivered orders
    const baseMatch = {
      'products.product': new mongoose.Types.ObjectId(productId.toString()),
      status: 'Delivered' // Only count delivered orders
    };

    // Note: warehouseId filtering is handled in the aggregation pipeline
    // because warehouse info is at products.warehouse level, not top-level warehouseId

    console.log('🔍 [DEBUG] Base match criteria:', JSON.stringify(baseMatch, null, 2));

    // Helper function to get sales data for a period (Sales Orders only)
    const getSalesForPeriod = async (startDate, endDate = now) => {
      const matchCriteria = {
        ...baseMatch,
        createdAt: { $gte: startDate, $lte: endDate }
      };

      console.log(`🔍 [DEBUG] Query for ${startDate.toISOString()} to ${endDate.toISOString()}:`, JSON.stringify(matchCriteria, null, 2));

      const aggregationPipeline = [
        { $match: matchCriteria },
        { $unwind: '$products' },
        { 
          $match: { 
            'products.product': new mongoose.Types.ObjectId(productId.toString())
          }
        }
      ];

      // Add warehouse filter at product level if warehouseId is provided
      if (warehouseId) {
        aggregationPipeline.push({
          $match: {
            'products.warehouse': new mongoose.Types.ObjectId(warehouseId.toString())
          }
        });
        console.log(`🔍 [DEBUG] Added warehouse filter: products.warehouse = ${warehouseId}`);
      }

      // Add final grouping
      aggregationPipeline.push({
        $group: { _id: null, totalQuantity: { $sum: '$products.quantity' } }
      });

      const salesOrderResult = await SalesOrder.aggregate(aggregationPipeline);

      const salesOrderQty = salesOrderResult[0]?.totalQuantity || 0;
      console.log(`🔍 [DEBUG] Result: ${salesOrderQty} units`);
      
      return salesOrderQty; // Only return sales order quantity
    };

    // Get sales for different periods
    const [oneDaySales, sevenDaysSales, oneMonthSales, threeMonthsSales, sixMonthsSales, oneYearSales, totalSales, customPeriodSales] = await Promise.all([
      getSalesForPeriod(oneDayAgo),
      getSalesForPeriod(sevenDaysAgo),
      getSalesForPeriod(oneMonthAgo),
      getSalesForPeriod(threeMonthsAgo),
      getSalesForPeriod(sixMonthsAgo),
      getSalesForPeriod(oneYearAgo),
      getSalesForPeriod(new Date('2020-01-01')), // Total sales from a far back date
      customStartDate && customEndDate ? getSalesForPeriod(customStartDate, customEndDate) : 0
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

    // Determine which data to return based on period
    let responseData = {
      oneDaySales,
      sevenDaysSales,
      oneMonthSales,
      threeMonthsSales,
      sixMonthsSales,
      oneYearSales,
      totalSales,
      monthlyBreakdown: monthlyBreakdown.filter(m => m.quantity > 0),
      yearlyBreakdown: yearlyBreakdown.filter(y => y.quantity > 0)
    };

    // Add custom period data if requested
    if (period === 'custom' && customStartDate && customEndDate) {
      responseData.customPeriodSales = customPeriodSales;
      responseData.customPeriod = {
        startDate: customStartDate.toISOString().split('T')[0],
        endDate: customEndDate.toISOString().split('T')[0],
        sales: customPeriodSales
      };
    }

    // Add period-specific insights
    switch (period) {
      case '3months':
        responseData.periodSales = threeMonthsSales;
        responseData.periodLabel = '3 Months';
        break;
      case '6months':
        responseData.periodSales = sixMonthsSales;
        responseData.periodLabel = '6 Months';
        break;
      case '1year':
        responseData.periodSales = oneYearSales;
        responseData.periodLabel = '1 Year';
        break;
      case 'custom':
        responseData.periodSales = customPeriodSales;
        responseData.periodLabel = 'Custom Period';
        break;
      default:
        responseData.periodSales = oneMonthSales;
        responseData.periodLabel = '30 Days';
    }

    console.log('🔍 [DEBUG] Final response data:', JSON.stringify(responseData, null, 2));

    res.json({
      success: true,
      data: responseData
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