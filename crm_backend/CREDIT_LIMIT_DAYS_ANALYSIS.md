# Credit Limit & Credit Days Analysis

## Dealer Master Fields

```javascript
// From models/Dealer.js
{
  creditLimit: {
    type: Number,
    default: 0,
    min: [0, "Credit limit cannot be negative"],
  },
  creditDays: {
    type: Number,
    default: 0,
    min: [0, "Credit days cannot be negative"],
  }
}
```

---

## Current Usage Analysis

### ✅ CREDIT DAYS - Properly Linked

#### 1. Sales Order Dashboard
**Status**: ✅ **WORKING CORRECTLY**

```javascript
// Line 504-520 in SalesOrderDashboard.jsx
const handleDealerChange = (dealerId) => {
  const dealer = dealers.find(d => d._id === dealerId)
  if (dealer) {
    // Get credit days from dealer, default to 30 if not set
    const dealerCreditDays = dealer.creditDays || 30
    
    setFormData(prev => ({
      ...prev,
      dealer: dealerId,
      region: dealer.regionId,
      pinCode: dealer.address,
      type: mappedType,
      creditDays: dealerCreditDays,  // ✅ Uses dealer's credit days
      dueDate: prev.orderDate ? calculateDueDate(prev.orderDate, dealerCreditDays) : ""
    }))
  }
}

// Due date calculation
const calculateDueDate = (orderDate, creditDays) => {
  if (orderDate && creditDays) {
    const date = new Date(orderDate)
    date.setDate(date.getDate() + parseInt(creditDays))
    return date.toISOString().split('T')[0]
  }
  return ""
}
```

**Flow**:
1. User selects dealer
2. System fetches `dealer.creditDays`
3. Auto-fills `formData.creditDays`
4. Calculates `dueDate = orderDate + creditDays`
5. Saves to SalesOrder model

#### 2. Dealer Invoice
**Status**: ⚠️ **PARTIALLY WORKING**

```javascript
// Line 202 in DealerInvoice.jsx
const [formData, setFormData] = useState({
  dealerId: "",
  salesOrderId: "",
  customerInfo: { ... },
  items: [],
  creditDays: 30,  // ❌ Hardcoded default, not from dealer
  remarks: "",
  internalNotes: ""
});
```

**Issue**: When creating invoice, `creditDays` defaults to 30, NOT from dealer

**Should be**:
```javascript
const handleDealerSelect = async (dealerId) => {
  const dealer = dealers.find(d => d._id === dealerId);
  if (dealer) {
    setFormData(prev => ({
      ...prev,
      dealerId,
      creditDays: dealer.creditDays || 30,  // ✅ Should use dealer's credit days
      customerInfo: {
        name: dealer.name,
        address: dealer.address,
        phone: dealer.phone,
        email: dealer.email,
        gst: dealer.gst
      }
    }));
  }
}
```

#### 3. Dealer Ledger
**Status**: ✅ **WORKING CORRECTLY**

```javascript
// Ledger entries store creditDays from invoice/sales order
DealerLedger.create({
  dealer: invoice.dealer,
  creditDays: invoice.creditDays,  // ✅ Uses invoice's credit days
  dueDate: invoice.dueDate,
  // ...
})
```

---

### ⚠️ CREDIT LIMIT - NOT VALIDATED

#### Current Status: **MISSING VALIDATION**

**Where it SHOULD be checked**:

#### 1. Sales Order Dashboard
**Status**: ❌ **NOT IMPLEMENTED**

**Should check**:
```javascript
const handleSubmit = async (e) => {
  e.preventDefault();
  
  // ❌ MISSING: Check credit limit before creating order
  const dealer = dealers.find(d => d._id === formData.dealer);
  if (dealer) {
    // Get dealer's current outstanding
    const outstandingResponse = await apiService.getDealerOutstanding(dealer._id);
    const currentOutstanding = outstandingResponse.outstanding || 0;
    const orderTotal = calculateOrderTotals().totalAmount;
    const newOutstanding = currentOutstanding + orderTotal;
    
    // Check if new outstanding exceeds credit limit
    if (newOutstanding > dealer.creditLimit) {
      const exceeded = newOutstanding - dealer.creditLimit;
      const confirmMsg = `Warning: This order will exceed dealer's credit limit by ₹${exceeded.toLocaleString()}.\n\n` +
                        `Current Outstanding: ₹${currentOutstanding.toLocaleString()}\n` +
                        `Order Amount: ₹${orderTotal.toLocaleString()}\n` +
                        `New Outstanding: ₹${newOutstanding.toLocaleString()}\n` +
                        `Credit Limit: ₹${dealer.creditLimit.toLocaleString()}\n\n` +
                        `Do you want to proceed?`;
      
      if (!window.confirm(confirmMsg)) {
        return; // Block order creation
      }
    }
  }
  
  // Continue with order creation...
}
```

#### 2. Dealer Invoice
**Status**: ❌ **NOT IMPLEMENTED**

**Should check**:
```javascript
const handleSubmit = async (e) => {
  e.preventDefault();
  
  // ❌ MISSING: Check credit limit before creating invoice
  const dealer = dealers.find(d => d._id === formData.dealerId);
  if (dealer) {
    // Get dealer's current outstanding
    const outstandingResponse = await apiService.getDealerOutstanding(dealer._id);
    const currentOutstanding = outstandingResponse.outstanding || 0;
    const invoiceTotal = totals.totalAmount;
    const newOutstanding = currentOutstanding + invoiceTotal;
    
    // Check if new outstanding exceeds credit limit
    if (newOutstanding > dealer.creditLimit) {
      const exceeded = newOutstanding - dealer.creditLimit;
      alert(`Error: This invoice will exceed dealer's credit limit by ₹${exceeded.toLocaleString()}.\n\n` +
            `Current Outstanding: ₹${currentOutstanding.toLocaleString()}\n` +
            `Invoice Amount: ₹${invoiceTotal.toLocaleString()}\n` +
            `New Outstanding: ₹${newOutstanding.toLocaleString()}\n` +
            `Credit Limit: ₹${dealer.creditLimit.toLocaleString()}`);
      return; // Block invoice creation
    }
  }
  
  // Continue with invoice creation...
}
```

#### 3. Dealer Payment
**Status**: ✅ **NOT NEEDED** (Payments reduce outstanding, don't need limit check)

---

## Where Credit Limit IS Used (Read-Only)

### 1. Sales Executive App
**File**: `SalesExecutiveAppBackend/controllers/salesOrderController.js`

```javascript
// Line 53
creditStatus: outstandingAmount > dealer.creditLimit ? 'exceeded' : 'available'
```

**Purpose**: Shows credit status to sales executives

### 2. Dealer Insights
**File**: `SalesExecutiveAppBackend/controllers/dealerInsightsController.js`

```javascript
// Line 120
const utilizationPercent = creditLimit > 0 ? (totalOutstanding / creditLimit) * 100 : 0;
```

**Purpose**: Shows credit utilization percentage

### 3. Dealer App Dashboard
**File**: `DealerApp/src/screens/Dashboard/DashboardScreen.jsx`

```javascript
// Line 68-70
creditLimit = outstandingResponse.outstanding.creditLimit || 0;
availableBalance = outstandingResponse.outstanding.availableBalance || 0;
```

**Purpose**: Shows dealer their credit limit and available balance

---

## Missing Implementations

### 🔴 CRITICAL: Credit Limit Validation

#### Issue 1: No validation in Sales Order Dashboard
**Impact**: Users can create orders that exceed dealer's credit limit
**Risk**: High - Financial risk, bad debt

**Solution**:
```javascript
// Add to SalesOrderDashboard.jsx handleSubmit()
1. Fetch dealer's current outstanding
2. Calculate new outstanding = current + order total
3. If new outstanding > creditLimit:
   - Show warning with details
   - Require confirmation to proceed
   - Log the override (who approved exceeding limit)
```

#### Issue 2: No validation in Dealer Invoice
**Impact**: Users can create invoices that exceed dealer's credit limit
**Risk**: High - Financial risk, bad debt

**Solution**:
```javascript
// Add to DealerInvoice.jsx handleSubmit()
1. Fetch dealer's current outstanding
2. Calculate new outstanding = current + invoice total
3. If new outstanding > creditLimit:
   - Show error message
   - Block invoice creation OR require super admin approval
```

#### Issue 3: No real-time credit limit display
**Impact**: Users don't see dealer's credit status while creating orders/invoices
**Risk**: Medium - User experience issue

**Solution**:
```javascript
// Add to both SalesOrderDashboard and DealerInvoice
When dealer is selected, show:
- Credit Limit: ₹X
- Current Outstanding: ₹Y
- Available Credit: ₹(X-Y)
- Credit Utilization: Z%

Display with color coding:
- Green: < 70% utilized
- Yellow: 70-90% utilized
- Red: > 90% utilized
```

### ⚠️ MEDIUM: Credit Days Auto-Fill

#### Issue 4: Dealer Invoice doesn't auto-fill creditDays
**Impact**: Users must manually enter credit days, may enter wrong value
**Risk**: Low - Data inconsistency

**Solution**:
```javascript
// Update DealerInvoice.jsx handleDealerSelect()
setFormData(prev => ({
  ...prev,
  dealerId,
  creditDays: dealer.creditDays || 30,  // ✅ Auto-fill from dealer
  customerInfo: { ... }
}));
```

---

## Recommended Implementation Plan

### Phase 1: Critical Fixes (High Priority)

#### 1.1 Add Credit Limit Validation to Sales Order Dashboard
```javascript
Location: JainInpexCRM/src/Sales&Purchase/SalesOrderDashboard.jsx
Function: handleSubmit()

Steps:
1. Create API endpoint: GET /api/dealers/:id/outstanding
2. Fetch outstanding before order creation
3. Calculate new outstanding
4. Show warning if exceeds limit
5. Require confirmation to proceed
6. Log override in database
```

#### 1.2 Add Credit Limit Validation to Dealer Invoice
```javascript
Location: JainInpexCRM/src/Sales&Purchase/DealerInvoice.jsx
Function: handleSubmit()

Steps:
1. Use same API endpoint: GET /api/dealers/:id/outstanding
2. Fetch outstanding before invoice creation
3. Calculate new outstanding
4. Block if exceeds limit (or require super admin approval)
5. Show detailed error message
```

#### 1.3 Create Backend API for Outstanding Calculation
```javascript
Location: JainInpexCRMBackend/crm_backend/controllers/dealerController.js

New Endpoint: GET /api/dealers/:id/outstanding

Response:
{
  success: true,
  outstanding: {
    dealerId: "xxx",
    creditLimit: 100000,
    currentOutstanding: 75000,
    availableCredit: 25000,
    utilizationPercent: 75,
    status: "available" | "exceeded"
  }
}

Calculation:
1. Get all ledger entries for dealer
2. Sum debitAmount (invoices) - creditAmount (payments)
3. Return running balance as outstanding
```

### Phase 2: UX Improvements (Medium Priority)

#### 2.1 Add Credit Status Display
```javascript
Location: Both SalesOrderDashboard and DealerInvoice

When dealer is selected, show card:
┌─────────────────────────────────────┐
│ Dealer Credit Status                │
├─────────────────────────────────────┤
│ Credit Limit:      ₹1,00,000        │
│ Outstanding:       ₹75,000          │
│ Available Credit:  ₹25,000          │
│ Utilization:       75% [████████░░] │
└─────────────────────────────────────┘

Color coding:
- Green: < 70%
- Yellow: 70-90%
- Red: > 90%
```

#### 2.2 Auto-fill Credit Days in Dealer Invoice
```javascript
Location: JainInpexCRM/src/Sales&Purchase/DealerInvoice.jsx
Function: handleDealerSelect()

Change:
creditDays: 30  // ❌ Hardcoded
To:
creditDays: dealer.creditDays || 30  // ✅ From dealer
```

### Phase 3: Reporting & Analytics (Low Priority)

#### 3.1 Credit Limit Utilization Report
- Show all dealers with > 80% utilization
- Alert for dealers exceeding limit
- Trend analysis of credit utilization

#### 3.2 Credit Days Compliance Report
- Show average payment days vs credit days
- Identify dealers paying late
- Aging analysis by credit days

---

## API Endpoints Needed

### 1. Get Dealer Outstanding
```javascript
GET /api/dealers/:id/outstanding

Response:
{
  success: true,
  outstanding: {
    dealerId: "xxx",
    dealerName: "ABC Traders",
    creditLimit: 100000,
    currentOutstanding: 75000,
    availableCredit: 25000,
    utilizationPercent: 75,
    status: "available",
    lastPaymentDate: "2026-01-01",
    overdueAmount: 0
  }
}
```

### 2. Validate Credit Limit
```javascript
POST /api/dealers/:id/validate-credit

Request:
{
  amount: 50000
}

Response:
{
  success: true,
  validation: {
    isValid: false,
    currentOutstanding: 75000,
    newOutstanding: 125000,
    creditLimit: 100000,
    exceeded: 25000,
    message: "This transaction will exceed credit limit by ₹25,000"
  }
}
```

---

## Summary

### ✅ What's Working:
1. **Credit Days** - Properly linked in Sales Order Dashboard
2. **Credit Days** - Stored in all models (SalesOrder, DealerInvoice, DealerLedger)
3. **Credit Limit** - Displayed in Dealer App and Sales Executive App

### ❌ What's Missing:
1. **Credit Limit Validation** - Not checked when creating Sales Orders
2. **Credit Limit Validation** - Not checked when creating Dealer Invoices
3. **Credit Days Auto-fill** - Not auto-filled in Dealer Invoice from dealer
4. **Real-time Credit Status** - Not displayed when creating orders/invoices

### 🔴 Critical Risk:
**Users can create unlimited orders/invoices without credit limit validation**, leading to:
- Bad debt risk
- Financial losses
- No control over dealer credit exposure

### 📋 Recommended Action:
**Implement Phase 1 (Credit Limit Validation) IMMEDIATELY** to prevent financial risk.
