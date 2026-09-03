// middleware/routePermissions.js
// Centralized route-to-permission mapping.
// Mapped CRM routes are authenticated here before their permission is checked.
// Feature routers may call protect again; authMiddleware reuses the authenticated
// request so the user is not loaded from the database twice.
//
// super_admin bypasses all checks. Other roles need the mapped permission
// (exact match, wildcard *, or module-level module.*).

import { protect } from './authMiddleware.js';

export const userHasPermission = (userPermissions, requiredPermission) => {
  if (Array.isArray(requiredPermission)) {
    return requiredPermission.some((permission) => userHasPermission(userPermissions, permission));
  }
  if (!userPermissions || !Array.isArray(userPermissions)) return false;
  if (userPermissions.includes('*')) return true;
  if (userPermissions.includes(requiredPermission)) return true;
  const module = requiredPermission.split('.')[0];
  if (userPermissions.includes(`${module}.*`)) return true;
  if (userPermissions.includes(module)) return true;
  return false;
};

export const requireAnyPermission = (requiredPermissions) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route. Please login.'
    });
  }

  if (req.user.role === 'super_admin'
    || userHasPermission(req.user.permissions, requiredPermissions)) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: `Access denied. Required permission: ${requiredPermissions.join(' or ')}`
  });
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
  'sales-orders': [
    'sales.order.dashboard',
    'sales.orders.view',
    'sales.orders.create',
    'sales.orders.update',
    'sales.orders.delete',
    'sales.orders.approve'
  ],
  'dealer-invoices': [
    'invoice',
    'invoices.view',
    'invoices.create',
    'invoices.update',
    'invoices.approve',
    'invoices.delete',
    'invoices.cancel'
  ],
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
  'attendance': ['attendance.master', 'geo.attendance.monitoring'],
  'absent-review': 'attendance.master',
  'salary-breakdown': 'salary.management',
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
  'users': ['user.management', 'users.manage'],
  'notifications': null, // all authenticated users can receive notifications
  'app-settings': 'system.management',

  // Sales Executive App — protected by its own SE middleware, not CRM permissions
  'se': null,

  // Delivery Executive App — protected by its own DE middleware, not CRM permissions
  'de': null,

  // Support
  'chat': 'support.chat',
};

/**
 * Global permission enforcement middleware.
 *
 * Mapped CRM routes are authenticated here before authorization. Prefixes with
 * no permission mapping continue to their own public, dealer-app, SE, or DE
 * authentication middleware for backward compatibility.
 */
export const enforceRoutePermissions = (req, res, next) => {
  // Extract the first path segment after /api/ before deciding whether this
  // request belongs to the centralized CRM permission system.
  const pathAfterApi = req.originalUrl.replace(/^\/api\//, '').split('/')[0].split('?')[0];
  const requiredPermission = ROUTE_PERMISSION_MAP[pathAfterApi];

  // Null and unmapped prefixes are intentionally handled by their own routers.
  if (!requiredPermission) return next();

  const authorize = () => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route. Please login.'
      });
    }

    // Super admin bypasses permission checks after authentication.
    if (req.user.role === 'super_admin') return next();

    if (!userHasPermission(req.user.permissions, requiredPermission)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. You don't have permission for this action. Required: ${requiredPermission}`
      });
    }

    return next();
  };

  // Feature routers authenticate later in the middleware chain, so mapped
  // routes must establish req.user here instead of silently skipping checks.
  if (!req.user) {
    return protect(req, res, authorize);
  }

  return authorize();
};

export default enforceRoutePermissions;
