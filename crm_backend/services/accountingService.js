// services/accountingService.js
// Automatic Accounting Entry Service
// Creates journal entries automatically for business transactions

import { randomUUID } from 'node:crypto';
import { journalVoucherSchema } from '../models/JournalVoucher.js';
import { accountMasterSchema } from '../models/AccountMaster.js';
import { serviceChargeMasterSchema } from '../models/ServiceChargeMaster.js';

const getModels = (dbConnection) => {
  return {
    JournalVoucher: dbConnection.models.JournalVoucher || dbConnection.model('JournalVoucher', journalVoucherSchema),
    AccountMaster: dbConnection.models.AccountMaster || dbConnection.model('AccountMaster', accountMasterSchema),
    // Required by the service-charge posting blocks below. Without this entry the
    // destructure yields undefined and `.findById` throws on the first charge.
    ServiceChargeMaster: dbConnection.models.ServiceChargeMaster || dbConnection.model('ServiceChargeMaster', serviceChargeMasterSchema)
  };
};

/**
 * Get or create system account by name
 */
const getSystemAccount = async (accountName, dbConnection, { session, throwOnError = false } = {}) => {
  const { AccountMaster } = getModels(dbConnection);
  const applySession = (query) => session ? query.session(session) : query;

  // Try to find by name and system flag first
  let account = await applySession(AccountMaster.findOne({ accountName, isSystem: true }));
  
  // If not found with system flag, try without it (for older accounts)
  if (!account) {
    account = await applySession(AccountMaster.findOne({ accountName }));
  }
  
  if (!account) {
    const error = new Error(`Required system account "${accountName}" was not found`);
    if (throwOnError) throw error;
    console.warn(`⚠️ ${error.message}. Please ensure default accounts are seeded.`);
  }
  
  return account;
};

/**
 * Generate journal voucher number
 */
const generateJournalNumber = async () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `JV-${year}${month}-${randomUUID().replaceAll('-', '').toUpperCase()}`;
};

/**
 * Create automatic journal entry for Dealer Invoice
 * Debit: Sundry Debtors
 * Credit: Sales Account
 * Credit: GST Payable (if GST applicable)
 */
export const createDealerInvoiceEntry = async (
  invoice,
  dbConnection,
  userId,
  { session, throwOnError = false } = {}
) => {
  try {
    const { JournalVoucher } = getModels(dbConnection);
    const postingKey = `dealer-invoice:${invoice._id}:original`;
    let existingQuery = JournalVoucher.findOne({ postingKey });
    if (session) existingQuery = existingQuery.session(session);
    const existing = await existingQuery;
    if (existing) return existing;

    const rawTotalAmount = Number(invoice.totalAmount);
    const rawGstAmount = Number(invoice.gstAmount ?? invoice.totalGst ?? 0);
    if (!Number.isFinite(rawTotalAmount) || rawTotalAmount <= 0
      || !Number.isFinite(rawGstAmount) || rawGstAmount < 0 || rawGstAmount > rawTotalAmount) {
      throw new Error('Dealer invoice contains invalid total/GST amounts');
    }
    const totalInMinorUnits = Math.round(rawTotalAmount * 100);
    const gstInMinorUnits = Math.round(rawGstAmount * 100);
    if (gstInMinorUnits > totalInMinorUnits) {
      throw new Error('Dealer invoice GST cannot exceed its rounded total');
    }
    
    // Service charges — each charge is amount + tax, so serviceChargesTotal is GST-inclusive
    const serviceChargesSubtotal = invoice.serviceChargesSubtotal || 0;
    const serviceChargesTax = invoice.serviceChargesTax || 0;
    const serviceChargesTotal = invoice.serviceChargesTotal || 0;

    const totalAmount = totalInMinorUnits / 100;
    const gstAmount = invoice.totalGst || 0;
    const productGst = gstAmount;

    // Every amount on this invoice is MRP-based, i.e. GST-INCLUSIVE, and
    // invoice.totalAmount already contains the service charges. The GST is posted
    // separately to GST Payable below, so the revenue line must be net of GST.
    // Crediting Sales with the GST-inclusive amount *as well* counted the GST twice
    // and left the voucher out of balance by exactly the GST amount — which is why
    // the JournalVoucher validator rejected it.
    const productInclGst = totalAmount - serviceChargesTotal;
    const salesAmount = productInclGst - productGst;
    
    const debtorsAccount = await getSystemAccount('Sundry Debtors', dbConnection, { session, throwOnError: true });
    const salesAccount = await getSystemAccount('Sales Account', dbConnection, { session, throwOnError: true });
    const gstPayableAccount = gstAmount > 0 || serviceChargesTax > 0
      ? await getSystemAccount('GST Payable', dbConnection, { session, throwOnError: true })
      : null;

    const entries = [
      {
        accountId: debtorsAccount._id,
        accountName: debtorsAccount.accountName,
        accountGroup: debtorsAccount.accountGroup,
        debit: totalAmount,
        credit: 0,
        narration: `Sales to ${invoice.dealerName || 'Dealer'} - Invoice ${invoice.invoiceNumber}`
      },
      {
        accountId: salesAccount._id,
        accountName: salesAccount.accountName,
        accountGroup: salesAccount.accountGroup,
        debit: 0,
        credit: salesAmount,
        narration: `Net sales - Invoice ${invoice.invoiceNumber}`
      }
    ];
    
    // Add product GST entry
    if (gstAmount > 0) {
      entries.push({
        accountId: gstPayableAccount._id,
        accountName: gstPayableAccount.accountName,
        accountGroup: gstPayableAccount.accountGroup,
        debit: 0,
        credit: gstAmount,
        narration: `Output GST on products - Invoice ${invoice.invoiceNumber}`
      });
    }
    
    // Add service charge entries
    if (invoice.serviceCharges && invoice.serviceCharges.length > 0) {
      const { ServiceChargeMaster } = getModels(dbConnection);
      
      for (const charge of invoice.serviceCharges) {
        // Get service charge master to find account
        let serviceAccount;
        if (charge.serviceChargeId) {
          const chargeMaster = await ServiceChargeMaster.findById(charge.serviceChargeId).session(session);
          if (chargeMaster && chargeMaster.accountId) {
            const { AccountMaster } = getModels(dbConnection);
            serviceAccount = await AccountMaster.findById(chargeMaster.accountId).session(session);
          }
        }
        
        // Fallback to default Service Income account
        if (!serviceAccount) {
          serviceAccount = await getSystemAccount('Service Income', dbConnection, { session, throwOnError: false });
          if (!serviceAccount) {
            // Create default Service Income account if it doesn't exist
            const { AccountMaster } = getModels(dbConnection);
            serviceAccount = new AccountMaster({
              accountName: 'Service Income',
              accountGroup: 'Indirect Income',
              accountType: 'Income',
              openingBalance: 0,
              openingBalanceType: 'Cr',
              createdBy: userId
            });
            await serviceAccount.save({ session });
          }
        }
        
        // Post service charge amount (excluding tax)
        entries.push({
          accountId: serviceAccount._id,
          accountName: serviceAccount.accountName,
          accountGroup: serviceAccount.accountGroup,
          debit: 0,
          credit: charge.amount,
          narration: `${charge.chargeName} - Invoice ${invoice.invoiceNumber}`
        });
        
        // Post service charge GST if applicable
        if (charge.taxAmount > 0 && gstPayableAccount) {
          entries.push({
            accountId: gstPayableAccount._id,
            accountName: gstPayableAccount.accountName,
            accountGroup: gstPayableAccount.accountGroup,
            debit: 0,
            credit: charge.taxAmount,
            narration: `GST on ${charge.chargeName} - Invoice ${invoice.invoiceNumber}`
          });
        }
      }
    }

    const voucherNumber = await generateJournalNumber(dbConnection, { session });
    const journalVoucher = new JournalVoucher({
      voucherNumber,
      voucherDate: invoice.invoiceDate || new Date(),
      voucherType: 'Sales',
      referenceType: 'DealerInvoice',
      referenceId: invoice._id,
      referenceNumber: invoice.invoiceNumber,
      postingKey,
      entries,
      totalDebit: totalAmount,
      totalCredit: totalAmount,
      totalAmount,
      narration: `Automatic entry for Dealer Invoice ${invoice.invoiceNumber}`,
      isAutoGenerated: true,
      createdBy: userId
    });
    await journalVoucher.save({ session });
    return journalVoucher;
  } catch (error) {
    console.error('❌ Error creating dealer invoice journal entry:', error);
    if (throwOnError) throw error;
    return null;
  }
};

export const reverseDealerInvoiceEntry = async (
  invoice,
  dbConnection,
  userId,
  reason,
  { session, throwOnError = false, reversalDate = new Date() } = {}
) => {
  try {
    const effectiveReversalDate = new Date(reversalDate);
    if (Number.isNaN(effectiveReversalDate.getTime())) {
      throw new Error('Dealer invoice reversal date is invalid');
    }
    const { JournalVoucher } = getModels(dbConnection);
    let originalQuery = JournalVoucher.findOne({
      $or: [
        { postingKey: `dealer-invoice:${invoice._id}:original` },
        { referenceType: 'DealerInvoice', referenceId: invoice._id, isAutoGenerated: true }
      ]
    });
    if (session) originalQuery = originalQuery.session(session);
    const original = await originalQuery;
    if (!original) throw new Error(`Journal entry for invoice ${invoice.invoiceNumber} was not found`);
    if (original.reversedBy) {
      let replayQuery = JournalVoucher.findById(original.reversedBy);
      if (session) replayQuery = replayQuery.session(session);
      return replayQuery;
    }

    const postingKey = `dealer-invoice:${invoice._id}:reversal`;
    const voucherNumber = await generateJournalNumber(dbConnection, { session });
    const reversal = new JournalVoucher({
      voucherNumber,
      voucherDate: effectiveReversalDate,
      voucherType: 'Sales',
      referenceType: 'DealerInvoice',
      referenceId: invoice._id,
      referenceNumber: invoice.invoiceNumber,
      postingKey,
      reversalOf: original._id,
      entries: original.entries.map((line) => ({
        accountId: line.accountId,
        accountName: line.accountName,
        accountGroup: line.accountGroup,
        debit: Number(line.credit || 0),
        credit: Number(line.debit || 0),
        narration: `Reversal: ${line.narration || invoice.invoiceNumber}`
      })),
      totalDebit: original.totalCredit,
      totalCredit: original.totalDebit,
      totalAmount: original.totalAmount || original.totalDebit,
      narration: `Cancellation of Dealer Invoice ${invoice.invoiceNumber}: ${reason || 'No reason provided'}`,
      isAutoGenerated: true,
      createdBy: userId
    });
    await reversal.save({ session });
    original.reversedBy = reversal._id;
    await original.save({ session });
    return reversal;
  } catch (error) {
    console.error('❌ Error reversing dealer invoice journal entry:', error);
    if (throwOnError) throw error;
    return null;
  }
};

/**
 * Create automatic journal entry for Supplier Invoice
 * Debit: Purchase Account
 * Debit: GST Input Credit (if GST applicable)
 * Debit: Service Expense accounts (for each service charge)
 * Credit: Sundry Creditors
 */
export const createSupplierInvoiceEntry = async (invoice, dbConnection, userId) => {
  try {
    const { JournalVoucher } = getModels(dbConnection);
    
    console.log(`📝 Creating automatic journal entry for Supplier Invoice: ${invoice.invoiceNumber}`);
    
    // Get system accounts
    const creditorsAccount = await getSystemAccount('Sundry Creditors', dbConnection);
    const purchaseAccount = await getSystemAccount('Purchase Account', dbConnection);
    const gstInputAccount = await getSystemAccount('GST Input Credit', dbConnection);
    
    if (!creditorsAccount || !purchaseAccount) {
      console.error('❌ Required system accounts not found');
      return null;
    }
    
    const entries = [];
    
    // Handle both gstAmount and totalGst field names (embedded GST, reverse-calculated)
    const productGst = invoice.gstAmount || invoice.totalGst || 0;

    // Use supplier billed total if available (what we actually owe), otherwise our calculated total
    const invoiceTotal = invoice.supplierBilledTotal || invoice.totalAmount || 0;
    
    // Product amounts: invoiceTotal includes product + service charges + all taxes
    // Calculate product portion
    const productSubtotal = invoice.subtotal || 0;
    const productDiscount = invoice.totalDiscount || 0;
    const productAfterDiscount = productSubtotal - productDiscount;
    
    // Service charges
    const serviceChargesSubtotal = invoice.serviceChargesSubtotal || 0;
    const serviceChargesTax = invoice.serviceChargesTax || 0;

    // Debit: Purchase Account (base value, EXCLUDING the embedded GST).
    // productAfterDiscount is GST-inclusive, so the embedded GST must come out here —
    // it is debited separately to GST Input Credit below. Debiting the inclusive
    // amount double-counted the tax and left the voucher out of balance.
    entries.push({
      accountId: purchaseAccount._id,
      accountName: purchaseAccount.accountName,
      accountGroup: purchaseAccount.accountGroup,
      debit: productAfterDiscount - productGst,
      credit: 0,
      narration: `Purchase from ${invoice.supplierName || 'Supplier'} - Invoice ${invoice.invoiceNumber}`
    });
    
    // Debit: GST Input Credit (Product GST Amount)
    if (productGst && productGst > 0 && gstInputAccount) {
      entries.push({
        accountId: gstInputAccount._id,
        accountName: gstInputAccount.accountName,
        accountGroup: gstInputAccount.accountGroup,
        debit: productGst,
        credit: 0,
        narration: `GST on Purchase - Invoice ${invoice.invoiceNumber}`
      });
    }
    
    // Add service charge entries
    if (invoice.serviceCharges && invoice.serviceCharges.length > 0) {
      const { ServiceChargeMaster } = getModels(dbConnection);
      
      for (const charge of invoice.serviceCharges) {
        // Get service charge master to find account
        let serviceAccount;
        if (charge.serviceChargeId) {
          const chargeMaster = await ServiceChargeMaster.findById(charge.serviceChargeId);
          if (chargeMaster && chargeMaster.accountId) {
            const { AccountMaster } = getModels(dbConnection);
            serviceAccount = await AccountMaster.findById(chargeMaster.accountId);
          }
        }
        
        // Fallback to default Service Expense account
        if (!serviceAccount) {
          serviceAccount = await getSystemAccount('Service Expense', dbConnection);
          if (!serviceAccount) {
            // Create default Service Expense account if it doesn't exist
            const { AccountMaster } = getModels(dbConnection);
            serviceAccount = new AccountMaster({
              accountName: 'Service Expense',
              accountGroup: 'Direct Expenses',
              accountType: 'Expense',
              openingBalance: 0,
              openingBalanceType: 'Dr',
              createdBy: userId
            });
            await serviceAccount.save();
          }
        }
        
        // Debit: Service Expense account (amount excluding tax)
        entries.push({
          accountId: serviceAccount._id,
          accountName: serviceAccount.accountName,
          accountGroup: serviceAccount.accountGroup,
          debit: charge.amount,
          credit: 0,
          narration: `${charge.chargeName} from ${invoice.supplierName} - Invoice ${invoice.invoiceNumber}`
        });
        
        // Debit: GST Input Credit for service charge tax
        if (charge.taxAmount > 0 && gstInputAccount) {
          entries.push({
            accountId: gstInputAccount._id,
            accountName: gstInputAccount.accountName,
            accountGroup: gstInputAccount.accountGroup,
            debit: charge.taxAmount,
            credit: 0,
            narration: `GST on ${charge.chargeName} - Invoice ${invoice.invoiceNumber}`
          });
        }
      }
    }
    
    // Credit: Sundry Creditors (Total Amount including GST and service charges)
    entries.push({
      accountId: creditorsAccount._id,
      accountName: creditorsAccount.accountName,
      accountGroup: creditorsAccount.accountGroup,
      debit: 0,
      credit: invoiceTotal,
      narration: `Purchase from ${invoice.supplierName || 'Supplier'} - Invoice ${invoice.invoiceNumber}`
    });
    
    const voucherNumber = await generateJournalNumber(dbConnection);
    
    const journalVoucher = await JournalVoucher.create({
      voucherNumber,
      voucherDate: invoice.invoiceDate || new Date(),
      voucherType: 'Purchase',
      referenceType: 'SupplierInvoice',
      referenceId: invoice._id,
      referenceNumber: invoice.invoiceNumber,
      entries,
      totalDebit: invoiceTotal,
      totalCredit: invoiceTotal,
      narration: `Automatic entry for Supplier Invoice ${invoice.invoiceNumber}`,
      isAutoGenerated: true,
      createdBy: userId
    });
    
    console.log(`✅ Journal entry created: ${voucherNumber}`);
    return journalVoucher;
    
  } catch (error) {
    console.error('❌ Error creating supplier invoice journal entry:', error);
    return null;
  }
};

/**
 * Create automatic journal entry for Dealer Payment (Receipt)
 * Debit: Bank/Cash Account
 * Credit: Sundry Debtors
 */
export const createDealerPaymentEntry = async (payment, dbConnection, userId) => {
  try {
    const { JournalVoucher } = getModels(dbConnection);
    
    console.log(`📝 Creating automatic journal entry for Dealer Payment: ${payment.paymentNumber}`);
    
    // Get system accounts
    const debtorsAccount = await getSystemAccount('Sundry Debtors', dbConnection);
    const cashAccount = await getSystemAccount('Cash Account', dbConnection);
    const bankAccount = await getSystemAccount('Bank Account', dbConnection);
    
    if (!debtorsAccount || (!cashAccount && !bankAccount)) {
      console.error('❌ Required system accounts not found');
      return null;
    }
    
    // Determine which account to use based on payment mode
    const paymentAccount = payment.paymentMode === 'Cash' ? cashAccount : bankAccount;
    
    const entries = [
      {
        accountId: paymentAccount._id,
        accountName: paymentAccount.accountName,
        accountGroup: paymentAccount.accountGroup,
        debit: payment.amount,
        credit: 0,
        narration: `Payment received from ${payment.dealerName || 'Dealer'} - ${payment.paymentNumber}`
      },
      {
        accountId: debtorsAccount._id,
        accountName: debtorsAccount.accountName,
        accountGroup: debtorsAccount.accountGroup,
        debit: 0,
        credit: payment.amount,
        narration: `Payment from ${payment.dealerName || 'Dealer'} - ${payment.paymentNumber}`
      }
    ];
    
    const voucherNumber = await generateJournalNumber(dbConnection);
    
    const journalVoucher = await JournalVoucher.create({
      voucherNumber,
      voucherDate: payment.paymentDate || new Date(),
      voucherType: 'Receipt',
      referenceType: 'DealerPayment',
      referenceId: payment._id,
      referenceNumber: payment.paymentNumber,
      entries,
      totalDebit: payment.amount,
      totalCredit: payment.amount,
      narration: `Automatic entry for Dealer Payment ${payment.paymentNumber}`,
      isAutoGenerated: true,
      createdBy: userId
    });
    
    console.log(`✅ Journal entry created: ${voucherNumber}`);
    return journalVoucher;
    
  } catch (error) {
    console.error('❌ Error creating dealer payment journal entry:', error);
    return null;
  }
};

/**
 * Create automatic journal entry for Supplier Payment
 * Debit: Sundry Creditors
 * Credit: Bank/Cash Account
 */
export const createSupplierPaymentEntry = async (payment, dbConnection, userId) => {
  try {
    const { JournalVoucher } = getModels(dbConnection);
    
    console.log(`📝 Creating automatic journal entry for Supplier Payment: ${payment.paymentNumber}`);
    
    // Get system accounts
    const creditorsAccount = await getSystemAccount('Sundry Creditors', dbConnection);
    const cashAccount = await getSystemAccount('Cash Account', dbConnection);
    const bankAccount = await getSystemAccount('Bank Account', dbConnection);
    
    if (!creditorsAccount || (!cashAccount && !bankAccount)) {
      console.error('❌ Required system accounts not found');
      return null;
    }
    
    // Determine which account to use based on payment mode
    const paymentAccount = payment.paymentMode === 'Cash' ? cashAccount : bankAccount;
    
    const entries = [
      {
        accountId: creditorsAccount._id,
        accountName: creditorsAccount.accountName,
        accountGroup: creditorsAccount.accountGroup,
        debit: payment.amount,
        credit: 0,
        narration: `Payment to ${payment.supplierName || 'Supplier'} - ${payment.paymentNumber}`
      },
      {
        accountId: paymentAccount._id,
        accountName: paymentAccount.accountName,
        accountGroup: paymentAccount.accountGroup,
        debit: 0,
        credit: payment.amount,
        narration: `Payment to ${payment.supplierName || 'Supplier'} - ${payment.paymentNumber}`
      }
    ];
    
    const voucherNumber = await generateJournalNumber(dbConnection);
    
    const journalVoucher = await JournalVoucher.create({
      voucherNumber,
      voucherDate: payment.paymentDate || new Date(),
      voucherType: 'Payment',
      referenceType: 'SupplierPayment',
      referenceId: payment._id,
      referenceNumber: payment.paymentNumber,
      entries,
      totalDebit: payment.amount,
      totalCredit: payment.amount,
      narration: `Automatic entry for Supplier Payment ${payment.paymentNumber}`,
      isAutoGenerated: true,
      createdBy: userId
    });
    
    console.log(`✅ Journal entry created: ${voucherNumber}`);
    return journalVoucher;
    
  } catch (error) {
    console.error('❌ Error creating supplier payment journal entry:', error);
    return null;
  }
};

/**
 * Get an expense account to debit, or create a generic one if none exists.
 * Returns an account in the 'Indirect Expenses' group.
 */
const getOrCreateExpenseAccount = async (dbConnection, preferredName) => {
  const { AccountMaster } = getModels(dbConnection);
  // 1) Exact match on the expense type name (if an account is named for it)
  if (preferredName) {
    const named = await AccountMaster.findOne({ accountName: preferredName });
    if (named) return named;
  }
  // 2) Any existing Indirect Expenses account
  const anyExpense = await AccountMaster.findOne({ accountGroup: 'Indirect Expenses' });
  if (anyExpense) return anyExpense;
  // 3) Create a fallback 'General Expenses' account
  return AccountMaster.create({
    accountName: 'General Expenses',
    accountGroup: 'Indirect Expenses',
    accountType: 'Expense',
    openingBalance: 0,
    openingBalanceType: 'Dr',
    isSystem: true,
    description: 'Auto-created for expense postings',
  });
};

/**
 * Create automatic journal entry for an Expense.
 * Debit:  Expense account (Indirect Expenses)
 * Credit: Cash Account (expenses are assumed paid in cash by default)
 */
export const createExpenseEntry = async (expense, dbConnection, userId, options = {}) => {
  try {
    const { JournalVoucher } = getModels(dbConnection);

    const amount = Number(expense.amount) || 0;
    if (amount <= 0) return null;

    const cashAccount = await getSystemAccount('Cash Account', dbConnection);
    const expenseAccount = await getOrCreateExpenseAccount(dbConnection, options.expenseTypeName);

    if (!cashAccount || !expenseAccount) {
      console.error('❌ Required accounts not found for expense journal entry');
      return null;
    }

    const entries = [
      {
        accountId: expenseAccount._id,
        accountName: expenseAccount.accountName,
        accountGroup: expenseAccount.accountGroup,
        debit: amount,
        credit: 0,
        narration: `Expense: ${expense.description || options.expenseTypeName || 'General'}`,
      },
      {
        accountId: cashAccount._id,
        accountName: cashAccount.accountName,
        accountGroup: cashAccount.accountGroup,
        debit: 0,
        credit: amount,
        narration: `Paid for expense: ${expense.description || ''}`,
      },
    ];

    const voucherNumber = await generateJournalNumber(dbConnection);

    const journalVoucher = await JournalVoucher.create({
      voucherNumber,
      voucherDate: expense.date || new Date(),
      voucherType: 'Payment',
      referenceType: 'Manual',
      referenceId: expense._id,
      referenceNumber: String(expense._id),
      entries,
      totalDebit: amount,
      totalCredit: amount,
      totalAmount: amount,
      narration: `Automatic entry for expense ${expense.description || ''}`.trim(),
      isAutoGenerated: true,
      createdBy: userId,
    });

    return journalVoucher;
  } catch (error) {
    console.error('❌ Error creating expense journal entry:', error);
    return null;
  }
};

/**
 * Create the balancing journal entry for a dealer's opening balance (go-live).
 * Dr type (dealer owes us / receivable): Dr Sundry Debtors / Cr Opening Balance Equity.
 * Cr type (we owe dealer / advance):     Dr Opening Balance Equity / Cr Sundry Debtors.
 */
export const createDealerOpeningEntry = async (
  { dealer, amount, type, date },
  dbConnection,
  userId,
  { session, throwOnError = false } = {}
) => {
  try {
    const { JournalVoucher, AccountMaster } = getModels(dbConnection);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return null;

    const debtors = await getSystemAccount('Sundry Debtors', dbConnection, {
      session,
      throwOnError,
    });
    if (!debtors) return null;

    // Auto-create the Opening Balance Equity account if missing.
    let openingEquityQuery = AccountMaster.findOne({ accountName: 'Opening Balance Equity' });
    if (session) openingEquityQuery = openingEquityQuery.session(session);
    let openingEquity = await openingEquityQuery;
    if (!openingEquity) {
      openingEquity = new AccountMaster({
        accountName: 'Opening Balance Equity',
        accountGroup: 'Reserves & Surplus',
        accountType: 'Equity',
        openingBalance: 0,
        openingBalanceType: 'Cr',
        isSystem: true,
        description: 'Contra account for migration opening balances',
      });
      await openingEquity.save({ session });
    }
    if (!openingEquity) {
      const error = new Error('Required system account "Opening Balance Equity" could not be created');
      if (throwOnError) throw error;
      return null;
    }

    const dealerName = dealer?.name || 'Dealer';
    const isDr = type === 'Dr';
    const entries = isDr
      ? [
          { accountId: debtors._id, accountName: debtors.accountName, accountGroup: debtors.accountGroup, debit: amt, credit: 0, narration: `Opening balance receivable from ${dealerName}` },
          { accountId: openingEquity._id, accountName: openingEquity.accountName, accountGroup: openingEquity.accountGroup, debit: 0, credit: amt, narration: `Opening balance - ${dealerName}` },
        ]
      : [
          { accountId: openingEquity._id, accountName: openingEquity.accountName, accountGroup: openingEquity.accountGroup, debit: amt, credit: 0, narration: `Opening balance - ${dealerName}` },
          { accountId: debtors._id, accountName: debtors.accountName, accountGroup: debtors.accountGroup, debit: 0, credit: amt, narration: `Opening advance/credit for ${dealerName}` },
        ];

    const voucherNumber = await generateJournalNumber(dbConnection, { session });
    const journalVoucher = new JournalVoucher({
      voucherNumber,
      voucherDate: date || new Date(),
      voucherType: 'Opening Entry',
      referenceType: 'Manual',
      referenceId: dealer?._id,
      referenceNumber: dealer?.code || '',
      entries,
      totalDebit: amt,
      totalCredit: amt,
      totalAmount: amt,
      narration: `Opening balance for dealer ${dealerName} (${type})`,
      isAutoGenerated: true,
      createdBy: userId,
    });
    await journalVoucher.save({ session });
    return journalVoucher;
  } catch (error) {
    console.error('❌ Error creating dealer opening journal entry:', error);
    if (throwOnError) throw error;
    return null;
  }
};

/**
 * Get or create the Suspense holding account (counter for unclassified
 * cash/bank vouchers — the user reclassifies it later via a journal).
 */
const getOrCreateSuspenseAccount = async (dbConnection) => {
  const { AccountMaster } = getModels(dbConnection);
  let acc = await AccountMaster.findOne({ accountName: 'Suspense Account' });
  if (!acc) {
    acc = await AccountMaster.create({
      accountName: 'Suspense Account',
      accountGroup: 'Current Assets',
      accountType: 'Asset',
      openingBalance: 0,
      openingBalanceType: 'Dr',
      isSystem: true,
      description: 'Holding account for unclassified cash/bank vouchers — reclassify via journal',
    });
  }
  return acc;
};

const lineFor = (account, debit, credit, narration) => ({
  accountId: account._id,
  accountName: account.accountName,
  accountGroup: account.accountGroup,
  debit,
  credit,
  narration,
});

/**
 * Create automatic journal entry for a STANDALONE cash/bank voucher
 * (Receipt / Payment / Contra created via the Voucher module).
 *
 * Rules to avoid double-counting with the payment modules:
 *   - Contra (cash <-> bank): Dr destination ledger / Cr source ledger.
 *   - Receipt/Payment for Dealer or Supplier: SKIPPED — those are journalized
 *     by the Dealer/Supplier payment modules.
 *   - Other / Internal / Family-Friends Receipt: Dr Cash/Bank / Cr Suspense.
 *   - Other / Internal / Family-Friends Payment: Dr Suspense / Cr Cash/Bank.
 *
 * Idempotent: if a journal voucher already references this voucher, returns it.
 */
export const createVoucherEntry = async (voucher, dbConnection, userId) => {
  try {
    const { JournalVoucher } = getModels(dbConnection);
    const amount = Number(voucher.totalAmount) || 0;
    if (amount <= 0) return null;
    if (voucher.status && voucher.status !== 'Posted') return null;

    // Idempotency — never post twice for the same voucher
    const existing = await JournalVoucher.findOne({
      referenceId: voucher._id,
      referenceNumber: voucher.voucherNumber,
    });
    if (existing) return existing;

    let entries = null;
    let jvType = 'Journal';

    if (voucher.voucherType === 'Contra') {
      const fromType = voucher.contraDetails?.fromAccount?.accountType;
      const toType = voucher.contraDetails?.toAccount?.accountType;
      if (!fromType || !toType) return null;
      const fromLedger = await getSystemAccount(fromType === 'Cash' ? 'Cash Account' : 'Bank Account', dbConnection);
      const toLedger = await getSystemAccount(toType === 'Cash' ? 'Cash Account' : 'Bank Account', dbConnection);
      if (!fromLedger || !toLedger) return null;
      jvType = 'Contra';
      const note = `Transfer ${voucher.contraDetails?.fromAccount?.accountName || fromType} → ${voucher.contraDetails?.toAccount?.accountName || toType}`;
      entries = [
        lineFor(toLedger, amount, 0, note),
        lineFor(fromLedger, 0, amount, note),
      ];
    } else if (voucher.voucherType === 'Receipt' || voucher.voucherType === 'Payment') {
      // Dealer/Supplier receipts & payments are journalized by their own modules
      if (['Dealer', 'Supplier'].includes(voucher.partyType)) return null;

      const cashBank = await getSystemAccount(voucher.transactionMode === 'Cash' ? 'Cash Account' : 'Bank Account', dbConnection);
      const suspense = await getOrCreateSuspenseAccount(dbConnection);
      if (!cashBank || !suspense) return null;

      jvType = voucher.voucherType;
      const who = voucher.partyName || voucher.partyType || 'party';
      if (voucher.voucherType === 'Receipt') {
        entries = [
          lineFor(cashBank, amount, 0, `Receipt from ${who} - ${voucher.voucherNumber}`),
          lineFor(suspense, 0, amount, `Unclassified receipt - ${voucher.voucherNumber} (reclassify)`),
        ];
      } else {
        entries = [
          lineFor(suspense, amount, 0, `Unclassified payment - ${voucher.voucherNumber} (reclassify)`),
          lineFor(cashBank, 0, amount, `Payment to ${who} - ${voucher.voucherNumber}`),
        ];
      }
    } else {
      return null; // Journal-type vouchers are handled elsewhere
    }

    const voucherNumber = await generateJournalNumber(dbConnection);
    const jv = await JournalVoucher.create({
      voucherNumber,
      voucherDate: voucher.voucherDate || new Date(),
      voucherType: jvType,
      referenceType: 'Manual',
      referenceId: voucher._id,
      referenceNumber: voucher.voucherNumber,
      entries,
      totalDebit: amount,
      totalCredit: amount,
      totalAmount: amount,
      narration: voucher.narration || `Automatic entry for ${voucher.voucherType} voucher ${voucher.voucherNumber}`,
      isAutoGenerated: true,
      createdBy: userId,
    });
    return jv;
  } catch (error) {
    console.error('❌ Error creating voucher journal entry:', error);
    return null;
  }
};

/**
 * Cancel the journal entry linked to a cash/bank voucher (on voucher cancel).
 */
export const cancelVoucherEntry = async (
  voucherId,
  dbConnection,
  userId,
  reason,
  { session, throwOnError = false } = {}
) => {
  try {
    const { JournalVoucher } = getModels(dbConnection);
    let query = JournalVoucher.findOne({
      referenceId: voucherId,
      status: 'Posted',
      isAutoGenerated: true
    });
    if (session) query = query.session(session);
    const jv = await query;
    if (!jv) return null;
    jv.status = 'Cancelled';
    jv.cancelledAt = new Date();
    jv.cancelledBy = userId;
    jv.cancelReason = reason || 'Voucher cancelled';
    await jv.save({ session });
    return jv;
  } catch (error) {
    console.error('❌ Error cancelling voucher journal entry:', error);
    if (throwOnError) throw error;
    return null;
  }
};

export default {
  createDealerInvoiceEntry,
  reverseDealerInvoiceEntry,
  createSupplierInvoiceEntry,
  createDealerPaymentEntry,
  createSupplierPaymentEntry,
  createExpenseEntry,
  createDealerOpeningEntry,
  createVoucherEntry,
  cancelVoucherEntry,
};