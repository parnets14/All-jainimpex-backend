// services/periodLockService.js
// Financial-year period locking.
//
// Once a financial year is "Closed" (see FinancialYearClosing), no financial
// document dated inside that period may be created, edited, cancelled or
// deleted. Only a super-admin reopening the year unlocks it.
//
// Centralised here so every controller enforces the SAME rule consistently.

import { financialYearClosingSchema } from '../models/FinancialYearClosing.js';

const getModels = (dbConnection) => {
  return {
    FinancialYearClosing:
      dbConnection.models.FinancialYearClosing ||
      dbConnection.model('FinancialYearClosing', financialYearClosingSchema),
  };
};

/**
 * Error thrown when a write is attempted in a closed period.
 * Controllers can detect it via `err.name === 'PeriodLockedError'`
 * (or `err.isPeriodLocked === true`) and respond with HTTP 423.
 */
export class PeriodLockedError extends Error {
  constructor(message, financialYear) {
    super(message);
    this.name = 'PeriodLockedError';
    this.isPeriodLocked = true;
    this.statusCode = 423;
    this.financialYear = financialYear || null;
  }
}

/**
 * Normalise a value to a Date. Returns null for falsy/invalid input.
 */
const toDate = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Find the Closed financial-year record (if any) that contains `date`.
 * @returns {Promise<Object|null>} the closing record or null
 */
export const findClosedPeriodForDate = async (dbConnection, date) => {
  if (!dbConnection) return null;
  const target = toDate(date);
  if (!target) return null;

  const { FinancialYearClosing } = getModels(dbConnection);
  return FinancialYearClosing.findOne({
    status: 'Closed',
    fyStartDate: { $lte: target },
    fyEndDate: { $gte: target },
  }).lean();
};

/**
 * @returns {Promise<boolean>} true if `date` falls in a closed period
 */
export const isPeriodLocked = async (dbConnection, date) => {
  const closed = await findClosedPeriodForDate(dbConnection, date);
  return !!closed;
};

/**
 * Throw a PeriodLockedError if `date` falls inside a closed financial year.
 * Use this in create/update/cancel/delete of financial documents.
 *
 * @param {Object} dbConnection - company DB connection (req.dbConnection)
 * @param {Date|string} date - the transaction date of the document
 * @param {string} [label='transaction'] - friendly name for the message
 */
export const assertPeriodOpen = async (dbConnection, date, label = 'transaction') => {
  const closed = await findClosedPeriodForDate(dbConnection, date);
  if (closed) {
    throw new PeriodLockedError(
      `Financial year ${closed.financialYear} is closed. This ${label} (dated ${toDate(date).toLocaleDateString('en-IN')}) cannot be added or modified. Ask a super-admin to reopen the year first.`,
      closed.financialYear
    );
  }
};

/**
 * List all closed periods (for the frontend to disable closed dates).
 */
export const getClosedPeriods = async (dbConnection) => {
  if (!dbConnection) return [];
  const { FinancialYearClosing } = getModels(dbConnection);
  return FinancialYearClosing.find({ status: 'Closed' })
    .select('financialYear fyStartDate fyEndDate')
    .sort({ fyEndDate: -1 })
    .lean();
};

/**
 * Express-style helper: send a 423 response if the error is a period lock,
 * otherwise return false so the caller can handle it normally.
 * @returns {boolean} true if it handled (sent) the response
 */
export const handlePeriodLockError = (error, res) => {
  if (error && error.isPeriodLocked) {
    res.status(423).json({
      success: false,
      code: 'PERIOD_LOCKED',
      financialYear: error.financialYear,
      message: error.message,
    });
    return true;
  }
  return false;
};

export default {
  PeriodLockedError,
  assertPeriodOpen,
  isPeriodLocked,
  findClosedPeriodForDate,
  getClosedPeriods,
  handlePeriodLockError,
};
