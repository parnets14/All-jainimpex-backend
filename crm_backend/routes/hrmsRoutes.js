import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { enforceRoutePermissions } from '../middleware/routePermissions.js';
import {
  getSettings, updateSettings,
  getLeavePolicy, updateLeavePolicy,
  getLeaveBalances, adjustLeaveBalance, triggerAccrual,
  getAlerts, markAlertRead, markAttendanceDay, getWorkingTimeReport,
} from '../controllers/hrmsController.js';
import {
  createLoan, listLoans, getLoan, cancelLoan,
} from '../controllers/loanAdvanceController.js';
import {
  getHolidays, createHoliday, updateHoliday, deleteHoliday,
} from '../controllers/holidayController.js';

const router = express.Router();
router.use(protect);
router.use(attachCompanyDB);
router.use(enforceRoutePermissions);

// HRMS settings (OT / late / lunch / alert)
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

// Leave policy
router.get('/leave-policy', getLeavePolicy);
router.put('/leave-policy', updateLeavePolicy);

// Leave balances
router.get('/leave-balances', getLeaveBalances);
router.post('/leave-balances/adjust', adjustLeaveBalance);
router.post('/leave-balances/run-accrual', triggerAccrual);

// Loans & advances (Point 4)
router.get('/loans', listLoans);
router.post('/loans', createLoan);
router.get('/loans/:id', getLoan);
router.patch('/loans/:id/cancel', cancelLoan);

// Company holiday calendar (paid non-working days)
router.get('/holidays', getHolidays);
router.post('/holidays', createHoliday);
router.put('/holidays/:id', updateHoliday);
router.delete('/holidays/:id', deleteHoliday);

// No-punch alerts + admin day-marking (Point 8)
router.get('/alerts', getAlerts);
router.patch('/alerts/:id/read', markAlertRead);
router.post('/attendance/mark-day', markAttendanceDay);

// Working-time report (Point 10)
router.get('/working-time', getWorkingTimeReport);

export default router;
