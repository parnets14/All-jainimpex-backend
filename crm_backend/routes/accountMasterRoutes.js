import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';
import { getAccounts, getAccountTree, createAccount, updateAccount, deleteAccount } from '../controllers/accountMasterController.js';

const router = express.Router();
router.use(protect);
router.use(attachCompanyDB);

// Declared before '/:id' so the literal path is not captured as an id
router.get('/tree', logActivity("Account Master", "Viewed account tree", "READ"), getAccountTree);

router.get('/', logActivity("Account Master", "Viewed accounts list", "READ"), getAccounts);
router.post('/', logActivity("Account Master", "Created new account", "CREATE"), createAccount);
router.put('/:id', logActivity("Account Master", "Updated account", "UPDATE"), updateAccount);
router.delete('/:id', logActivity("Account Master", "Deleted account", "DELETE"), deleteAccount);

export default router;
