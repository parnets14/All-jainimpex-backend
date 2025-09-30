export const AVAILABLE_PERMISSIONS = {
  "Master Management": [
    {
      id: "product.master",
      name: "Product Master",
      description: "Manage product master data"
    },
    {
      id: "dealer.master",
      name: "Dealer Master",
      description: "Manage dealer master data"
    },
    {
      id: "supplier.master",
      name: "Supplier Master",
      description: "Manage supplier master data"
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
    }
  ],
  "Sales & Purchase Management": [
    {
      id: "sales.order.dashboard",
      name: "Sales Order Dashboard",
      description: "Access sales order dashboard"
    },
    {
      id: "dealer.specific.discounts",
      name: "Dealer-Specific Discounts",
      description: "Manage dealer-specific discounts"
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
    }
  ],
  "Inventory & Warehouse Control": [
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
      id: "employee.registration",
      name: "Employee Registration",
      description: "Register employees"
    },
    {
      id: "employees.create",
      name: "Create Employees",
      description: "Register new employees"
    },
    {
      id: "employees.view", 
      name: "View Employees",
      description: "View employee records"
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
      id: "cheque.management",
      name: "Cheque Management",
      description: "Manage cheques"
    },
    {
      id: "auto.reconciliation",
      name: "Auto Reconciliation",
      description: "Handle auto reconciliation"
    }
  ],
  "Reports & Logs": [
    {
      id: "subadmin.activity.logs",
      name: "Subadmin Activity Logs",
      description: "View subadmin activity logs"
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
      id: "dealer.performance",
      name: "Dealer Performance",
      description: "View dealer performance reports"
    }
  ],
  "Expense Management": [
    {
      id: "expense.head.master",
      name: "Expense Head Master",
      description: "Manage expense head master"
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

// Default permissions for each role
export const ROLE_PERMISSIONS = {
  super_admin: ["*"],
  admin: [
    "dashboard.view",
    "masters.view",
    "products.manage",
    "categories.manage",
    "dealers.manage",
    "suppliers.manage",
    "sales.view",
    "sales.dispatch",
    "purchase.view",
    "purchase.manage",
    "finance.view",
    "reports.view",
    "employees.create",
    "employees.view",
    "employees.update", 
    "employees.delete"
  ],
  sub_admin: [
    "dashboard.view",
    "dealers.manage",
    "sales.view",
    "finance.customers",
    "reports.view",
    "employees.view"
  ],
  sales_manager: [
    "dashboard.view",
    "dealers.manage",
    "sales.view",
    "sales.dispatch",
    "discounts.manage",
    "finance.customers",
    "reports.view",
    "employees.view"
  ],
  purchase_manager: [
    "dashboard.view",
    "suppliers.manage",
    "purchase.view",
    "purchase.manage",
    "inventory.receive",
    "suppliers.incentives",
    "finance.suppliers",
    "reports.view",
    "employees.view"
  ],
  finance_manager: [
    "dashboard.view",
    "finance.view",
    "finance.customers",
    "finance.suppliers",
    "reports.view",
    "employees.view"
  ],
  hr_manager: [
    "dashboard.view",
    "employees.manage",
    "employees.create",
    "employees.view",
    "employees.update",
    "employees.delete",
    "hrms.manage",
    "reports.view"
  ],
  sales_executive: [
    "dashboard.view",
    "dealers.manage",
    "sales.view",
    "employees.view"
  ],
  warehouse_manager: [
    "dashboard.view",
    "inventory.receive",
    "reports.view",
    "employees.view"
  ],
  inventory_manager: [
    "dashboard.view",
    "inventory.receive",
    "reports.view",
    "employees.view"
  ]
};