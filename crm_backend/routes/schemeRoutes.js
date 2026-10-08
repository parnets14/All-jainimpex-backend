/**
 * Scheme Routes — slab-based offer / scheme engine for dealers.
 *
 * Mounted at /api/schemes
 *
 * IMPORTANT: static path segments must be declared BEFORE '/:id'
 * or Express will match them as an :id parameter.
 */

import express from 'express';
import {
  // Scheme master CRUD
  getSchemes,
  getScheme,
  createScheme,
  updateScheme,
  deleteScheme,
  checkSchemeCode,
  getSchemeStats,
  // Advisory preview (used by Sales Order screen)
  previewSchemes,
  // Progress buckets (dealer × scheme × window)
  getSchemeProgress,
  getSchemeDealerReport,
  // Entitlements (detected rewards awaiting manual processing)
  getSchemeEntitlements,
  editEntitlement,
  rejectEntitlement,
  processEntitlement,
  // Reports
  getSchemeReport,
  getSchemeFilterOptions,
} from '../controllers/schemeController.js';

import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';
import { requireAnyPermission } from '../middleware/routePermissions.js';

const router = express.Router();

router.use(protect);
router.use(attachCompanyDB);

const VIEW = requireAnyPermission(['schemes.view', 'schemes.manage', 'purchasing.points']);
const MANAGE = requireAnyPermission(['schemes.manage', 'purchasing.points']);
const PROCESS = requireAnyPermission(['schemes.process', 'schemes.manage', 'purchasing.points']);

/* ------------------------------------------------------------------ *
 * Static utilities — MUST come before '/:id'
 * ------------------------------------------------------------------ */

router.get('/check-code',
  VIEW,
  logActivity('Schemes', 'Checked scheme code availability', 'READ'),
  checkSchemeCode);

router.get('/stats',
  VIEW,
  logActivity('Schemes', 'Viewed scheme statistics', 'READ'),
  getSchemeStats);

router.get('/filter-options',
  VIEW,
  logActivity('Schemes', 'Viewed scheme filter options', 'READ'),
  getSchemeFilterOptions);

/* ------------------------------------------------------------------ *
 * Advisory preview — called from the Sales Order screen after
 * products are selected. Never writes anything.
 * ------------------------------------------------------------------ */

router.post('/preview',
  VIEW,
  logActivity('Schemes', 'Previewed applicable schemes', 'READ'),
  previewSchemes);

/* ------------------------------------------------------------------ *
 * Progress buckets — dealer × scheme × window accumulation
 * ------------------------------------------------------------------ */

router.get('/progress',
  VIEW,
  logActivity('Schemes', 'Viewed scheme progress', 'READ'),
  getSchemeProgress);

/* ------------------------------------------------------------------ *
 * Entitlements — rewards detected by the engine, processed manually
 * from the new module. Editable before processing.
 * ------------------------------------------------------------------ */

router.get('/entitlements',
  VIEW,
  logActivity('Schemes', 'Viewed scheme entitlements', 'READ'),
  getSchemeEntitlements);

router.patch('/entitlements/:id',
  PROCESS,
  logActivity('Schemes', 'Edited scheme entitlement', 'UPDATE'),
  editEntitlement);

router.post('/entitlements/:id/reject',
  PROCESS,
  logActivity('Schemes', 'Rejected scheme entitlement', 'UPDATE'),
  rejectEntitlement);

router.post('/entitlements/:id/process',
  PROCESS,
  logActivity('Schemes', 'Processed scheme entitlement', 'UPDATE'),
  processEntitlement);

/* ------------------------------------------------------------------ *
 * Reports
 * ------------------------------------------------------------------ */

router.get('/reports/summary',
  VIEW,
  logActivity('Schemes', 'Viewed scheme report summary', 'READ'),
  getSchemeReport);

/* ------------------------------------------------------------------ *
 * Scheme master CRUD
 * ------------------------------------------------------------------ */

router.get('/',
  VIEW,
  logActivity('Schemes', 'Viewed schemes', 'READ'),
  getSchemes);

router.post('/',
  MANAGE,
  logActivity('Schemes', 'Created scheme', 'CREATE'),
  createScheme);

router.get('/:id/report',
  VIEW,
  logActivity('Schemes', 'Viewed scheme dealer report', 'READ'),
  getSchemeDealerReport);

router.get('/:id',
  VIEW,
  logActivity('Schemes', 'Viewed scheme', 'READ'),
  getScheme);

router.put('/:id',
  MANAGE,
  logActivity('Schemes', 'Updated scheme', 'UPDATE'),
  updateScheme);

router.delete('/:id',
  MANAGE,
  logActivity('Schemes', 'Deleted scheme', 'DELETE'),
  deleteScheme);

export default router;
