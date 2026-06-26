// middleware/routePermissions.js
// Centralized route-to-permission mapping.
// Applied as a global middleware AFTER protect (auth) — checks that the
// authenticated user actually has permission for the route they're hitting.
//
// super_admin bypasses all checks. Other roles need the mapped permission
// (exact match, wildcard *, or module-level module.*).

const userHasPermission = (userPermissions, requiredPermission) => {
  if (!userPermissions || !Array.isArray(userPermissions)) return false;
  if (userPermissions.includes('*')) return true;
  if (userPermissions.includes(requiredPermission)) return true;
  const module = requiredPermission.split('.')[0];
  if (userPermissions.includes(`${module}.*`)) return true;
  if (userPermissions.includes(module)) return true;
  return false;
};

// Map: route prefix (after /api/) → required permission string
// Uses the SAME permission IDs as the frontend ProtectedRoute so they stay in sync.
const ROUTE_PERMISSION_MAP = {
  // Master Management
  'products': 'product.master',
  'brands': 'product.master',
  'categories': 'category.setup',
  'subcategories': 'category.setup',
  'extended-subcategories': 'category.setup',
  'dealers': 'dealer.master',
  'dealer-categories': 'dealer.category',
  'dealer-types': 'dealer.type',
  'suppliers': 'supplier.master',
  'regions': 'region.master',
  'routes': 'route.master',
  'warehouses': 'warehouseMaster',
  'employees': 'employee.registration',

  // Sales & Purchase
  'sales-orders': 'sales.order.dashboard',
  'dealer-invoices': 'invoice',
  'supplier-invoices': 'invoice',
  'purchase-orders': 'po.management',
  'grn': 'grn.entry',
  'discount-mappings': 'dealer.specific.discounts',
  'dealer-pricing': 'product.master',
  'purchase-discounts': 'po.management',
  'credit-notes': 'credit.note',
  'debit-notes': 'debit.note',
  'supplier-payments': 'payment',
  'dealer-payments': 'payment',
  'collections': 'payment',
  'payment-allocations': 'finance.management',
  'points': 'purchasing.points',
  'dealer-order-requests': 'sales.order.dashboard',

  // Finance & Accounts
  'vouchers': 'finance.management',
  'journal-vouchers': 'finance.management',
  'account-master': 'finance.management',
  'bank-accounts': 'finance.management',
  'bank-reconciliation': 'finance.management',
  'dealer-ledger': 'dealer.ledger',
  'supplier-ledger': 'supplier.ledger',
  'cheques': 'cheque.management',
  'reconciliation': 'auto.reconciliation',
  'cash-flow': 'finance.management',
  'balance-sheet': 'finance.management',
  'trial-balance': 'finance.management',
  'financial-reports': 'finance.management',
  'tds': 'finance.management',
  'capital': 'finance.management',
  'loans': 'finance.management',
  'fixed-assets': 'finance.management',
  'year-end': 'finance.management',
  'gst-reports': 'finance.management',

  // Inventory
  'stock': 'stock',
  'stock-adjustments': 'stock',

  // HRMS
  'attendance': 'attendance.master',
  'hrms': 'attendance.master',
  'salary': 'salary.management',
  'claims': 'expense.claims',
  'claim-types': 'expense.claims',

  // Expense
  'expenses': 'expense.management',
  'expense-categories': 'expense.category',
  'expense-types': 'expense.management',

  // Reports
  'activity-logs': 'reports.activityLogs',
  'download-logs': 'reports.activityLogs',
  'audit-trail': 'super.admin',
  'aging-report': 'reports.agingReport',
  'dealer-performance': 'reports.dealerPerformance',
  'profit-analysis': 'reports.profitAnalysis',
  'margin-analysis': 'marginAnalysis.read',
  'sales-analytics': 'reports.salesAnalytics',

  // System
  'users': 'user.management',
  'notifications': null, // all authenticated users can receive notifications
  'app-settings': 'system.management',

  // Support
  'chat': 'support.chat',
};

/**
 * Global permission enforcement middleware.
 * Mount AFTER protect middleware on the app level.
 * Skips: auth routes, public routes, and super_admin users.
 */
export const enforceRoutePermissions = (req, res, next) => {
  // Skip for unauthenticated requests (protect middleware handles that)
  if (!req.user) return next();

  // Super admin bypasses everything
  if (req.user.role === 'super_admin') return next();

  // Extract the first path segment after /api/
  const pathAfterApi = req.originalUrl.replace(/^\/api\//, '').split('/')[0].split('?')[0];

  // Look up required permission
  const requiredPermission = ROUTE_PERMISSION_MAP[pathAfterApi];

  // If no mapping exists (null or undefined), allow access (route is either
  // public, auth-only, or not yet mapped — fail-open for backward compat)
  if (!requiredPermission) return next();

  // Check permission
  if (!userHasPermission(req.user.permissions, requiredPermission)) {
    return res.status(403).json({
      success: false,
      message: `Access denied. You don't have permission for this action. Required: ${requiredPermission}`
    });
  }

  next();
};

export default enforceRoutePermissions;
