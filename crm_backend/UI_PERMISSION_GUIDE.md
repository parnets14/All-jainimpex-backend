# Frontend UI Permission Selection Guide

## 🎯 What You Can See in the User Management Interface

When you click "Manage Permissions" for a user in the frontend, you'll see a modal with **11 expandable categories** containing **100 total permissions**.

### 📁 Permission Categories (Expandable Folders)

#### 1. **General** (4 permissions)
- ✅ Dashboard View
- ✅ System Management  
- ✅ User Management
- ✅ User Management (Alt)

#### 2. **Master Management** (21 permissions)
- ✅ Master Management Access
- ✅ Product Master & Product Management
- ✅ Dealer Master & Management (View/Create/Update/Delete)
- ✅ Supplier Master & Management
- ✅ Category Setup & Management (View/Create/Update/Delete)
- ✅ Dealer Type & Category
- ✅ Expense Category
- ✅ Region Master
- ✅ Warehouse Master

#### 3. **Sales & Purchase Management** (10 permissions)
- ✅ Sales & Purchase Management Access
- ✅ Sales Order Dashboard
- ✅ Dealer-Specific Discounts
- ✅ Purchasing Points
- ✅ PO Management
- ✅ GRN Entry
- ✅ Invoice Management
- ✅ Credit Note & Debit Note
- ✅ Payment Management

#### 4. **Inventory & Warehouse Control** (3 permissions)
- ✅ Inventory Management Access
- ✅ Stock Management
- ✅ Stock Transfer

#### 5. **HRMS Administration** (9 permissions)
- ✅ HRMS Management Access
- ✅ Employee Registration & Management (View/Create/Update/Delete)
- ✅ Geo Attendance Monitoring
- ✅ Attendance Master
- ✅ Generate Salary Slip

#### 6. **Finance & Accounts** (17 permissions)
- ✅ Finance Management Access
- ✅ Dealer Ledger
- ✅ Supplier Ledger (Read/Create/Update/Delete)
- ✅ Cheque Management (View/Create/Update/Delete)
- ✅ Auto Reconciliation (Read/Create/Update/Delete)

#### 7. **Reports & Logs** (18 permissions)
- ✅ Reports Management Access
- ✅ Activity Logs & Subadmin Activity Logs
- ✅ Bill-wise Profit Analysis
- ✅ Category & Product Gross Margin
- ✅ Sale vs Purchase Price Deviation
- ✅ Download Logs Management
- ✅ Dealer Performance (Read/Create/Update/Delete)
- ✅ Margin Analysis (Read/Create/Update/Delete)

#### 8. **Expense Management** (2 permissions)
- ✅ Expense Management Access
- ✅ Expense Head Master

#### 9. **Support & Communication** (1 permission)
- ✅ Support Chat

#### 10. **Sales Executive App** (7 permissions)
- ✅ Sales Executive App Access
- ✅ Attendance View
- ✅ Route Plan Management
- ✅ Dealer Insights
- ✅ Product Recommendations
- ✅ Collections View
- ✅ Target Management

#### 11. **Delivery Executive App** (8 permissions)
- ✅ Delivery Executive App Access
- ✅ Delivery Assignment Management
- ✅ Delivery Monitoring View
- ✅ My Deliveries View
- ✅ Live Tracking View
- ✅ Route Plan View
- ✅ Collections View
- ✅ Delivery History View

---

## 🎨 How the UI Works

### Permission Selection Interface:
1. **📁 Category Headers** - Click to expand/collapse
2. **☑️ Category Checkbox** - Select/deselect entire category
3. **📋 Individual Permissions** - Each with checkbox, name, and description
4. **🔍 Visual States**:
   - ✅ **Checked** - Permission granted
   - ☐ **Unchecked** - Permission denied  
   - ◐ **Indeterminate** - Some permissions in category selected

### Selection Features:
- **Bulk Selection**: Check category header to select all permissions in that category
- **Individual Control**: Check/uncheck specific permissions
- **Visual Feedback**: Clear indication of what's selected
- **Search/Filter**: Easy to find specific permissions

---

## 🎯 UI Component Mapping

### What Each UI Menu Item Requires:

| **Sidebar Menu Item** | **Required Permissions** |
|----------------------|-------------------------|
| 🏠 Dashboard | `dashboard.view` |
| ⚙️ System Management → User Management | `users.manage` OR `user.management` |
| 📦 Master Management → Product Master | `product.master` |
| 📦 Master Management → Dealer Master | `dealer.master` + `dealers.view/create/update/delete` |
| 📦 Master Management → Category Setup | `category.setup` + `categories.view/create/update/delete` |
| 🛒 Sales & Purchase → Sales Dashboard | `sales.order.dashboard` |
| 🛒 Sales & Purchase → PO Management | `po.management` |
| 💰 Finance & Accounts → Dealer Ledger | `dealer.ledger` |
| 💰 Finance & Accounts → Cheque Management | `cheque.management` + `cheques.view/create/update/delete` |
| 👥 HRMS → Employee Registration | `employee.registration` + `employees.view/create/update/delete` |
| 📊 Reports → Profit Analysis | `bill.wise.profit` OR `category.product.gross.margin` |
| 📱 Sales Executive App | `sales.executive.app` + specific feature permissions |

---

## 💡 Quick Permission Sets for Common Roles

### 🔹 **Sub Admin (Full Access)**
- **All 100 permissions** ✅
- Can access every UI component and feature

### 🔹 **Sales Manager**
- General (4) + Master Management (21) + Sales & Purchase (10) + Reports (18)
- **Total: ~53 permissions**

### 🔹 **Finance Manager**  
- General (4) + Finance & Accounts (17) + Reports (18)
- **Total: ~39 permissions**

### 🔹 **HR Manager**
- General (4) + HRMS Administration (9) + Employee-related permissions
- **Total: ~20 permissions**

### 🔹 **Purchase Manager**
- General (4) + Master Management (21) + Sales & Purchase (10) + Inventory (3)
- **Total: ~38 permissions**

---

## 🚀 How to Use in Frontend

1. **Navigate to User Management** (requires super admin access)
2. **Click "Manage Permissions"** on any user row
3. **See the permission modal** with 11 expandable categories
4. **Select permissions** by:
   - Clicking category checkboxes for bulk selection
   - Clicking individual permission checkboxes for fine control
5. **Save changes** - permissions take effect immediately

The UI provides a comprehensive, user-friendly way to manage all 100 available permissions across 11 major functional areas of the CRM system.