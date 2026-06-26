import { loanAdvanceSchema } from '../models/LoanAdvance.js';
import { employeeSchema } from '../models/Employee.js';

const getModels = (conn) => ({
  LoanAdvance: conn.models.LoanAdvance || conn.model('LoanAdvance', loanAdvanceSchema),
  Employee: conn.models.Employee || conn.model('Employee', employeeSchema),
});

// add N months to a 'YYYY-MM' string
const addMonths = (ym, n) => {
  const [y, m] = ym.split('-').map((x) => parseInt(x, 10));
  const d = new Date(y, (m - 1) + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const round2 = (v) => parseFloat(Number(v || 0).toFixed(2));

// Build EMI/one-time figures + schedule
export const computeLoan = ({ type, principal, interestRate = 0, months = 1, startMonth }) => {
  const P = Number(principal) || 0;
  const n = type === 'emi' ? Math.max(1, parseInt(months, 10) || 1) : 1;
  // Simple flat interest (annual %): interest = P * rate% * (months/12)
  const interest = interestRate > 0 ? round2(P * (interestRate / 100) * (n / 12)) : 0;
  const totalPayable = round2(P + interest);
  const emiAmount = round2(totalPayable / n);

  const schedule = [];
  let remaining = totalPayable;
  for (let i = 0; i < n; i++) {
    const amt = i === n - 1 ? round2(remaining) : emiAmount; // last installment clears rounding
    schedule.push({ month: addMonths(startMonth, i), amount: amt, paid: false });
    remaining = round2(remaining - amt);
  }
  return { emiAmount, totalPayable, balance: totalPayable, schedule };
};

// POST /api/hrms/loans  — create a loan/advance
export const createLoan = async (req, res) => {
  try {
    const { LoanAdvance, Employee } = getModels(req.dbConnection);
    const { employee, type = 'one-time', principal, interestRate = 0, months = 1, startMonth, reason = '' } = req.body;

    if (!employee || !principal || !startMonth) {
      return res.status(400).json({ success: false, message: 'employee, principal and startMonth are required' });
    }
    const emp = await Employee.findById(employee).select('_id');
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });

    const computed = computeLoan({ type, principal, interestRate, months, startMonth });
    const loan = await LoanAdvance.create({
      employee, type, principal, interestRate,
      months: type === 'emi' ? months : 1,
      startMonth, reason,
      ...computed,
      recovered: 0,
      status: 'active',
      createdBy: req.user?._id,
    });
    res.status(201).json({ success: true, loan, message: 'Loan/advance created' });
  } catch (e) {
    console.error('createLoan error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /api/hrms/loans?employee=&status=
export const listLoans = async (req, res) => {
  try {
    const { LoanAdvance } = getModels(req.dbConnection);
    const filter = {};
    if (req.query.employee) filter.employee = req.query.employee;
    if (req.query.status) filter.status = req.query.status;
    const loans = await LoanAdvance.find(filter)
      .populate('employee', 'name empId designation department')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, loans });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /api/hrms/loans/:id
export const getLoan = async (req, res) => {
  try {
    const { LoanAdvance } = getModels(req.dbConnection);
    const loan = await LoanAdvance.findById(req.params.id)
      .populate('employee', 'name empId designation department').lean();
    if (!loan) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, loan });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// PATCH /api/hrms/loans/:id/cancel
export const cancelLoan = async (req, res) => {
  try {
    const { LoanAdvance } = getModels(req.dbConnection);
    const loan = await LoanAdvance.findByIdAndUpdate(
      req.params.id, { $set: { status: 'cancelled' } }, { new: true }
    );
    if (!loan) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, loan, message: 'Loan cancelled' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Used by the salary engine: the installment due for an employee in a given month.
// Returns { loanId, amount } list and does NOT mark paid (salary finalization does).
export const getDueInstallments = async (conn, employeeId, monthKey) => {
  const { LoanAdvance } = getModels(conn);
  const loans = await LoanAdvance.find({ employee: employeeId, status: 'active' });
  const due = [];
  for (const loan of loans) {
    const inst = (loan.schedule || []).find((s) => s.month === monthKey && !s.paid);
    if (inst && inst.amount > 0) due.push({ loanId: loan._id, amount: inst.amount });
  }
  return due;
};

// Mark an installment paid + update recovered/balance/status (called on salary finalize).
export const markInstallmentPaid = async (conn, loanId, monthKey) => {
  const { LoanAdvance } = getModels(conn);
  const loan = await LoanAdvance.findById(loanId);
  if (!loan) return;
  const inst = (loan.schedule || []).find((s) => s.month === monthKey && !s.paid);
  if (!inst) return;
  inst.paid = true;
  inst.paidOn = new Date();
  loan.recovered = round2(loan.recovered + inst.amount);
  loan.balance = round2(Math.max(0, loan.totalPayable - loan.recovered));
  if (loan.balance <= 0) loan.status = 'closed';
  loan.markModified('schedule');
  await loan.save();
};
