import express from 'express';
import * as bankAccountController from '../controllers/bankAccountController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);
router.use(attachCompanyDB);

// Cash Account routes
router.get('/cash-account', bankAccountController.getCashAccount);
router.put('/cash-account', bankAccountController.updateCashAccount);

// Bank Account routes
router.get('/', bankAccountController.getBankAccounts);
router.post('/', bankAccountController.createBankAccount);
router.get('/:id', bankAccountController.getBankAccountById);
router.put('/:id', bankAccountController.updateBankAccount);
router.delete('/:id', bankAccountController.deleteBankAccount);

export default router;
