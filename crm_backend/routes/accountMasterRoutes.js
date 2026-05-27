import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';
import { getAccounts, createAccount, updateAccount, deleteAccount } from '../controllers/accountMasterController.js';

const router = express.Router();
router.use(protect);
router.use(attachCompanyDB);

router.get('/', logActivity("Account Master", "Viewed accounts list", "READ"), getAccounts);
router.post('/', logActivity("Account Master", "Created new account", "CREATE"), createAccount);
router.put('/:id', logActivity("Account Master", "Updated account", "UPDATE"), updateAccount);
router.delete('/:id', logActivity("Account Master", "Deleted account", "DELETE"), deleteAccount);

export default router;
