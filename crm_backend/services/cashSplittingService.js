import { generateVoucherNumber } from './voucherNumberService.js';
import Voucher from '../models/Voucher.js';

// Cash limit per day as per government regulations
// Section 269ST: No person shall receive ₹20,000 or more in cash
// We use ₹10,000 for conservative compliance
const CASH_LIMIT_PER_DAY = 10000;

/**
 * Find available dates for cash splits (avoiding duplicates)
 * @param {Date} endDate - End date (voucher date)
 * @param {Number} numberOfSplits - Number of splits needed
 * @param {Number} frequency - Days between splits (1, 2, or 3)
 * @param {String} direction - 'forward' or 'backward'
 * @returns {Promise<Array>} Array of available dates
 */
const findAvailableCashDates = async (endDate, numberOfSplits, frequency = 1, direction = 'backward') => {
  const availableDates = [];
  let currentDate = new Date(endDate);
  let attempts = 0;
  const maxAttempts = numberOfSplits * 10; // Prevent infinite loops
  
  console.log(`🔍 Finding ${numberOfSplits} available dates from ${currentDate.toDateString()}, direction: ${direction}, frequency: ${frequency}`);
  
  while (availableDates.length < numberOfSplits && attempts < maxAttempts) {
    attempts++;
    
    // Check if this date already has a cash voucher
    const startOfDay = new Date(currentDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(currentDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    const existingCashVoucher = await Voucher.findOne({
      transactionMode: 'Cash',
      voucherDate: {
        $gte: startOfDay,
        $lte: endOfDay
      },
      status: { $ne: 'Cancelled' }
    });
    
    if (!existingCashVoucher) {
      availableDates.push(new Date(currentDate));
      console.log(`  ✓ ${currentDate.toDateString()} - Available`);
    } else {
      console.log(`  ⚠ ${currentDate.toDateString()} - Conflict (${existingCashVoucher.voucherNumber})`);
    }
    
    // Move to next date based on direction and frequency
    if (direction === 'backward') {
      currentDate.setDate(currentDate.getDate() - frequency);
    } else {
      currentDate.setDate(currentDate.getDate() + frequency);
    }
  }
  
  if (availableDates.length < numberOfSplits) {
    console.warn(`⚠️ Could only find ${availableDates.length} available dates out of ${numberOfSplits} needed`);
  }
  
  // Sort dates in ascending order
  availableDates.sort((a, b) => a - b);
  
  return availableDates;
};

/**
 * Split cash payment across multiple days for compliance
 * @param {Object} voucherData - Original voucher data
 * @param {Number} totalAmount - Total cash amount
 * @param {Date} endDate - End date (voucher date)
 * @param {Object} options - Split options
 * @returns {Promise<Array>} Array of split voucher data
 */
const splitCashPayment = async (voucherData, totalAmount, endDate, options = {}) => {
  const {
    frequency = 1,
    direction = 'backward',
    checkDuplicates = true
  } = options;
  // If amount is within limit, no splitting needed
  if (totalAmount <= CASH_LIMIT_PER_DAY) {
    return [voucherData];
  }
  
  const totalSplits = Math.ceil(totalAmount / CASH_LIMIT_PER_DAY);
  
  console.log(`💰 Splitting ₹${totalAmount.toLocaleString()} into ${totalSplits} parts (${direction}, ${frequency}-day frequency)`);
  
  // Find available dates
  let splitDates;
  if (checkDuplicates) {
    splitDates = await findAvailableCashDates(endDate, totalSplits, frequency, direction);
    if (splitDates.length < totalSplits) {
      throw new Error(`Could not find ${totalSplits} available dates. Only ${splitDates.length} dates available. Please choose different dates or frequency.`);
    }
  } else {
    // Generate dates without checking duplicates
    splitDates = [];
    let currentDate = new Date(endDate);
    for (let i = 0; i < totalSplits; i++) {
      splitDates.push(new Date(currentDate));
      if (direction === 'backward') {
        currentDate.setDate(currentDate.getDate() - frequency);
      } else {
        currentDate.setDate(currentDate.getDate() + frequency);
      }
    }
    splitDates.sort((a, b) => a - b);
  }
  
  const splits = [];
  let remainingAmount = totalAmount;
  
  // Generate parent voucher number
  const parentVoucherNumber = await generateVoucherNumber(
    voucherData.voucherType,
    endDate
  );
  
  for (let i = 0; i < splitDates.length && remainingAmount > 0; i++) {
    const splitAmount = Math.min(remainingAmount, CASH_LIMIT_PER_DAY);
    const splitSequence = i + 1;
    const splitDate = splitDates[i];
    
    // Create split voucher data
    const splitVoucher = {
      ...voucherData,
      voucherNumber: splitSequence === 1 
        ? parentVoucherNumber 
        : `${parentVoucherNumber}-${splitSequence}`,
      voucherDate: new Date(splitDate),
      totalAmount: splitAmount,
      allocatedAmount: 0,
      unallocatedAmount: splitAmount,
      isCashSplit: true,
      parentVoucherId: splitSequence === 1 ? null : undefined,
      splitSequence,
      totalSplits,
      originalAmount: totalAmount,
      splitDirection: direction,
      splitFrequency: frequency,
      hasConflicts: checkDuplicates && splitDates.length < totalSplits,
      splitReason: `Cash limit compliance (₹${CASH_LIMIT_PER_DAY.toLocaleString()}/day) - Split ${splitSequence} of ${totalSplits} [${direction}, ${frequency}-day interval]`,
      narration: `${voucherData.narration || ''} [Auto-split ${splitSequence}/${totalSplits}]`.trim()
    };
    
    splits.push(splitVoucher);
    
    console.log(`  Split ${splitSequence}: ₹${splitAmount.toLocaleString()} on ${splitDate.toDateString()}`);
    
    remainingAmount -= splitAmount;
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
 * @param {Date} endDate - End date
 * @param {Object} options - Preview options
 * @returns {Array} Preview of splits
 */
const getSplitPreview = (amount, endDate = new Date(), options = {}) => {
  const {
    frequency = 1,
    direction = 'backward',
    skipWeekends = false
  } = options;
  
  if (amount <= CASH_LIMIT_PER_DAY) {
    return [{
      date: endDate,
      amount: amount,
      sequence: 1,
      total: 1,
      isWeekend: false
    }];
  }
  
  const preview = [];
  let remainingAmount = amount;
  let currentDate = new Date(endDate);
  let sequence = 1;
  const totalSplits = Math.ceil(amount / CASH_LIMIT_PER_DAY);
  
  while (remainingAmount > 0 && sequence <= totalSplits) {
    // Skip weekends if requested
    if (skipWeekends) {
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        if (direction === 'backward') {
          currentDate.setDate(currentDate.getDate() - 1);
        } else {
          currentDate.setDate(currentDate.getDate() + 1);
        }
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
    
    // Move to next date
    if (direction === 'backward') {
      currentDate.setDate(currentDate.getDate() - frequency);
    } else {
      currentDate.setDate(currentDate.getDate() + frequency);
    }
    sequence++;
  }
  
  // Sort by date ascending
  preview.sort((a, b) => a.date - b.date);
  
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
  validateCashTransaction,
  findAvailableCashDates
};
