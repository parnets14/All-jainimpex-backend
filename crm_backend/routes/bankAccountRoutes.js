import express from 'express';
import * as bankAccountController from '../controllers/bankAccountController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);
router.use(attachCompanyDB);

// Cash Account routes
router.get('/cash-account', logActivity("Bank Account", "Viewed cash account", "READ"), bankAccountController.getCashAccount);
router.put('/cash-account', logActivity("Bank Account", "Updated cash account", "UPDATE"), bankAccountController.updateCashAccount);

// Bank Account routes
router.get('/', logActivity("Bank Account", "Viewed bank accounts list", "READ"), bankAccountController.getBankAccounts);
router.post('/', logActivity("Bank Account", "Created new bank account", "CREATE"), bankAccountController.createBankAccount);
router.get('/:id', logActivity("Bank Account", "Viewed bank account details", "READ"), bankAccountController.getBankAccountById);
router.put('/:id', logActivity("Bank Account", "Updated bank account", "UPDATE"), bankAccountController.updateBankAccount);
router.delete('/:id', logActivity("Bank Account", "Deleted bank account", "DELETE"), bankAccountController.deleteBankAccount);

export default router;
