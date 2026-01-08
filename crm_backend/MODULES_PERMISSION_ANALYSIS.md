# Modules Permission Analysis - Sales & Finance Modules

## Overview
Analysis of 5 key modules to implement granular edit/delete permissions similar to Product Master and Discount Management.

---

## 1. SALES ORDER DASHBOARD

**File**: `JainInpexCRM/src/Sales&Purchase/SalesOrderDashboard.jsx`

### Current Edit/Delete Operations

#### Edit Operation (Line 732)
```javascript
const handleEdit = async (order) => {
  // Restrict editing: Only Pending, Confirmed, and Processing orders can be edited
  const editableStatuses = ['Pending', 'Confirmed', 'Processing'];
  if (!editableStatuses.includes(order.status)) {
    alert(`Cannot edit order with status "${order.status}". Only orders with status "Pending", "Confirmed", or "Processing" can be edited.`);
    return;
  }
  // ... edit logic
}
```

**UI Button** (Line 1706-1713):
```javascript
{['Pending', 'Confirmed', 'Processing'].includes(order.status) && (
  <button
    onClick={() => handleEdit(order)}
    className="p-2 text-green-600 hover:bg-green-100 rounded-lg"
    title="Edit Order"
  >
    <Edit2 className="w-4 h-4" />
  </button>
)}
```

#### Delete Operation (Line 876)
```javascript
const handleDelete = async (order) => {
  if (window.confirm(`Are you sure you want to delete order ${order.orderNumber}?`)) {
    try {
      // ... delete logic
    }
  }
}
```

**UI Button** (Line 1725-1731):
```javascript
<button
  onClick={() => handleDelete(order)}
  className="p-2 text-red-600 hover:bg-red-100 rounded-lg"
  title="Delete Order"
>
  <Trash2 className="w-4 h-4" />
</button>
```

### Business Rules
- **Edit**: Only orders with status "Pending", "Confirmed", or "Processing" can be edited
- **Delete**: Any order can be deleted (no status restriction currently)
- **Status Restriction**: Orders with "Delivered", "Cancelled", or "Rejected" status cannot be edited

### Recommended Permissions
```javascript
{
  id: "sales.order.dashboard",
  name: "Sales Order Dashboard",
  description: "View and Create sales orders (Edit/Delete requires separate permissions)"
},
{
  id: "sales.orders.update",
  name: "Sales Orders - Edit Permission",
  description: "Edit sales orders (Pending/Confirmed/Processing only)"
},
{
  id: "sales.orders.delete",
  name: "Sales Orders - Delete Permission",
  description: "Delete sales orders"
}
```

---

## 2. DEALER INVOICE

**File**: `JainInpexCRM/src/Sales&Purchase/DealerInvoice.jsx`

### Current Edit/Delete Operations

#### Edit Operation (Line 758)
```javascript
const handleEdit = (invoice) => {
  setEditingInvoice(invoice);
  setFormData({
    dealerId: invoice.dealer._id,
    salesOrderId: invoice.salesOrder?._id || "",
    customerInfo: { ... },
    items: invoice.items,
    creditDays: invoice.creditDays,
    remarks: invoice.remarks || "",
    internalNotes: invoice.internalNotes || ""
  });
  setSelectedDealer(invoice.dealer);
  setShowModal(true);
}
```

**UI Button** (Line 1073-1084):
```javascript
<button
  onClick={() => handleEdit(invoice)}
  className="text-blue-600 hover:text-blue-900"
>
  <Edit className="w-4 h-4" />
</button>
```

#### Delete Operation (Line 780)
```javascript
const handleDelete = async (id) => {
  if (window.confirm("Are you sure you want to delete this invoice?")) {
    try {
      const response = await apiService.deleteDealerInvoice(id);
      if (response.success) {
        setInvoices(prev => prev.filter(inv => inv._id !== id));
        alert("Invoice deleted successfully!");
      }
    } catch (error) {
      console.error("Error deleting invoice:", error);
      alert("Failed to delete invoice.");
    }
  }
}
```

**UI Button** (Line 1085-1090):
```javascript
<button
  onClick={() => handleDelete(invoice._id)}
  className="text-red-600 hover:text-red-900"
>
  <Trash2 className="w-4 h-4" />
</button>
```

### Business Rules
- **Edit**: Any invoice can be edited (no status restriction currently)
- **Delete**: Any invoice can be deleted (no status restriction currently)
- **Note**: Invoices have status updates (Pending, Paid, Cancelled) via `handleStatusUpdate`

### Recommended Permissions
```javascript
{
  id: "invoice",
  name: "Invoice Management",
  description: "View and Create invoices (Edit/Delete requires separate permissions)"
},
{
  id: "invoices.update",
  name: "Invoice - Edit Permission",
  description: "Edit existing invoices"
},
{
  id: "invoices.delete",
  name: "Invoice - Delete Permission",
  description: "Delete invoices"
}
```

---

## 3. DEALER MASTER

**File**: `JainInpexCRM/src/Components/MasterManagement/DealerMaster.jsx`

### Current Edit/Delete Operations

#### Edit Operation (Line 532)
```javascript
const handleEditDealer = (dealer) => {
  setCurrentDealer(dealer);
  form.setFieldsValue({
    ...dealer,
    dealerCategory: dealer.dealerCategory && dealer.dealerCategory.length > 0
      ? dealer.dealerCategory[0]
      : undefined,
  });
  // Load existing documents for editing
  setUploadedDocuments({ ... });
  setIsViewMode(false);
  setIsModalVisible(true);
}
```

**UI Button** (Line 1099-1103):
```javascript
{
  key: "edit",
  label: "Edit",
  icon: <EditOutlined />,
  onClick: () => handleEditDealer(record),
}
```

#### Delete Operation (Line 591)
```javascript
const handleDeleteDealer = async (dealerId) => {
  try {
    const response = await apiService.deleteDealer(dealerId);
    if (response.success) {
      message.success("Dealer deleted successfully");
      fetchDealers();
    }
  } catch (error) {
    message.error(error.message || "Failed to delete dealer");
  }
}
```

**UI Button** (Line 1104-1110):
```javascript
{
  key: "delete",
  label: "Delete",
  icon: <DeleteOutlined />,
  danger: true,
  onClick: () => handleDeleteDealer(record._id),
}
```

### Business Rules
- **Edit**: Any dealer can be edited (no restriction currently)
- **Delete**: Any dealer can be deleted (no restriction currently)
- **Note**: Uses Ant Design components (different from other modules)

### Recommended Permissions
```javascript
{
  id: "dealer.master",
  name: "Dealer Master",
  description: "View and Create dealers (Edit/Delete requires separate permissions)"
},
{
  id: "dealers.update",
  name: "Dealer Master - Edit Permission",
  description: "Edit existing dealers"
},
{
  id: "dealers.delete",
  name: "Dealer Master - Delete Permission",
  description: "Delete dealers"
}
```

---

## 4. DEALER PAYMENT

**File**: `JainInpexCRM/src/Sales&Purchase/DealerPayment.jsx`

### Current Edit/Delete Operations

#### Edit Operation
**NOT FOUND** - No edit functionality currently implemented in the visible code

#### Delete Operation (Line ~450 - not visible in truncated file)
```javascript
const handleDeletePayment = async (paymentId) => {
  if (window.confirm("Are you sure you want to delete this payment?")) {
    try {
      setLoading(true);
      const response = await apiService.deleteDealerPayment(paymentId);
      
      if (response.success) {
        await fetchPayments();
        await fetchStats();
      }
    } catch (error) {
      console.error('Error deleting payment:', error);
      alert('Failed to delete payment: ' + error.message);
    } finally {
      setLoading(false);
    }
  }
}
```

### Business Rules
- **Edit**: No edit functionality (payments are immutable once created)
- **Delete**: Any payment can be deleted
- **Status Update**: Payments have status updates (Pending, Approved, Rejected) via `handleStatusUpdate`
- **Note**: Payments should typically not be edited, only approved/rejected

### Recommended Permissions
```javascript
{
  id: "payment",
  name: "Payment Management",
  description: "View and Create payments (Delete requires separate permission)"
},
{
  id: "payments.delete",
  name: "Payment - Delete Permission",
  description: "Delete payment records (use with caution)"
},
{
  id: "payments.approve",
  name: "Payment - Approval Permission",
  description: "Approve or reject payment records"
}
```

---

## 5. DEALER LEDGER

**File**: `JainInpexCRM/src/Finance&Accounts/DealerLedger.jsx`

### Current Edit/Delete Operations

#### Edit Operation
**NOT FOUND** - No edit functionality (ledger is read-only)

#### Delete Operation
**NOT FOUND** - No delete functionality (ledger is read-only)

### Business Rules
- **View Only**: Dealer Ledger is a read-only report/view
- **No Edit/Delete**: Ledger entries are generated from invoices and payments, not directly editable
- **Download**: Has PDF download functionality
- **Reminders**: Can send payment reminders to dealers

### Recommended Permissions
```javascript
{
  id: "dealer.ledger",
  name: "Dealer Ledger",
  description: "View dealer ledger and outstanding balances"
},
{
  id: "dealer.ledger.download",
  name: "Dealer Ledger - Download Permission",
  description: "Download dealer ledger reports"
},
{
  id: "dealer.ledger.reminders",
  name: "Dealer Ledger - Send Reminders",
  description: "Send payment reminders to dealers"
}
```

---

## SUMMARY TABLE

| Module | Has Edit? | Has Delete? | Current Restrictions | Needs Permissions? |
|--------|-----------|-------------|---------------------|-------------------|
| **Sales Order Dashboard** | ✅ Yes | ✅ Yes | Edit: Status-based (Pending/Confirmed/Processing only) | ✅ YES |
| **Dealer Invoice** | ✅ Yes | ✅ Yes | None currently | ✅ YES |
| **Dealer Master** | ✅ Yes | ✅ Yes | None currently | ✅ YES |
| **Dealer Payment** | ❌ No | ✅ Yes | None currently | ✅ YES (Delete only) |
| **Dealer Ledger** | ❌ No | ❌ No | Read-only module | ⚠️ OPTIONAL (View/Download only) |

---

## IMPLEMENTATION PRIORITY

### High Priority (Edit + Delete)
1. **Sales Order Dashboard** - Critical business operations
2. **Dealer Invoice** - Financial records
3. **Dealer Master** - Master data integrity

### Medium Priority (Delete only)
4. **Dealer Payment** - Financial records (no edit needed)

### Low Priority (View permissions only)
5. **Dealer Ledger** - Read-only reporting

---

## RECOMMENDED PERMISSION STRUCTURE

### Sales Order Dashboard
- Base: `sales.order.dashboard` (View + Create)
- Edit: `sales.orders.update` (Edit Pending/Confirmed/Processing orders)
- Delete: `sales.orders.delete` (Delete any order)

### Dealer Invoice
- Base: `invoice` (View + Create)
- Edit: `invoices.update` (Edit any invoice)
- Delete: `invoices.delete` (Delete any invoice)

### Dealer Master
- Base: `dealer.master` (View + Create)
- Edit: `dealers.update` (Edit any dealer)
- Delete: `dealers.delete` (Delete any dealer)

### Dealer Payment
- Base: `payment` (View + Create)
- Delete: `payments.delete` (Delete payment records)
- Approve: `payments.approve` (Approve/Reject payments)

### Dealer Ledger
- Base: `dealer.ledger` (View ledger)
- Download: `dealer.ledger.download` (Download reports)
- Reminders: `dealer.ledger.reminders` (Send reminders)

---

## NEXT STEPS

1. Update `config/permissions.js` with new permissions
2. Add permission checks to each component
3. Wrap Edit/Delete buttons with permission conditionals
4. Test with different user roles
5. Document permission requirements for each module
