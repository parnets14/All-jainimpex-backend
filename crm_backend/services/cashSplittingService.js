import { generateVoucherNumber } from './voucherNumberService.js';

// Cash limit per day as per government regulations
// Section 269ST: No person shall receive ₹20,000 or more in cash
// We use ₹10,000 for conservative compliance
const CASH_LIMIT_PER_DAY = 10000;

/**
 * Split cash payment across multiple days for compliance
 * @param {Object} voucherData - Original voucher data
 * @param {Number} totalAmount - Total cash amount
 * @param {Date} startDate - Starting date
 * @returns {Promise<Array>} Array of split voucher data
 */
const splitCashPayment = async (voucherData, totalAmount, startDate) => {
  // If amount is within limit, no splitting needed
  if (totalAmount <= CASH_LIMIT_PER_DAY) {
    return [voucherData];
  }
  
  const splits = [];
  let remainingAmount = totalAmount;
  let currentDate = new Date(startDate);
  let splitSequence = 1;
  const totalSplits = Math.ceil(totalAmount / CASH_LIMIT_PER_DAY);
  
  // Generate parent voucher number
  const parentVoucherNumber = await generateVoucherNumber(
    voucherData.voucherType,
    startDate
  );
  
  console.log(`💰 Splitting ₹${totalAmount.toLocaleString()} into ${totalSplits} parts`);
  
  while (remainingAmount > 0) {
    const splitAmount = Math.min(remainingAmount, CASH_LIMIT_PER_DAY);
    
    // Create split voucher data
    const splitVoucher = {
      ...voucherData,
      voucherNumber: splitSequence === 1 
        ? parentVoucherNumber 
        : `${parentVoucherNumber}-${splitSequence}`,
      voucherDate: new Date(currentDate),
      totalAmount: splitAmount,
      allocatedAmount: 0,
      unallocatedAmount: splitAmount,
      isCashSplit: true,
      parentVoucherId: splitSequence === 1 ? null : undefined, // Will be set after parent is created
      splitSequence,
      totalSplits,
      originalAmount: totalAmount,
      splitReason: `Cash limit compliance (₹${CASH_LIMIT_PER_DAY.toLocaleString()}/day) - Split ${splitSequence} of ${totalSplits}`,
      narration: `${voucherData.narration || ''} [Auto-split ${splitSequence}/${totalSplits} for compliance]`.trim()
    };
    
    splits.push(splitVoucher);
    
    console.log(`  Split ${splitSequence}: ₹${splitAmount.toLocaleString()} on ${currentDate.toDateString()}`);
    
    remainingAmount -= splitAmount;
    currentDate.setDate(currentDate.getDate() + 1);
    splitSequence++;
  }
  
  return splits;
};

/**
 * Check if cash splitting is required
 * @param {String} transactionMode - Payment mode
 * @param {Number} amount - Transaction amount
 * @returns {Boolean}
 */
const requiresCashSplitting = (transactionMode, amount) => {
  return transactionMode === 'Cash' && amount > CASH_LIMIT_PER_DAY;
};

/**
 * Get split preview for UI (without creating vouchers)
 * @param {Number} amount - Total amount
 * @param {Date} startDate - Starting date
 * @param {Boolean} skipWeekends - Skip Saturdays and Sundays
 * @returns {Array} Preview of splits
 */
const getSplitPreview = (amount, startDate = new Date(), skipWeekends = false) => {
  if (amount <= CASH_LIMIT_PER_DAY) {
    return [{
      date: startDate,
      amount: amount,
      sequence: 1,
      total: 1,
      isWeekend: false
    }];
  }
  
  const preview = [];
  let remainingAmount = amount;
  let currentDate = new Date(startDate);
  let sequence = 1;
  const totalSplits = Math.ceil(amount / CASH_LIMIT_PER_DAY);
  
  while (remainingAmount > 0) {
    // Skip weekends if requested
    if (skipWeekends) {
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) { // Sunday = 0, Saturday = 6
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }
    }
    
    const splitAmount = Math.min(remainingAmount, CASH_LIMIT_PER_DAY);
    const dayOfWeek = currentDate.getDay();
    
    preview.push({
      date: new Date(currentDate),
      dateString: currentDate.toLocaleDateString('en-IN'),
      amount: splitAmount,
      sequence,
      total: totalSplits,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek]
    });
    
    remainingAmount -= splitAmount;
    currentDate.setDate(currentDate.getDate() + 1);
    sequence++;
  }
  
  return preview;
};

/**
 * Calculate total days required for cash payment
 * @param {Number} amount - Total amount
 * @returns {Number} Number of days required
 */
const calculateDaysRequired = (amount) => {
  return Math.ceil(amount / CASH_LIMIT_PER_DAY);
};

/**
 * Get compliance message for cash payment
 * @param {Number} amount - Total amount
 * @returns {String} Compliance message
 */
const getComplianceMessage = (amount) => {
  if (amount <= CASH_LIMIT_PER_DAY) {
    return `Amount ₹${amount.toLocaleString()} is within daily cash limit. No splitting required.`;
  }
  
  const days = calculateDaysRequired(amount);
  return `Amount ₹${amount.toLocaleString()} exceeds daily cash limit of ₹${CASH_LIMIT_PER_DAY.toLocaleString()}. Will be automatically split across ${days} days for compliance with Section 269ST.`;
};

/**
 * Validate cash transaction amount
 * @param {Number} amount - Amount to validate
 * @param {String} transactionMode - Transaction mode
 * @returns {Object} Validation result
 */
const validateCashTransaction = (amount, transactionMode) => {
  if (transactionMode !== 'Cash') {
    return {
      valid: true,
      requiresSplit: false,
      message: 'Non-cash transaction, no limit applicable'
    };
  }
  
  if (amount <= 0) {
    return {
      valid: false,
      requiresSplit: false,
      message: 'Amount must be greater than zero'
    };
  }
  
  if (amount <= CASH_LIMIT_PER_DAY) {
    return {
      valid: true,
      requiresSplit: false,
      message: 'Amount within daily limit'
    };
  }
  
  return {
    valid: true,
    requiresSplit: true,
    message: getComplianceMessage(amount),
    daysRequired: calculateDaysRequired(amount)
  };
};

export {
  CASH_LIMIT_PER_DAY,
  splitCashPayment,
  requiresCashSplitting,
  getSplitPreview,
  calculateDaysRequired,
  getComplianceMessage,
  validateCashTransaction
};
