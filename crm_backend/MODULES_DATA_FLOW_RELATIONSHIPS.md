# Modules Data Flow & Relationships Analysis

## Complete Data Flow Diagram

```
┌─────────────────┐
│  DEALER MASTER  │ (Master Data)
│   (Dealers)     │
└────────┬────────┘
         │
         │ References
         ↓
┌─────────────────────────────────────────────────────────────┐
│                    SALES ORDER DASHBOARD                     │
│  - Creates Sales Orders                                      │
│  - References: Dealer, Products, Warehouses                  │
│  - Status: Pending → Confirmed → Processing → Delivered      │
└────────┬────────────────────────────────────────────────────┘
         │
         │ salesOrderId (Optional Reference)
         ↓
┌─────────────────────────────────────────────────────────────┐
│                     DEALER INVOICE                           │
│  - Creates Invoices from Sales Orders OR Standalone          │
│  - References: Dealer, SalesOrder (optional), Products       │
│  - Creates DEBIT entry in Dealer Ledger                      │
│  - Status: Draft → Pending → Approved → Dispatched           │
└────────┬────────────────────────────────────────────────────┘
         │
         │ Creates Ledger Entry (Debit)
         ↓
┌─────────────────────────────────────────────────────────────┐
│                     DEALER LEDGER                            │
│  - Read-Only View (Auto-Generated)                           │
│  - Shows: Invoices (Debit) + Payments (Credit)               │
│  - Calculates: Running Balance, Outstanding Amount           │
│  - Entry Types: Invoice, Payment, Credit Note, Adjustment    │
└────────┬────────────────────────────────────────────────────┘
         ↑
         │ Creates Ledger Entry (Credit)
         │
┌─────────────────────────────────────────────────────────────┐
│                     DEALER PAYMENT                           │
│  - Records Payments against Invoices                         │
│  - References: DealerInvoice, Dealer                         │
│  - Creates CREDIT entry in Dealer Ledger                     │
│  - Status: Pending → Approved/Rejected                       │
│  - Updates Invoice.paidAmount                                │
└─────────────────────────────────────────────────────────────┘
```

---

## Detailed Module Relationships

### 1. DEALER MASTER → SALES ORDER DASHBOARD
**Relationship**: One-to-Many (One Dealer → Many Sales Orders)

**Data Flow**:
```javascript
// Dealer Master provides:
- dealer._id
- dealer.name
- dealer.code
- dealer.dealerType
- dealer.creditDays
- dealer.regionId

// Sales Order Dashboard uses:
formData.dealer = dealerId
formData.creditDays = dealer.creditDays (default)
formData.type = orderTypeMapping[dealer.dealerType]
```

**Impact of Edit/Delete**:
- ✅ **Edit Dealer**: Updates reflected in new sales orders
- ⚠️ **Delete Dealer**: BLOCKS if sales orders exist (referential integrity)

---

### 2. SALES ORDER DASHBOARD → DEALER INVOICE
**Relationship**: One-to-One (One Sales Order → One Invoice) - OPTIONAL

**Data Flow**:
```javascript
// Sales Order provides:
- salesOrder._id
- salesOrder.orderNumber
- salesOrder.products[] (with quantities, prices, warehouses)
- salesOrder.dealer
- salesOrder.creditDays

// Dealer Invoice uses:
formData.salesOrderId = salesOrderId (optional)
formData.items = salesOrder.products.map(...)
formData.creditDays = salesOrder.creditDays

// Backend Model Reference:
DealerInvoice.salesOrder: ObjectId (ref: "SalesOrder")
```

**Business Logic**:
```javascript
// In DealerInvoice.jsx:
const loadDealerSalesOrders = async (dealerId) => {
  // Only load "Delivered" sales orders
  const response = await apiService.getDealerSalesOrders(dealerId, { 
    status: "Delivered" 
  });
  
  // Filter out sales orders that already have invoices
  const availableSalesOrders = allSalesOrders.filter(salesOrder => {
    const hasInvoice = invoices.some(invoice => 
      invoice.salesOrder && invoice.salesOrder._id === salesOrder._id
    );
    return !hasInvoice; // Only show orders without invoices
  });
}
```

**Impact of Edit/Delete**:
- ✅ **Edit Sales Order**: 
  - If NOT invoiced yet: Can edit freely
  - If ALREADY invoiced: Should NOT edit (data integrity issue)
- ⚠️ **Delete Sales Order**: 
  - If NOT invoiced: Can delete
  - If ALREADY invoiced: BLOCKS (referential integrity)

---

### 3. DEALER INVOICE → DEALER LEDGER
**Relationship**: One-to-One (One Invoice → One Ledger Entry - DEBIT)

**Data Flow**:
```javascript
// When Invoice is created/approved:
DealerLedger.create({
  dealer: invoice.dealer,
  transactionType: "Invoice",
  invoice: invoice._id,
  invoiceNumber: invoice.invoiceNumber,
  invoiceValue: invoice.totalAmount,
  debitAmount: invoice.totalAmount,  // DEBIT (Dealer owes money)
  creditAmount: 0,
  entryDate: invoice.invoiceDate,
  creditDays: invoice.creditDays,
  dueDate: invoice.dueDate,
  pointsEarned: invoice.totalPoints,
  runningBalance: previousBalance + invoice.totalAmount
})
```

**Backend Model**:
```javascript
// DealerLedger.js
{
  dealer: ObjectId (ref: "Dealer"),
  transactionType: "Invoice",
  invoice: ObjectId (ref: "DealerInvoice"),
  invoiceNumber: String,
  debitAmount: Number,  // Invoice amount
  creditAmount: 0,
  runningBalance: Number  // Auto-calculated
}
```

**Impact of Edit/Delete**:
- ⚠️ **Edit Invoice**: 
  - If NO payments yet: Can edit, must UPDATE ledger entry
  - If payments exist: BLOCKS or requires complex adjustment
- ⚠️ **Delete Invoice**: 
  - If NO payments: Can delete, must DELETE ledger entry
  - If payments exist: BLOCKS (cannot delete paid invoice)

---

### 4. DEALER PAYMENT → DEALER LEDGER
**Relationship**: One-to-One (One Payment → One Ledger Entry - CREDIT)

**Data Flow**:
```javascript
// When Payment is created/approved:
DealerLedger.create({
  dealer: payment.dealer,
  transactionType: "Payment",
  paymentReceived: payment.paymentAmount,
  paymentMethod: payment.paymentMethod,
  debitAmount: 0,
  creditAmount: payment.paymentAmount,  // CREDIT (Dealer paid money)
  entryDate: payment.paymentDate,
  chequeDetails: payment.chequeDetails,  // If cheque
  upiDetails: payment.upiDetails,        // If UPI
  bankTransferDetails: payment.bankTransferDetails,  // If bank transfer
  runningBalance: previousBalance - payment.paymentAmount
})

// Also updates Invoice:
DealerInvoice.findByIdAndUpdate(payment.dealerInvoice, {
  $inc: { paidAmount: payment.paymentAmount },
  paymentStatus: calculatePaymentStatus(invoice)
})
```

**Backend Model**:
```javascript
// DealerPayment.js
{
  dealerInvoice: ObjectId (ref: "DealerInvoice"),  // REQUIRED
  dealer: ObjectId (ref: "Dealer"),
  paymentAmount: Number,
  paymentMethod: "Cash" | "Cheque" | "UPI" | "Bank Transfer",
  status: "Pending" | "Approved" | "Rejected"
}
```

**Impact of Edit/Delete**:
- ❌ **Edit Payment**: NOT ALLOWED (payments are immutable)
- ⚠️ **Delete Payment**: 
  - If status = "Pending": Can delete
  - If status = "Approved": BLOCKS or requires reversal entry
  - Must UPDATE invoice.paidAmount
  - Must DELETE ledger entry

---

### 5. DEALER PAYMENT → DEALER INVOICE
**Relationship**: Many-to-One (Many Payments → One Invoice)

**Data Flow**:
```javascript
// Payment references Invoice:
DealerPayment.dealerInvoice = invoiceId  // REQUIRED

// Payment updates Invoice:
DealerInvoice.paidAmount += payment.paymentAmount
DealerInvoice.paymentStatus = calculateStatus()

// Payment Status Logic:
function calculatePaymentStatus(invoice) {
  if (invoice.paidAmount === 0) return "Pending"
  if (invoice.paidAmount < invoice.totalAmount) return "Partial"
  if (invoice.paidAmount >= invoice.totalAmount) return "Paid"
  if (new Date() > invoice.dueDate && invoice.paidAmount < invoice.totalAmount) {
    return "Overdue"
  }
}
```

**Available Invoices Logic**:
```javascript
// In DealerPayment.jsx:
const fetchAvailableInvoices = async (dealerId) => {
  // Backend returns only invoices with remainingAmount > 0
  const response = await apiService.getAvailableDealerInvoicesForPayment({
    dealer: dealerId
  });
  
  // Each invoice shows:
  // - totalAmount
  // - paidAmount
  // - remainingAmount = totalAmount - paidAmount
}
```

**Impact of Edit/Delete**:
- ❌ **Edit Payment**: NOT ALLOWED
- ⚠️ **Delete Payment**: Must DECREASE invoice.paidAmount

---

### 6. DEALER LEDGER (Read-Only View)
**Relationship**: Aggregates data from Invoices + Payments

**Data Flow**:
```javascript
// Ledger Entry Types:
1. Invoice → Debit Entry (Dealer owes money)
   - debitAmount = invoice.totalAmount
   - creditAmount = 0

2. Payment → Credit Entry (Dealer paid money)
   - debitAmount = 0
   - creditAmount = payment.paymentAmount

3. Credit Note → Credit Entry (Refund to dealer)
   - debitAmount = 0
   - creditAmount = creditNote.amount

4. Adjustment → Debit or Credit Entry
   - Manual adjustments by admin

// Running Balance Calculation:
runningBalance = previousBalance + debitAmount - creditAmount

// Outstanding Amount:
outstanding = runningBalance (if positive)
```

**Ledger Display Logic**:
```javascript
// In DealerLedger.jsx:
const filteredLedger = allLedgerEntries
  .filter(entry => 
    (!fromDate || new Date(entry.entryDate) >= new Date(fromDate)) && 
    (!toDate || new Date(entry.entryDate) <= new Date(toDate)) &&
    !entry.creditNoteNumber  // Exclude credit notes
  )
  .sort((a, b) => {
    // Sort by date, then invoices before payments
    const dateCompare = new Date(a.entryDate) - new Date(b.entryDate);
    if (dateCompare !== 0) return dateCompare;
    
    // Debit (invoice) = 0, Credit (payment) = 1
    const aType = (a.debitAmount > 0) ? 0 : 1;
    const bType = (b.debitAmount > 0) ? 0 : 1;
    return aType - bType;
  });

// Financial Summary:
const totalDue = ledgerEntries.reduce((sum, entry) => 
  sum + (entry.debitAmount || 0), 0
);
const amountPaid = ledgerEntries.reduce((sum, entry) => 
  sum + (entry.creditAmount || 0), 0
);
const outstanding = totalDue - amountPaid;
```

---

## Critical Data Integrity Rules

### Rule 1: Sales Order → Invoice Relationship
```
✅ ALLOWED:
- Create Invoice WITHOUT Sales Order (standalone invoice)
- Create Invoice FROM Sales Order (one-to-one mapping)

❌ NOT ALLOWED:
- Create multiple invoices from same Sales Order
- Edit Sales Order after Invoice is created
- Delete Sales Order if Invoice exists
```

### Rule 2: Invoice → Payment Relationship
```
✅ ALLOWED:
- Multiple Payments for one Invoice (partial payments)
- Payment amount <= Invoice remaining amount

❌ NOT ALLOWED:
- Payment without Invoice reference
- Payment amount > Invoice remaining amount
- Edit Payment after approval
- Delete Invoice if Payments exist
```

### Rule 3: Ledger Entry Integrity
```
✅ AUTO-GENERATED:
- Invoice created → Ledger Debit Entry created
- Payment approved → Ledger Credit Entry created
- Running balance auto-calculated

❌ MANUAL EDIT NOT ALLOWED:
- Cannot directly edit Ledger entries
- Cannot delete Ledger entries
- Must edit source (Invoice/Payment) to update Ledger
```

### Rule 4: Deletion Cascade Rules
```
DELETE DEALER:
  ↓
  Check: Has Sales Orders? → BLOCK
  Check: Has Invoices? → BLOCK
  Check: Has Payments? → BLOCK
  Check: Has Ledger Entries? → BLOCK

DELETE SALES ORDER:
  ↓
  Check: Has Invoice? → BLOCK
  If No Invoice → Allow Delete

DELETE INVOICE:
  ↓
  Check: Has Payments? → BLOCK
  If No Payments → Delete Invoice + Delete Ledger Entry

DELETE PAYMENT:
  ↓
  Check: Status = Approved? → BLOCK or Require Reversal
  If Pending → Delete Payment + Delete Ledger Entry + Update Invoice.paidAmount
```

---

## Permission Impact Analysis

### Scenario 1: User with ONLY View Permission
```
dealer.master (View) → Can see dealers
sales.order.dashboard (View) → Can see sales orders
invoice (View) → Can see invoices
payment (View) → Can see payments
dealer.ledger (View) → Can see ledger

Result: Read-only access to all modules
```

### Scenario 2: User with View + Edit (No Delete)
```
sales.orders.update → Can edit Pending/Confirmed/Processing orders
invoices.update → Can edit invoices (if no payments)
dealers.update → Can edit dealer details

Impact:
- Editing Sales Order: Updates reflected in future invoices
- Editing Invoice: Must update Ledger entry
- Editing Dealer: Updates reflected in new orders
```

### Scenario 3: User with View + Delete (No Edit)
```
sales.orders.delete → Can delete orders (if not invoiced)
invoices.delete → Can delete invoices (if no payments)
payments.delete → Can delete pending payments

Impact:
- Deleting Sales Order: Only if no invoice exists
- Deleting Invoice: Must delete Ledger entry
- Deleting Payment: Must update Invoice.paidAmount + delete Ledger entry
```

### Scenario 4: Super Admin (Full Access)
```
All permissions → Can do everything
Special Powers:
- Can delete invoices even with payments (with reversal)
- Can delete sales orders even if invoiced (with cascade)
- Can manually adjust ledger entries
```

---

## Recommended Permission Implementation Order

### Phase 1: High Priority (Critical Business Operations)
1. **Sales Order Dashboard**
   - Base: `sales.order.dashboard` (View + Create)
   - Edit: `sales.orders.update` (Edit Pending/Confirmed/Processing)
   - Delete: `sales.orders.delete` (Delete if not invoiced)

2. **Dealer Invoice**
   - Base: `invoice` (View + Create)
   - Edit: `invoices.update` (Edit if no payments)
   - Delete: `invoices.delete` (Delete if no payments)

### Phase 2: Medium Priority (Master Data)
3. **Dealer Master**
   - Base: `dealer.master` (View + Create)
   - Edit: `dealers.update` (Edit any dealer)
   - Delete: `dealers.delete` (Delete if no transactions)

### Phase 3: Low Priority (Financial Records)
4. **Dealer Payment**
   - Base: `payment` (View + Create)
   - Delete: `payments.delete` (Delete pending only)
   - Approve: `payments.approve` (Approve/Reject)

5. **Dealer Ledger**
   - Base: `dealer.ledger` (View only)
   - Download: `dealer.ledger.download` (Download PDF)
   - Reminders: `dealer.ledger.reminders` (Send reminders)

---

## Data Flow Summary

```
DEALER MASTER (Master Data)
    ↓
SALES ORDER (Creates Order)
    ↓ (Optional Reference)
DEALER INVOICE (Creates Invoice + Ledger Debit Entry)
    ↓
DEALER LEDGER (Shows Debit Entry)
    ↑
DEALER PAYMENT (Records Payment + Ledger Credit Entry + Updates Invoice)
```

**Key Insight**: 
- Dealer Ledger is the **RESULT** of Invoices and Payments
- Editing/Deleting Invoices or Payments **MUST** update Ledger
- Ledger itself is **READ-ONLY** (no direct edit/delete)
