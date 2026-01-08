// config/permissions.js
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
      id: "dealer.specific.discounts",
      name: "Dealer-Specific Discounts",
      description: "View and Create discount mappings (Edit/Delete requires separate permissions)"
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
      id: "grn.entry",
      name: "GRN Entry",
      description: "Handle goods received note entry"
    },
    {
      id: "invoice",
      name: "Invoice",
      description: "Manage invoices"
    },
    {
      id: "credit.note",
      name: "Credit Note",
      description: "Manage credit notes"
    },
    {
      id: "debit.note",
      name: "Debit Note",
      description: "Manage debit notes"
    },
    {
      id: "payment",
      name: "Payment Management",
      description: "Manage payments (supplier and dealer)"
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
      name: "Stock",
      description: "Manage stock"
    },
    {
      id: "stock.transfer",
      name: "Stock Transfer",
      description: "Manage stock transfers"
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
      id: "generate.salary.slip",
      name: "Generate Salary Slip",
      description: "Generate salary slips"
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
    }
  ],
  "Support & Communication": [
    {
      id: "support.chat",
      name: "Support Chat",
      description: "Access to support chat system"
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
  inventory_manager: []
};