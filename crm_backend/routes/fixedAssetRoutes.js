import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';
import {
  getFixedAssets,
  createFixedAsset,
  updateFixedAsset,
  deleteFixedAsset,
  previewDepreciation,
  runDepreciation,
} from '../controllers/fixedAssetController.js';

const router = express.Router();

router.use(protect);
router.use(attachCompanyDB);

// Depreciation (declare before /:id to avoid conflicts)
router.get('/depreciation/preview', logActivity('Fixed Assets', 'Previewed depreciation', 'READ'), previewDepreciation);
router.post('/depreciation/run', logActivity('Fixed Assets', 'Posted depreciation', 'CREATE'), runDepreciation);

router.route('/')
  .get(logActivity('Fixed Assets', 'Viewed fixed assets list', 'READ'), getFixedAssets)
  .post(logActivity('Fixed Assets', 'Created new fixed asset', 'CREATE'), createFixedAsset);

router.route('/:id')
  .put(logActivity('Fixed Assets', 'Updated fixed asset', 'UPDATE'), updateFixedAsset)
  .delete(logActivity('Fixed Assets', 'Deleted fixed asset', 'DELETE'), deleteFixedAsset);

export default router;
