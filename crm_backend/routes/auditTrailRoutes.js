import express from 'express';
import { getAuditTrail, getDocumentAuditTrail } from '../controllers/auditTrailController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';

const router = express.Router();

router.use(protect);
router.use(attachCompanyDB);

// Read-only audit trail (append-only log; no create/update/delete endpoints)
router.get('/', getAuditTrail);
router.get('/:entity/:entityId', getDocumentAuditTrail);

export default router;
