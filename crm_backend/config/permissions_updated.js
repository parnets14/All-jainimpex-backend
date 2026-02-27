// config/permissions.js - UPDATED WITH ALL COMPONENTS
export const AVAILABLE_PERMISSIONS = {
  "General": [
    {
      id: "dashboard.view",
      name: "Dashboard View",
      description: "Access to dashboard"
    },
    {
      id: "system.management",
      name: "System Management",
      description: "Access to system management features"
    },
    {
      id: "users.manage",
      name: "User Management", 
      description: "Manage users and permissions"
    },
    {
      id: "user.management",
      name: "User Management (Alt)",
      description: "Alternative user management permission"
    }
  ],
  "Master Management": [
    {
      id: "master.management",
      name: "Master Management Access",
      description: "Access to all master management modules"
    },
    {
      id: "product.master",
      name: "Product Master",
      description: "View and Add products (Edit/Delete requires separate permissions)"
    },
    {
      id: "products.view",
      name: "Product Master - View Permission",
      description: "View products"
    },
    {
      id: "products.create",
      name: "Product Master - Create Permission",
      description: "Create new products"
    },
    {
      id: "products.update",
      name: "Product Master - Edit Permission",
      description: "Edit existing products (requires Product Master access)"
    },
    {
      id: "products.delete",
      name: "Product Master - Delete Permission",
      description: "Delete products (requires Product Master access)"
    },
    {
      id: "product.management",
      name: "Product Management (Full Access)",
      description: "Full product management access (view, create, edit, delete)"
    },
    {
      id: "dealer.master",
      name: "Dealer Master",
      description: "Manage dealer master data"
    },
    {
      id: "dealer.management",
      name: "Dealer Management",
      description: "Full dealer management access"
    },
    {
      id: "dealers.view",
      name: "View Dealers",
      description: "View dealer information and statistics"
    },
    {
      id: "dealers.create",
      name: "Create Dealers",
      description: "Create new dealers"
    },
    {
      id: "dealers.update",
      name: "Update Dealers",
      description: "Update dealer information"
    },
    {
      id: "dealers.delete",
      name: "Delete Dealers",
      description: "Delete dealers"
    },
    {
      id: "supplier.master", 
      name: "Supplier Master",
      description: "Manage supplier master data"
    },
    {
      id: "supplier.management",
      name: "Supplier Management",
      description: "Full supplier management access"
    },
    {
      id: "suppliers.view",
      name: "View Suppliers",
      description: "View supplier information"
    },
    {
      id: "suppliers.create",
      name: "Create Suppliers",
      description: "Create new suppliers"
    },
    {
      id: "suppliers.update",
      name: "Update Suppliers",
      description: "Update supplier information"
    },
    {
      id: "suppliers.delete",
      name: "Delete Suppliers",
      description: "Delete suppliers"
    },
    {
      id: "dealer.type",
      name: "Dealer Type",
      description: "Manage dealer types"
    },
    {
      id: "dealer.category",
      name: "Dealer Category", 
      description: "Manage dealer categories"
    },
    {
      id: "expense.category",
      name: "Expense Category",
      description: "Manage expense categories"
    },
    {
      id: "region.master",
      name: "Region Master",
      description: "Manage region master data"
    },
    {
      id: "regions.view",
      name: "View Regions",
      description: "View region information"
    },
    {
      id: "regions.create",
      name: "Create Regions",
      description: "Create new regions"
    },
    {
      id: "regions.update",
      name: "Update Regions",
      description: "Update region information"
    },
    {
      id: "regions.delete",
      name: "Delete Regions",
      description: "Delete regions"
    },
    {
      id: "category.setup",
      name: "Category Setup",
      description: "Setup categories"
    },
    {
      id: "categories.view",
      name: "Categories View",
      description: "View categories, subcategories, and brands"
    },
    {
      id: "categories.create",
      name: "Create Categories",
      description: "Create categories, subcategories, and brands"
    },
    {
      id: "categories.update",
      name: "Update Categories",
      description: "Update categories, subcategories, and brands"
    },
    {
      id: "categories.delete",
      name: "Delete Categories",
      description: "Delete categories, subcategories, and brands"
    },
    {
      id: "warehouseMaster",
      name: "Warehouse Master",
      description: "Manage warehouse master data"
    },
    {
      id: "warehouses.view",
      name: "View Warehouses",
      description: "View warehouse information"
    },
    {
      id: "warehouses.create",
      name: "Create Warehouses",
      description: "Create new warehouses"
    },
    {
      id: "warehouses.update",
      name: "Update Warehouses",
      description: "Update warehouse information"
    },
    {
      id: "warehouses.delete",
      name: "Delete Warehouses",
      description: "Delete warehouses"
    }
  ],
  "Sales & Purchase Management": [
    {
      id: "sales.purchase.management",
      name: "Sales & Purchase Management Access",
      description: "Access to all sales and purchase modules"
    },
    {
      id: "sales.order.dashboard",
      name: "Sales Order Dashboard",
      description: "Access sales order dashboard"
    },
    {
      id: "sales.orders.view",
      name: "View Sales Orders",
      description: "View sales orders"
    },
    {
      id: "sales.orders.create",
      name: "Create Sales Orders",
      description: "Create new sales orders"
    },
    {
      id: "sales.orders.update",
      name: "Update Sales Orders",
      description: "Update sales orders"
    },
    {
      id: "sales.orders.delete",
      name: "Delete Sales Orders",
      description: "Delete sales orders"
    },
    {
      id: "sales.orders.approve",
      name: "Approve Sales Orders",
      description: "Approve pending sales orders"
    },
    {
      id: "dealer.specific.discounts",
      name: "Dealer-Specific Discounts",
      description: "View and Create discount mappings (Edit/Delete requires separate permissions)"
    },
    {
      id: "discounts.view",
      name: "Discount Management - View Permission",
      description: "View discount mappings"
    },
    {
      id: "discounts.create",
      name: "Discount Management - Create Permission",
      description: "Create new discount mappings"
    },
    {
      id: "discounts.update",
      name: "Discount Management - Edit Permission",
      description: "Edit existing discount mappings (requires Dealer-Specific Discounts access)"
    },
    {
      id: "discounts.delete",
      name: "Discount Management - Delete Permission",
      description: "Delete discount mappings (requires Dealer-Specific Discounts access)"
    },
    {
      id: "discounts.approve",
      name: "Discount Management - Approve Permission",
      description: "Approve or reject discount mappings"
    },
    {
      id: "purchasing.points",
      name: "Purchasing Points", 
      description: "Manage purchasing points"
    },
    {
      id: "po.management",
      name: "PO Management",
      description: "Manage purchase orders"
    },
    {
      id: "purchase.orders.view",
      name: "View Purchase Orders",
      description: "View purchase orders"
    },
    {
      id: "purchase.orders.create",
      name: "Create Purchase Orders",
      description: "Create new purchase orders"
    },
    {
      id: "purchase.orders.update",
      name: "Update Purchase Orders",
      description: "Update purchase orders"
    },
    {
      id: "purchase.orders.delete",
      name: "Delete Purchase Orders",
      description: "Delete purchase orders"
    },
    {
      id: "grn.entry",
      name: "GRN Entry",
      description: "Handle goods received note entry"
    },
    {
      id: "grn.view",
      name: "View GRN",
      description: "View goods received notes"
    },
    {
      id: "grn.create",
      name: "Create GRN",
      description: "Create new goods received notes"
    },
    {
      id: "grn.update",
      name: "Update GRN",
      description: "Update goods received notes"
    },
    {
      id: "grn.delete",
      name: "Delete GRN",
      description: "Delete goods received notes"
    },
    {
      id: "invoice",
      name: "Invoice Management",
      description: "Manage invoices"
    },
    {
      id: "invoices.view",
      name: "View Invoices",
      description: "View dealer invoices"
    },
    {
      id: "invoices.create",
      name: "Create Invoices",
      description: "Create new dealer invoices"
    },
    {
      id: "invoices.update",
      name: "Update Invoices",
      description: "Update dealer invoices"
    },
    {
      id: "invoices.delete",
      name: "Delete Invoices",
      description: "Delete dealer invoices"
    },
    {
      id: "invoices.approve",
      name: "Approve Invoices",
      description: "Approve draft invoices"
    },
    {
      id: "credit.note",
      name: "Credit Note",
      description: "Manage credit notes"
    },
    {
      id: "credit.notes.view",
      name: "View Credit Notes",
      description: "View credit notes"
    },
    {
      id: "credit.notes.create",
      name: "Create Credit Notes",
      description: "Create new credit notes"
    },
    {
      id: "credit.notes.update",
      name: "Update Credit Notes",
      description: "Update credit notes"
    },
    {
      id: "credit.notes.delete",
      name: "Delete Credit Notes",
      description: "Delete credit notes"
    },
    {
      id: "debit.note",
      name: "Debit Note",
      description: "Manage debit notes"
    },
    {
      id: "debit.notes.view",
      name: "View Debit Notes",
      description: "View debit notes"
    },
    {
      id: "debit.notes.create",
      name: "Create Debit Notes",
      description: "Create new debit notes"
    },
    {
      id: "debit.notes.update",
      name: "Update Debit Notes",
      description: "Update debit notes"
    },
    {
      id: "debit.notes.delete",
      name: "Delete Debit Notes",
      description: "Delete debit notes"
    },
    {
      id: "payment",
      name: "Payment Management",
      description: "Manage payments (supplier and dealer)"
    },
    {
      id: "payments.view",
      name: "View Payments",
      description: "View payment records"
    },
    {
      id: "payments.create",
      name: "Create Payments",
      description: "Create new payment records"
    },
    {
      id: "payments.update",
      name: "Update Payments",
      description: "Update payment records"
    },
    {
      id: "payments.delete",
      name: "Delete Payments",
      description: "Delete payment records"
    }
  ],
  "Inventory & Warehouse Control": [
    {
      id: "inventory.management",
      name: "Inventory Management Access",
      description: "Access to all inventory modules"
    },
    {
      id: "stock",
      name: "Stock Management",
      description: "Manage stock"
    },
    {
      id: "stock.view",
      name: "View Stock",
      description: "View stock levels and information"
    },
    {
      id: "stock.create",
      name: "Create Stock",
      description: "Create new stock entries"
    },
    {
      id: "stock.update",
      name: "Update Stock",
      description: "Update stock information"
    },
    {
      id: "stock.delete",
      name: "Delete Stock",
      description: "Delete stock entries"
    },
    {
      id: "stock.transfer",
      name: "Stock Transfer",
      description: "Manage stock transfers"
    },
    {
      id: "stock.transfers.view",
      name: "View Stock Transfers",
      description: "View stock transfer records"
    },
    {
      id: "stock.transfers.create",
      name: "Create Stock Transfers",
      description: "Create new stock transfers"
    },
    {
      id: "stock.transfers.approve",
      name: "Approve Stock Transfers",
      description: "Approve pending stock transfers"
    },
    {
      id: "stock.adjustments",
      name: "Stock Adjustments",
      description: "Make manual stock adjustments"
    }
  ],
  "HRMS Administration": [
    {
      id: "hrms.management",
      name: "HRMS Management Access", 
      description: "Access to all HRMS modules"
    },
    {
      id: "employee.registration",
      name: "Employee Registration",
      description: "Register employees"
    },
    {
      id: "employees.view", 
      name: "View Employees",
      description: "View employee records"
    },
    {
      id: "employees.create",
      name: "Create Employees",
      description: "Register new employees"
    },
    {
      id: "employees.update",
      name: "Update Employees", 
      description: "Update employee information"
    },
    {
      id: "employees.delete",
      name: "Delete Employees",
      description: "Delete employee records"
    },
    {
      id: "geo.attendance.monitoring",
      name: "Geo Attendance Monitoring",
      description: "Monitor geo attendance"
    },
    {
      id: "attendance.master",
      name: "Attendance Master",
      description: "Manage attendance master"
    },
    {
      id: "attendance.view",
      name: "View Attendance",
      description: "View attendance records"
    },
    {
      id: "attendance.create",
      name: "Create Attendance",
      description: "Create attendance records"
    },
    {
      id: "attendance.update",
      name: "Update Attendance",
      description: "Update attendance records"
    },
    {
      id: "attendance.delete",
      name: "Delete Attendance",
      description: "Delete attendance records"
    },
    {
      id: "generate.salary.slip",
      name: "Generate Salary Slip",
      description: "Generate salary slips"
    },
    {
      id: "salary.view",
      name: "View Salary",
      description: "View salary information"
    },
    {
      id: "salary.create",
      name: "Create Salary",
      description: "Create salary records"
    },
    {
      id: "salary.update",
      name: "Update Salary",
      description: "Update salary information"
    },
    {
      id: "salary.delete",
      name: "Delete Salary",
      description: "Delete salary records"
    },
    {
      id: "shifts.management",
      name: "Shift Management",
      description: "Manage employee shifts"
    },
    {
      id: "overtime.management",
      name: "Overtime Management",
      description: "Manage overtime records"
    },
    {
      id: "daily.wage.management",
      name: "Daily Wage Management",
      description: "Manage daily wage workers"
    }
  ],
  "Finance & Accounts": [
    {
      id: "finance.management",
      name: "Finance Management Access",
      description: "Access to all finance modules"
    },
    {
      id: "dealer.ledger",
      name: "Dealer Ledger",
      description: "Manage dealer ledgers"
    },
    {
      id: "dealer_ledger.view",
      name: "View Dealer Ledger",
      description: "View dealer ledger entries"
    },
    {
      id: "dealer_ledger.create",
      name: "Create Dealer Ledger",
      description: "Create dealer ledger entries"
    },
    {
      id: "dealer_ledger.update",
      name: "Update Dealer Ledger",
      description: "Update dealer ledger entries"
    },
    {
      id: "dealer_ledger.delete",
      name: "Delete Dealer Ledger",
      description: "Delete dealer ledger entries"
    },
    {
      id: "supplier.ledger",
      name: "Supplier Ledger",
      description: "Manage supplier ledgers"
    },
    {
      id: "supplier_ledger.create",
      name: "Create Supplier Ledger",
      description: "Create supplier ledger entries"
    },
    {
      id: "supplier_ledger.read",
      name: "View Supplier Ledger",
      description: "View supplier ledger entries"
    },
    {
      id: "supplier_ledger.update",
      name: "Update Supplier Ledger",
      description: "Update supplier ledger entries"
    },
    {
      id: "supplier_ledger.delete",
      name: "Delete Supplier Ledger",
      description: "Delete supplier ledger entries"
    },
    {
      id: "cheque.management",
      name: "Cheque Management",
      description: "Manage cheques"
    },
    {
      id: "cheques.view",
      name: "View Cheques",
      description: "View cheque records"
    },
    {
      id: "cheques.create",
      name: "Create Cheques",
      description: "Create new cheque records"
    },
    {
      id: "cheques.update",
      name: "Update Cheques",
      description: "Update cheque information"
    },
    {
      id: "cheques.delete",
      name: "Delete Cheques",
      description: "Delete cheque records"
    },
    {
      id: "auto.reconciliation",
      name: "Auto Reconciliation",
      description: "Handle auto reconciliation"
    },
    {
      id: "reconciliation.read",
      name: "View Reconciliation",
      description: "View reconciliation data and reports"
    },
    {
      id: "reconciliation.create",
      name: "Create Reconciliation",
      description: "Perform reconciliation operations"
    },
    {
      id: "reconciliation.update",
      name: "Update Reconciliation",
      description: "Update reconciliation records"
    },
    {
      id: "reconciliation.delete",
      name: "Delete Reconciliation",
      description: "Delete reconciliation records"
    },
    {
      id: "cash.bank.book",
      name: "Cash & Bank Book",
      description: "Manage cash and bank book entries"
    },
    {
      id: "voucher.entry",
      name: "Voucher Entry",
      description: "Create and manage vouchers"
    },
    {
      id: "vouchers.view",
      name: "View Vouchers",
      description: "View voucher entries"
    },
    {
      id: "vouchers.create",
      name: "Create Vouchers",
      description: "Create new vouchers"
    },
    {
      id: "vouchers.update",
      name: "Update Vouchers",
      description: "Update voucher entries"
    },
    {
      id: "vouchers.delete",
      name: "Delete Vouchers",
      description: "Delete vouchers"
    },
    {
      id: "payment.allocation",
      name: "Payment Allocation",
      description: "Allocate payments to invoices"
    },
    {
      id: "bank.accounts",
      name: "Bank Account Master",
      description: "Manage bank accounts"
    },
    {
      id: "credit.days.management",
      name: "Credit Days Management",
      description: "Manage credit days for dealers"
    }
  ],
  "Reports & Logs": [
    {
      id: "reports.management",
      name: "Reports Management Access",
      description: "Access to all reports modules"
    },
    {
      id: "reports.read",
      name: "View Reports",
      description: "View all reports and analytics"
    },
    {
      id: "subadmin.activity.logs",
      name: "Subadmin Activity Logs",
      description: "View subadmin activity logs"
    },
    {
      id: "activity.logs",
      name: "Activity Logs",
      description: "View activity logs"
    },
    {
      id: "activity.logs.view",
      name: "View Activity Logs",
      description: "View system activity logs"
    },
    {
      id: "bill.wise.profit",
      name: "Bill-wise Profit",
      description: "View bill-wise profit reports"
    },
    {
      id: "category.product.gross.margin",
      name: "Category & Product Gross Margin",
      description: "View category and product gross margin reports"
    },
    {
      id: "sale.vs.purchase.price.deviation",
      name: "Sale vs Purchase Price Deviation",
      description: "View sale vs purchase price deviation reports"
    },
    {
      id: "download.logs",
      name: "Download Logs",
      description: "Download logs"
    },
    {
      id: "download_logs",
      name: "Download Logs Management",
      description: "Manage download logs"
    },
    {
      id: "download_logs.view",
      name: "View Download Logs",
      description: "View download activity logs"
    },
    {
      id: "dealer.performance",
      name: "Dealer Performance",
      description: "View dealer performance reports"
    },
    {
      id: "dealer_performance_read",
      name: "Dealer Performance Read",
      description: "Read dealer performance data"
    },
    {
      id: "dealer_performance_create",
      name: "Dealer Performance Create",
      description: "Create dealer performance records"
    },
    {
      id: "dealer_performance_update",
      name: "Dealer Performance Update",
      description: "Update dealer performance records"
    },
    {
      id: "dealer_performance_delete",
      name: "Dealer Performance Delete",
      description: "Delete dealer performance records"
    },
    {
      id: "marginAnalysis.read",
      name: "Margin Analysis Read",
      description: "View margin analysis reports"
    },
    {
      id: "marginAnalysis.create",
      name: "Margin Analysis Create", 
      description: "Create margin analysis reports"
    },
    {
      id: "marginAnalysis.update",
      name: "Margin Analysis Update",
      description: "Update margin analysis reports"
    },
    {
      id: "marginAnalysis.delete",
      name: "Margin Analysis Delete",
      description: "Delete margin analysis reports"
    }
  ],
  "Expense Management": [
    {
      id: "expense.management",
      name: "Expense Management Access",
      description: "Access to all expense modules"
    },
    {
      id: "expense.head.master",
      name: "Expense Head Master",
      description: "Manage expense head master"
    },
    {
      id: "expenses.view",
      name: "View Expenses",
      description: "View expense records"
    },
    {
      id: "expenses.create",
      name: "Create Expenses",
      description: "Create new expense records"
    },
    {
      id: "expenses.update",
      name: "Update Expenses",
      description: "Update expense records"
    },
    {
      id: "expenses.delete",
      name: "Delete Expenses",
      description: "Delete expense records"
    }
  ],
  "Support & Communication": [
    {
      id: "support.chat",
      name: "Support Chat",
      description: "Access to support chat system"
    },
    {
      id: "support.view",
      name: "View Support Tickets",
      description: "View support tickets and conversations"
    },
    {
      id: "support.create",
      name: "Create Support Tickets",
      description: "Create new support tickets"
    },
    {
      id: "support.respond",
      name: "Respond to Support",
      description: "Respond to support tickets"
    }
  ],
  "Sales Executive App": [
    {
      id: "sales.executive.app",
      name: "Sales Executive App Access",
      description: "Access to sales executive app features"
    },
    {
      id: "se.attendance.view",
      name: "Sales Executive Attendance View",
      description: "View sales executive attendance"
    },
    {
      id: "se.route.plan",
      name: "Sales Executive Route Plan",
      description: "Manage sales executive route plans"
    },
    {
      id: "se.dealer.insights",
      name: "Sales Executive Dealer Insights",
      description: "View dealer insights for sales executives"
    },
    {
      id: "se.product.recommendations",
      name: "Sales Executive Product Recommendations",
      description: "View product recommendations for sales executives"
    },
    {
      id: "se.collections.view",
      name: "Sales Executive Collections View",
      description: "View collections for sales executives"
    },
    {
      id: "se.targets.view",
      name: "Sales Executive Targets View",
      description: "View targets for sales executives"
    }
  ],
  "Delivery Executive App": [
    {
      id: "delivery.executive.app",
      name: "Delivery Executive App Access",
      description: "Access to delivery executive app features"
    },
    {
      id: "de.assignment.manage",
      name: "Delivery Assignment Management",
      description: "Manage delivery assignments"
    },
    {
      id: "de.monitoring.view",
      name: "Delivery Monitoring View",
      description: "View delivery monitoring"
    },
    {
      id: "de.deliveries.view",
      name: "My Deliveries View",
      description: "View my deliveries"
    },
    {
      id: "de.tracking.view",
      name: "Live Tracking View",
      description: "View live tracking"
    },
    {
      id: "de.route.view",
      name: "Route Plan View",
      description: "View route plans"
    },
    {
      id: "de.collections.view",
      name: "Delivery Collections View",
      description: "View delivery collections"
    },
    {
      id: "de.history.view",
      name: "Delivery History View",
      description: "View delivery history"
    }
  ]
};

export const AVAILABLE_REGIONS = [
  "Northern Region",
  "Southern Region", 
  "Eastern Region",
  "Western Region",
  "Central Region",
  "North-East Region",
  "Mumbai Metro",
  "Delhi NCR",
  "Bangalore Metro", 
  "Chennai Metro",
  "Pune Metro",
  "Hyderabad Metro"
];

// Default permissions for each role - EMPTY by default
export const ROLE_PERMISSIONS = {
  super_admin: ["*"], // Full access
  admin: [], // No permissions by default - must be assigned
  sub_admin: [],
  sales_manager: [],
  purchase_manager: [],
  finance_manager: [],
  hr_manager: [],
  sales_executive: [],
  warehouse_manager: [],
  inventory_manager: [],
  delivery_executive: []
};
