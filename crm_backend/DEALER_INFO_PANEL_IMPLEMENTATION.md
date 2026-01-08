# Dealer Information Panel - Complete Implementation Plan

## Client Requirements

When creating a Sales Order, after selecting a dealer, show a comprehensive information panel with:

1. ✅ **Credit Limit Status**
   - Total credit limit
   - Current outstanding
   - Available credit
   - Utilization percentage
   - Visual indicator (color-coded)

2. ✅ **Last Purchase Information**
   - Last order date
   - Last order amount
   - Last order products
   - Last order status

3. ✅ **Payment Status & Warning**
   - If credit limit exceeded → Show warning
   - If payment overdue → Block order creation
   - Prompt to collect payment first
   - Link to Dealer Ledger

4. ✅ **Available Discounts**
   - Show all applicable discounts for this dealer
   - Display discount details (type, percentage, validity)
   - Auto-apply discounts in invoice

5. ✅ **Credit Days**
   - Auto-fill from dealer master
   - Show due date calculation
   - Linked everywhere (Sales Order → Invoice → Ledger)

---

## UI Design - Dealer Information Panel

### Location
**Sales Order Dashboard** - Below dealer selection, above product selection

### Layout
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 📊 Dealer Information - ABC Traders (DLR1001)                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────────┐│
│ │ 💳 Credit Status    │  │ 📦 Last Purchase    │  │ 💰 Payment Status││
│ ├─────────────────────┤  ├─────────────────────┤  ├──────────────────┤│
│ │ Limit: ₹1,00,000    │  │ Date: 05/01/2026    │  │ Outstanding:     ││
│ │ Used:  ₹75,000      │  │ Amount: ₹25,000     │  │ ₹75,000          ││
│ │ Available: ₹25,000  │  │ Products: 5 items   │  │                  ││
│ │                     │  │ Status: Delivered   │  │ Overdue: ₹0      ││
│ │ [████████░░] 75%    │  │                     │  │ ✅ Good Standing ││
│ │ 🟢 Good             │  │ [View Details]      │  │                  ││
│ └─────────────────────┘  └─────────────────────┘  └──────────────────┘│
│                                                                          │
│ ┌─────────────────────────────────────────────────────────────────────┐│
│ │ 🎁 Available Discounts (3)                                          ││
│ ├─────────────────────────────────────────────────────────────────────┤│
│ │ • 5% on Pipes - Valid till 31/01/2026                               ││
│ │ • 10% Level Discount - Select at checkout                           ││
│ │ • Buy 100+ get 3% extra - Auto-apply                                ││
│ │ [View All Discounts]                                                ││
│ └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│ ┌─────────────────────────────────────────────────────────────────────┐│
│ │ ⏰ Credit Terms                                                      ││
│ ├─────────────────────────────────────────────────────────────────────┤│
│ │ Credit Days: 30 days                                                ││
│ │ Due Date: Will be calculated after order date                       ││
│ └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

### Warning States

#### 1. Credit Limit Exceeded (Yellow Warning)
```
┌─────────────────────────────────────────────────────────────────────────┐
│ ⚠️ WARNING: Credit Limit Exceeded                                       │
├─────────────────────────────────────────────────────────────────────────┤
│ Current Outstanding: ₹95,000                                            │
│ Credit Limit: ₹1,00,000                                                 │
│ Available Credit: ₹5,000                                                │
│                                                                          │
│ This order may exceed the credit limit. Please proceed with caution.   │
│ [Proceed Anyway] [Collect Payment First]                               │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 2. Payment Overdue (Red Alert - Block Order)
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 🚫 PAYMENT OVERDUE - Cannot Create Order                                │
├─────────────────────────────────────────────────────────────────────────┤
│ Outstanding Amount: ₹1,25,000                                           │
│ Overdue Amount: ₹50,000 (30+ days overdue)                             │
│ Credit Limit: ₹1,00,000                                                 │
│                                                                          │
│ ❌ This dealer has exceeded credit limit and has overdue payments.      │
│ Please collect payment before creating new orders.                      │
│                                                                          │
│ [View Ledger] [Record Payment] [Contact Dealer]                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Backend API Requirements

### 1. Get Dealer Complete Info
```javascript
GET /api/dealers/:id/complete-info

Response:
{
  success: true,
  dealer: {
    _id: "xxx",
    code: "DLR1001",
    name: "ABC Traders",
    creditLimit: 100000,
    creditDays: 30,
    dealerType: "Wholeseller"
  },
  creditStatus: {
    creditLimit: 100000,
    currentOutstanding: 75000,
    availableCredit: 25000,
    utilizationPercent: 75,
    status: "good" | "warning" | "exceeded",
    colorCode: "green" | "yellow" | "red"
  },
  lastPurchase: {
    orderDate: "2026-01-05",
    orderNumber: "SO-2026-0123",
    orderAmount: 25000,
    productCount: 5,
    status: "Delivered",
    products: [
      { name: "PVC Pipe 2 inch", quantity: 50 },
      { name: "Elbow Joint", quantity: 100 }
    ]
  },
  paymentStatus: {
    totalOutstanding: 75000,
    overdueAmount: 0,
    lastPaymentDate: "2026-01-03",
    lastPaymentAmount: 50000,
    averagePaymentDays: 25,
    status: "good" | "warning" | "overdue",
    canCreateOrder: true,
    blockReason: null
  },
  availableDiscounts: [
    {
      _id: "disc1",
      discountName: "5% on Pipes",
      discountType: "direct",
      targetType: "category",
      targetName: "Pipes",
      directDiscountPercentage: 5,
      validFrom: "2026-01-01",
      validTo: "2026-01-31",
      status: "Active"
    },
    {
      _id: "disc2",
      discountName: "Volume Discount",
      discountType: "level_based",
      levels: [
        { minQty: 50, maxQty: 99, discount: 5 },
        { minQty: 100, maxQty: null, discount: 10 }
      ],
      validFrom: "2026-01-01",
      validTo: "2026-12-31",
      status: "Active"
    }
  ],
  summary: {
    totalOrders: 45,
    totalPurchaseValue: 2500000,
    averageOrderValue: 55555,
    lastOrderDaysAgo: 3
  }
}
```

### 2. Validate Order Creation
```javascript
POST /api/dealers/:id/validate-order

Request:
{
  orderAmount: 50000
}

Response:
{
  success: true,
  validation: {
    canCreate: false,
    blockReason: "Credit limit exceeded and payment overdue",
    warnings: [
      "Current outstanding (₹95,000) + Order amount (₹50,000) = ₹1,45,000",
      "This exceeds credit limit of ₹1,00,000 by ₹45,000",
      "Overdue amount: ₹30,000 (45 days overdue)"
    ],
    recommendations: [
      "Collect payment of at least ₹45,000 before proceeding",
      "Or increase dealer's credit limit to ₹1,50,000"
    ],
    creditStatus: {
      current: 95000,
      limit: 100000,
      afterOrder: 145000,
      exceeded: 45000
    }
  }
}
```

---

## Frontend Implementation

### Step 1: Create Dealer Info Panel Component

**File**: `JainInpexCRM/src/Sales&Purchase/components/DealerInfoPanel.jsx`

```javascript
import React, { useState, useEffect } from 'react';
import { 
  CreditCard, ShoppingCart, AlertTriangle, CheckCircle, 
  XCircle, TrendingUp, Calendar, Package, DollarSign 
} from 'lucide-react';
import apiService from '../../services/api';

const DealerInfoPanel = ({ dealerId, onCreditStatusChange }) => {
  const [dealerInfo, setDealerInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (dealerId) {
      loadDealerInfo();
    }
  }, [dealerId]);

  const loadDealerInfo = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getDealerCompleteInfo(dealerId);
      
      if (response.success) {
        setDealerInfo(response);
        // Notify parent about credit status
        onCreditStatusChange(response.paymentStatus);
      }
    } catch (error) {
      console.error('Error loading dealer info:', error);
      setError('Failed to load dealer information');
    } finally {
      setLoading(false);
    }
  };

  if (!dealerId) return null;
  if (loading) return <div className="animate-pulse">Loading dealer information...</div>;
  if (error) return <div className="text-red-600">{error}</div>;
  if (!dealerInfo) return null;

  const { dealer, creditStatus, lastPurchase, paymentStatus, availableDiscounts } = dealerInfo;

  // Color coding for credit status
  const getStatusColor = (status) => {
    switch (status) {
      case 'good': return 'bg-green-100 border-green-500 text-green-800';
      case 'warning': return 'bg-yellow-100 border-yellow-500 text-yellow-800';
      case 'exceeded': return 'bg-red-100 border-red-500 text-red-800';
      default: return 'bg-gray-100 border-gray-500 text-gray-800';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'good': return <CheckCircle className="text-green-600" />;
      case 'warning': return <AlertTriangle className="text-yellow-600" />;
      case 'exceeded': return <XCircle className="text-red-600" />;
      default: return null;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6 border-2 border-blue-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          📊 Dealer Information - {dealer.name} ({dealer.code})
        </h3>
        <button
          onClick={loadDealerInfo}
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Payment Overdue Alert */}
      {!paymentStatus.canCreateOrder && (
        <div className="bg-red-50 border-2 border-red-500 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <XCircle className="text-red-600 flex-shrink-0 mt-1" size={24} />
            <div className="flex-1">
              <h4 className="font-bold text-red-900 text-lg mb-2">
                🚫 PAYMENT OVERDUE - Cannot Create Order
              </h4>
              <div className="space-y-1 text-red-800">
                <p>Outstanding Amount: ₹{paymentStatus.totalOutstanding.toLocaleString()}</p>
                <p>Overdue Amount: ₹{paymentStatus.overdueAmount.toLocaleString()}</p>
                <p>Credit Limit: ₹{dealer.creditLimit.toLocaleString()}</p>
              </div>
              <p className="mt-3 font-semibold">{paymentStatus.blockReason}</p>
              <div className="flex gap-2 mt-4">
                <button className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">
                  View Ledger
                </button>
                <button className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
                  Record Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Warning for Credit Limit */}
      {paymentStatus.canCreateOrder && creditStatus.status === 'warning' && (
        <div className="bg-yellow-50 border-2 border-yellow-500 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-yellow-600 flex-shrink-0 mt-1" size={24} />
            <div className="flex-1">
              <h4 className="font-bold text-yellow-900 text-lg mb-2">
                ⚠️ WARNING: Approaching Credit Limit
              </h4>
              <div className="space-y-1 text-yellow-800">
                <p>Current Outstanding: ₹{creditStatus.currentOutstanding.toLocaleString()}</p>
                <p>Credit Limit: ₹{creditStatus.creditLimit.toLocaleString()}</p>
                <p>Available Credit: ₹{creditStatus.availableCredit.toLocaleString()}</p>
              </div>
              <p className="mt-2">Please proceed with caution. Consider collecting payment first.</p>
            </div>
          </div>
        </div>
      )}

      {/* Info Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {/* Credit Status Card */}
        <div className={`border-2 rounded-lg p-4 ${getStatusColor(creditStatus.status)}`}>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold flex items-center gap-2">
              <CreditCard size={20} />
              Credit Status
            </h4>
            {getStatusIcon(creditStatus.status)}
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Limit:</span>
              <span className="font-bold">₹{creditStatus.creditLimit.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Used:</span>
              <span className="font-bold">₹{creditStatus.currentOutstanding.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Available:</span>
              <span className="font-bold">₹{creditStatus.availableCredit.toLocaleString()}</span>
            </div>
            {/* Progress Bar */}
            <div className="mt-3">
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full ${
                    creditStatus.utilizationPercent > 90 ? 'bg-red-600' :
                    creditStatus.utilizationPercent > 70 ? 'bg-yellow-500' :
                    'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(creditStatus.utilizationPercent, 100)}%` }}
                />
              </div>
              <p className="text-center mt-1 font-bold">{creditStatus.utilizationPercent}%</p>
            </div>
          </div>
        </div>

        {/* Last Purchase Card */}
        <div className="border-2 border-blue-200 rounded-lg p-4 bg-blue-50">
          <h4 className="font-semibold flex items-center gap-2 mb-2">
            <ShoppingCart size={20} />
            Last Purchase
          </h4>
          {lastPurchase ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Date:</span>
                <span className="font-bold">{new Date(lastPurchase.orderDate).toLocaleDateString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span>Amount:</span>
                <span className="font-bold">₹{lastPurchase.orderAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Products:</span>
                <span className="font-bold">{lastPurchase.productCount} items</span>
              </div>
              <div className="flex justify-between">
                <span>Status:</span>
                <span className="font-bold">{lastPurchase.status}</span>
              </div>
              <button className="text-blue-600 hover:underline text-xs mt-2">
                View Details →
              </button>
            </div>
          ) : (
            <p className="text-gray-600 text-sm">No previous purchases</p>
          )}
        </div>

        {/* Payment Status Card */}
        <div className="border-2 border-purple-200 rounded-lg p-4 bg-purple-50">
          <h4 className="font-semibold flex items-center gap-2 mb-2">
            <DollarSign size={20} />
            Payment Status
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Outstanding:</span>
              <span className="font-bold">₹{paymentStatus.totalOutstanding.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Overdue:</span>
              <span className="font-bold text-red-600">₹{paymentStatus.overdueAmount.toLocaleString()}</span>
            </div>
            {paymentStatus.lastPaymentDate && (
              <>
                <div className="flex justify-between">
                  <span>Last Payment:</span>
                  <span className="font-bold">{new Date(paymentStatus.lastPaymentDate).toLocaleDateString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Amount:</span>
                  <span className="font-bold">₹{paymentStatus.lastPaymentAmount.toLocaleString()}</span>
                </div>
              </>
            )}
            <div className="mt-2 flex items-center gap-2">
              {paymentStatus.status === 'good' && (
                <>
                  <CheckCircle size={16} className="text-green-600" />
                  <span className="text-green-700 font-semibold">Good Standing</span>
                </>
              )}
              {paymentStatus.status === 'warning' && (
                <>
                  <AlertTriangle size={16} className="text-yellow-600" />
                  <span className="text-yellow-700 font-semibold">Needs Attention</span>
                </>
              )}
              {paymentStatus.status === 'overdue' && (
                <>
                  <XCircle size={16} className="text-red-600" />
                  <span className="text-red-700 font-semibold">Overdue</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Available Discounts */}
      {availableDiscounts && availableDiscounts.length > 0 && (
        <div className="border-2 border-green-200 rounded-lg p-4 bg-green-50">
          <h4 className="font-semibold flex items-center gap-2 mb-3">
            🎁 Available Discounts ({availableDiscounts.length})
          </h4>
          <div className="space-y-2">
            {availableDiscounts.slice(0, 3).map((discount, index) => (
              <div key={index} className="flex items-start gap-2 text-sm">
                <span className="text-green-600">•</span>
                <div className="flex-1">
                  <span className="font-semibold">{discount.discountName}</span>
                  {discount.discountType === 'direct' && (
                    <span className="ml-2">- {discount.directDiscountPercentage}% off</span>
                  )}
                  {discount.discountType === 'level_based' && (
                    <span className="ml-2">- Level-based discount</span>
                  )}
                  <span className="ml-2 text-gray-600">
                    (Valid till {new Date(discount.validTo).toLocaleDateString('en-IN')})
                  </span>
                </div>
              </div>
            ))}
            {availableDiscounts.length > 3 && (
              <button className="text-green-600 hover:underline text-sm">
                View all {availableDiscounts.length} discounts →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Credit Terms */}
      <div className="border-2 border-gray-200 rounded-lg p-4 bg-gray-50 mt-4">
        <h4 className="font-semibold flex items-center gap-2 mb-2">
          <Calendar size={20} />
          Credit Terms
        </h4>
        <div className="flex items-center justify-between text-sm">
          <span>Credit Days: <span className="font-bold">{dealer.creditDays} days</span></span>
          <span className="text-gray-600">Due date will be calculated after order date</span>
        </div>
      </div>
    </div>
  );
};

export default DealerInfoPanel;
```

### Step 2: Integrate into Sales Order Dashboard

**File**: `JainInpexCRM/src/Sales&Purchase/SalesOrderDashboard.jsx`

```javascript
import DealerInfoPanel from './components/DealerInfoPanel';

// Add state for payment status
const [paymentStatus, setPaymentStatus] = useState(null);

// Handle credit status change
const handleCreditStatusChange = (status) => {
  setPaymentStatus(status);
};

// In the form, after dealer selection:
{formData.dealer && (
  <DealerInfoPanel 
    dealerId={formData.dealer}
    onCreditStatusChange={handleCreditStatusChange}
  />
)}

// In handleSubmit, check payment status:
const handleSubmit = async (e) => {
  e.preventDefault();
  
  // Block if payment status doesn't allow
  if (paymentStatus && !paymentStatus.canCreateOrder) {
    alert(paymentStatus.blockReason || 'Cannot create order due to payment issues');
    return;
  }
  
  // Continue with order creation...
};
```

---

## Backend Controller Implementation

**File**: `JainInpexCRMBackend/crm_backend/controllers/dealerController.js`

```javascript
// Get complete dealer information
export const getDealerCompleteInfo = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 1. Get dealer basic info
    const dealer = await Dealer.findById(id);
    if (!dealer) {
      return res.status(404).json({ success: false, message: 'Dealer not found' });
    }
    
    // 2. Calculate credit status from ledger
    const ledgerEntries = await DealerLedger.find({ dealer: id });
    const currentOutstanding = ledgerEntries.reduce((sum, entry) => {
      return sum + (entry.debitAmount || 0) - (entry.creditAmount || 0);
    }, 0);
    
    const availableCredit = Math.max(0, dealer.creditLimit - currentOutstanding);
    const utilizationPercent = dealer.creditLimit > 0 
      ? Math.round((currentOutstanding / dealer.creditLimit) * 100) 
      : 0;
    
    let creditStatusType = 'good';
    if (utilizationPercent > 90 || currentOutstanding > dealer.creditLimit) {
      creditStatusType = 'exceeded';
    } else if (utilizationPercent > 70) {
      creditStatusType = 'warning';
    }
    
    // 3. Get last purchase
    const lastOrder = await SalesOrder.findOne({ dealer: id })
      .sort({ orderDate: -1 })
      .populate('products.product', 'itemName');
    
    // 4. Calculate payment status
    const overdueEntries = ledgerEntries.filter(entry => {
      if (entry.dueDate && entry.runningBalance > 0) {
        return new Date() > new Date(entry.dueDate);
      }
      return false;
    });
    
    const overdueAmount = overdueEntries.reduce((sum, entry) => sum + entry.runningBalance, 0);
    
    const lastPayment = await DealerLedger.findOne({ 
      dealer: id, 
      transactionType: 'Payment' 
    }).sort({ entryDate: -1 });
    
    let paymentStatusType = 'good';
    let canCreateOrder = true;
    let blockReason = null;
    
    if (overdueAmount > 0 && currentOutstanding > dealer.creditLimit) {
      paymentStatusType = 'overdue';
      canCreateOrder = false;
      blockReason = 'Credit limit exceeded with overdue payments. Please collect payment first.';
    } else if (overdueAmount > 0) {
      paymentStatusType = 'warning';
    }
    
    // 5. Get available discounts
    const availableDiscounts = await DiscountMapping.find({
      dealer: id,
      status: 'Approved',
      validFrom: { $lte: new Date() },
      validTo: { $gte: new Date() }
    });
    
    // 6. Prepare response
    const response = {
      success: true,
      dealer: {
        _id: dealer._id,
        code: dealer.code,
        name: dealer.name,
        creditLimit: dealer.creditLimit,
        creditDays: dealer.creditDays,
        dealerType: dealer.dealerType
      },
      creditStatus: {
        creditLimit: dealer.creditLimit,
        currentOutstanding,
        availableCredit,
        utilizationPercent,
        status: creditStatusType
      },
      lastPurchase: lastOrder ? {
        orderDate: lastOrder.orderDate,
        orderNumber: lastOrder.orderNumber,
        orderAmount: lastOrder.totalAmount,
        productCount: lastOrder.products.length,
        status: lastOrder.status,
        products: lastOrder.products.slice(0, 5).map(p => ({
          name: p.productName,
          quantity: p.quantity
        }))
      } : null,
      paymentStatus: {
        totalOutstanding: currentOutstanding,
        overdueAmount,
        lastPaymentDate: lastPayment?.entryDate,
        lastPaymentAmount: lastPayment?.creditAmount,
        status: paymentStatusType,
        canCreateOrder,
        blockReason
      },
      availableDiscounts: availableDiscounts.map(d => ({
        _id: d._id,
        discountName: d.discountName,
        discountType: d.discountType,
        targetType: d.targetType,
        directDiscountPercentage: d.directDiscountPercentage,
        levels: d.levels,
        validFrom: d.validFrom,
        validTo: d.validTo,
        status: d.status
      }))
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('Error getting dealer complete info:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
```

---

## Summary of Implementation

### ✅ What This Achieves:

1. **Credit Limit Visibility** - Real-time display of credit status
2. **Payment Validation** - Blocks orders if payment overdue
3. **Last Purchase Info** - Shows dealer's buying history
4. **Discount Integration** - Displays all applicable discounts
5. **Credit Days Linking** - Auto-fills everywhere
6. **User Experience** - Clear visual indicators and warnings

### 🎯 Business Benefits:

1. **Risk Management** - Prevents bad debt by blocking risky orders
2. **Better Decision Making** - All info in one place
3. **Improved Cash Flow** - Prompts payment collection
4. **Discount Transparency** - Dealers see what they're eligible for
5. **Consistency** - Credit terms applied uniformly

### 📋 Next Steps:

1. Create backend API endpoint
2. Build DealerInfoPanel component
3. Integrate into Sales Order Dashboard
4. Test with real dealer data
5. Add similar panel to Dealer Invoice page
