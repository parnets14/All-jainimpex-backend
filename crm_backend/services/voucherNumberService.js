import { voucherSchema } from '../models/Voucher.js';
import { paymentAllocationSchema } from '../models/PaymentAllocation.js';

/**
 * Get financial year based on date
 * Financial year in India: April 1 to March 31
 * @param {Date} date - Date to calculate financial year for
 * @returns {String} Financial year in format "2025-26"
 */
const getFinancialYear = (date = new Date()) => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 0-indexed, so add 1
  
  // If month is April (4) or later, FY is current year to next year
  // If month is before April, FY is previous year to current year
  if (month >= 4) {
    return `${year}-${(year + 1).toString().substr(2)}`;
  } else {
    return `${year - 1}-${year.toString().substr(2)}`;
  }
};

/**
 * Generate unique voucher number
 * Format: PREFIX-FY-SEQUENCE
 * Example: RV-2025-26-0001
 * 
 * @param {String} voucherType - Type of voucher (Receipt, Payment, Contra, Journal)
 * @param {Date} date - Date for the voucher
 * @param {Object} dbConnection - Database connection for multi-company support
 * @returns {Promise<String>} Generated voucher number
 */
const generateVoucherNumber = async (voucherType, date = new Date(), dbConnection = null) => {
  if (!dbConnection) {
    throw new Error('dbConnection is required for generateVoucherNumber');
  }
  
  const Voucher = dbConnection.models.Voucher || dbConnection.model('Voucher', voucherSchema);
  
  const fy = getFinancialYear(date);
  
  // Prefix based on voucher type
  const prefixes = {
    'Receipt': 'RV',
    'Payment': 'PV',
    'Contra': 'CV',
    'Journal': 'JV'
  };
  
  const prefix = prefixes[voucherType] || 'V';
  
  // Find last voucher number for this type and FY
  const lastVoucher = await Voucher.findOne({
    voucherType,
    financialYear: fy,
    voucherNumber: { $regex: `^${prefix}-${fy}-` }
  }).sort({ voucherNumber: -1 });
  
  let sequence = 1;
  if (lastVoucher && lastVoucher.voucherNumber) {
    // Extract sequence number from last voucher
    // Format: RV-2025-26-0001
    const parts = lastVoucher.voucherNumber.split('-');
    if (parts.length >= 4) {
      const lastSequence = parseInt(parts[3]);
      if (!isNaN(lastSequence)) {
        sequence = lastSequence + 1;
      }
    }
  }
  
  // Generate voucher number and check for duplicates (race condition protection)
  let voucherNumber;
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    voucherNumber = `${prefix}-${fy}-${sequence.toString().padStart(4, '0')}`;
    
    // Check if this number already exists
    const existing = await Voucher.findOne({ voucherNumber });
    if (!existing) {
      // Number is unique, we can use it
      break;
    }
    
    // Number exists, increment and try again
    console.warn(`⚠️ Voucher number ${voucherNumber} already exists, trying next sequence`);
    sequence++;
    attempts++;
  }
  
  if (attempts >= maxAttempts) {
    throw new Error(`Failed to generate unique voucher number after ${maxAttempts} attempts`);
  }
  
  return voucherNumber;
};

/**
 * Generate allocation number
 * Format: PA-FY-SEQUENCE
 * Example: PA-2025-26-0001
 * 
 * @param {Date} date - Date for the allocation
 * @param {Object} dbConnection - Database connection for multi-company support
 * @returns {Promise<String>} Generated allocation number
 */
const generateAllocationNumber = async (date = new Date(), dbConnection = null) => {
  if (!dbConnection) {
    throw new Error('dbConnection is required for generateAllocationNumber');
  }
  
  const PaymentAllocation = dbConnection.models.PaymentAllocation || dbConnection.model('PaymentAllocation', paymentAllocationSchema);
  
  const fy = getFinancialYear(date);
  const prefix = 'PA';
  
  // Find last allocation number for this FY
  const lastAllocation = await PaymentAllocation.findOne({
    allocationNumber: { $regex: `^${prefix}-${fy}-` }
  }).sort({ allocationNumber: -1 });
  
  let sequence = 1;
  if (lastAllocation && lastAllocation.allocationNumber) {
    const parts = lastAllocation.allocationNumber.split('-');
    if (parts.length >= 4) {
      const lastSequence = parseInt(parts[3]);
      if (!isNaN(lastSequence)) {
        sequence = lastSequence + 1;
      }
    }
  }
  
  const allocationNumber = `${prefix}-${fy}-${sequence.toString().padStart(4, '0')}`;
  
  return allocationNumber;
};

/**
 * Validate voucher number format
 * @param {String} voucherNumber - Voucher number to validate
 * @returns {Boolean} True if valid format
 */
const validateVoucherNumber = (voucherNumber) => {
  // Format: PREFIX-YYYY-YY-NNNN
  const pattern = /^(RV|PV|CV|JV)-\d{4}-\d{2}-\d{4}(-\d+)?$/;
  return pattern.test(voucherNumber);
};

/**
 * Parse voucher number to extract components
 * @param {String} voucherNumber - Voucher number to parse
 * @returns {Object} Parsed components
 */
const parseVoucherNumber = (voucherNumber) => {
  const parts = voucherNumber.split('-');
  
  if (parts.length < 4) {
    return null;
  }
  
  return {
    prefix: parts[0],
    year1: parts[1],
    year2: parts[2],
    sequence: parts[3],
    splitSequence: parts[4] ? parseInt(parts[4]) : null,
    financialYear: `${parts[1]}-${parts[2]}`
  };
};

export {
  getFinancialYear,
  generateVoucherNumber,
  generateAllocationNumber,
  validateVoucherNumber,
  parseVoucherNumber
};
