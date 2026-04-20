import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { getAccounts, createAccount, updateAccount, deleteAccount } from '../controllers/accountMasterController.js';

const router = express.Router();
router.use(protect);
router.use(attachCompanyDB);

router.get('/', getAccounts);
router.post('/', createAccount);
router.put('/:id', updateAccount);
router.delete('/:id', deleteAccount);

export default router;
