import { voucherSchema } from '../models/Voucher.js';
import { paymentAllocationSchema } from '../models/PaymentAllocation.js';
import { accountingSequenceSchema } from '../models/AccountingSequence.js';

/**
 * Get financial year based on date.
 * Financial year in India runs from April 1 to March 31.
 */
const getFinancialYear = (date = new Date()) => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return month >= 4
    ? `${year}-${String(year + 1).slice(2)}`
    : `${year - 1}-${String(year).slice(2)}`;
};

const applySession = (query, session) => (session ? query.session(session) : query);

const reserveSequence = async ({
  dbConnection,
  key,
  getInitialValue,
}) => {
  const AccountingSequence = dbConnection.models.AccountingSequence
    || dbConnection.model('AccountingSequence', accountingSequenceSchema);
  const initialValue = await getInitialValue();

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const counter = await AccountingSequence.findOneAndUpdate(
        { _id: key },
        [{
          $set: {
            value: { $add: [{ $ifNull: ['$value', initialValue] }, 1] },
            updatedAt: '$$NOW',
            createdAt: { $ifNull: ['$createdAt', '$$NOW'] },
          },
        }],
        { new: true, upsert: true }
      );
      if (!counter) throw new Error(`Could not reserve accounting sequence ${key}`);
      return counter.value;
    } catch (error) {
      if (error?.code === 11000 && attempt < 5) continue;
      throw error;
    }
  }
  throw new Error(`Could not reserve accounting sequence ${key}`);
};

const extractSequence = (number) => {
  const parts = String(number || '').split('-');
  const sequence = Number.parseInt(parts[3], 10);
  return Number.isFinite(sequence) ? sequence : 0;
};

/**
 * Sequence reservation is intentionally independent of caller transactions.
 * A failed posting can leave a harmless gap, but concurrent writers cannot
 * receive the same number and joined transactions never need number retries.
 */
const generateVoucherNumber = async (
  voucherType,
  date = new Date(),
  dbConnection = null,
  session = null
) => {
  if (!dbConnection) throw new Error('dbConnection is required for generateVoucherNumber');

  const Voucher = dbConnection.models.Voucher || dbConnection.model('Voucher', voucherSchema);
  const fy = getFinancialYear(date);
  const prefixes = {
    Receipt: 'RV',
    Payment: 'PV',
    Contra: 'CV',
    Journal: 'JV',
  };
  const prefix = prefixes[voucherType] || 'V';
  const key = `voucher:${prefix}:${fy}`;

  const sequence = await reserveSequence({
    dbConnection,
    key,
    session,
    getInitialValue: async () => {
      let query = Voucher.findOne({
        voucherType,
        financialYear: fy,
        voucherNumber: { $regex: `^${prefix}-${fy}-` },
      }).sort({ voucherNumber: -1 });
      query = applySession(query, session);
      const lastVoucher = await query;
      return extractSequence(lastVoucher?.voucherNumber);
    },
  });

  return `${prefix}-${fy}-${String(sequence).padStart(4, '0')}`;
};

/** Atomically reserve a Payment Allocation number. */
const generateAllocationNumber = async (
  date = new Date(),
  dbConnection = null,
  session = null
) => {
  if (!dbConnection) throw new Error('dbConnection is required for generateAllocationNumber');

  const PaymentAllocation = dbConnection.models.PaymentAllocation
    || dbConnection.model('PaymentAllocation', paymentAllocationSchema);
  const fy = getFinancialYear(date);
  const prefix = 'PA';
  const key = `allocation:${fy}`;

  const sequence = await reserveSequence({
    dbConnection,
    key,
    session,
    getInitialValue: async () => {
      let query = PaymentAllocation.findOne({
        allocationNumber: { $regex: `^${prefix}-${fy}-` },
      }).sort({ allocationNumber: -1 });
      query = applySession(query, session);
      const lastAllocation = await query;
      return extractSequence(lastAllocation?.allocationNumber);
    },
  });

  return `${prefix}-${fy}-${String(sequence).padStart(4, '0')}`;
};

const validateVoucherNumber = (voucherNumber) => (
  /^(RV|PV|CV|JV)-\d{4}-\d{2}-\d{4}(-\d+)?$/.test(voucherNumber)
);

const parseVoucherNumber = (voucherNumber) => {
  const parts = voucherNumber.split('-');
  if (parts.length < 4) return null;
  return {
    prefix: parts[0],
    year1: parts[1],
    year2: parts[2],
    sequence: parts[3],
    splitSequence: parts[4] ? Number.parseInt(parts[4], 10) : null,
    financialYear: `${parts[1]}-${parts[2]}`,
  };
};

export {
  getFinancialYear,
  generateVoucherNumber,
  generateAllocationNumber,
  validateVoucherNumber,
  parseVoucherNumber,
};
