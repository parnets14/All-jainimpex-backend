import mongoose from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import { voucherSchema } from '../models/Voucher.js';
import { dealerSchema } from '../models/Dealer.js';
import { dealerLedgerSchema } from '../models/DealerLedger.js';
import { bankAccountSchema } from '../models/BankAccount.js';
import { cashAccountSchema } from '../models/CashAccount.js';
import { journalVoucherSchema } from '../models/JournalVoucher.js';
import { accountMasterSchema } from '../models/AccountMaster.js';
import { chequeSchema } from '../models/Cheque.js';
import { paymentAllocationSchema } from '../models/PaymentAllocation.js';
import { generateVoucherNumber, getFinancialYear } from './voucherNumberService.js';
import { assertPeriodOpen } from './periodLockService.js';

const getModels = (dbConnection) => ({
  Voucher: dbConnection.models.Voucher || dbConnection.model('Voucher', voucherSchema),
  Dealer: dbConnection.models.Dealer || dbConnection.model('Dealer', dealerSchema),
  DealerLedger: dbConnection.models.DealerLedger || dbConnection.model('DealerLedger', dealerLedgerSchema),
  BankAccount: dbConnection.models.BankAccount || dbConnection.model('BankAccount', bankAccountSchema),
  CashAccount: dbConnection.models.CashAccount || dbConnection.model('CashAccount', cashAccountSchema),
  JournalVoucher: dbConnection.models.JournalVoucher || dbConnection.model('JournalVoucher', journalVoucherSchema),
  AccountMaster: dbConnection.models.AccountMaster || dbConnection.model('AccountMaster', accountMasterSchema),
  Cheque: dbConnection.models.Cheque || dbConnection.model('Cheque', chequeSchema),
  PaymentAllocation: dbConnection.models.PaymentAllocation
    || dbConnection.model('PaymentAllocation', paymentAllocationSchema),
});

export const createReceiptError = (statusCode, message, code = null) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
};

const acquireDealerLedgerPostingLock = async ({ Dealer, dealer, session }) => {
  const expectedVersion = dealer.ledgerPostingVersion ?? 0;
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    throw createReceiptError(
      409,
      'Dealer ledger posting version is invalid; migrate the dealer before posting'
    );
  }

  const versionPredicate = expectedVersion === 0
    ? { $or: [{ ledgerPostingVersion: 0 }, { ledgerPostingVersion: null }] }
    : { ledgerPostingVersion: expectedVersion };
  return Dealer.updateOne(
    { _id: dealer._id, ...versionPredicate },
    { $set: { ledgerPostingVersion: expectedVersion + 1 } },
    { session }
  );
};

const MONEY_SCALE = 100;
const toMinorUnits = (value, field = 'Amount') => {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw createReceiptError(400, `${field} must be a valid number`);
  }
  const scaled = number * MONEY_SCALE;
  const units = Math.round(scaled);
  if (Math.abs(scaled - units) > 1e-6 || units <= 0) {
    throw createReceiptError(400, `${field} must be greater than zero with at most two decimal places`);
  }
  return units;
};
const fromMinorUnits = (units) => units / MONEY_SCALE;

const normalizeMode = (value) => {
  const mode = String(value || '').trim().toLowerCase();
  const modes = {
    cash: 'Cash',
    bank: 'Bank',
    cheque: 'Cheque',
    upi: 'UPI',
    neft: 'NEFT',
    rtgs: 'RTGS',
    card: 'Card',
    'bank transfer': 'Bank',
    'online transfer': 'Bank',
    account: 'Bank',
  };
  const normalized = modes[mode];
  if (!normalized) throw createReceiptError(400, `Unsupported dealer receipt mode: ${value}`);
  return normalized;
};

const ledgerPaymentMethod = (mode) => {
  if (mode === 'Cash') return 'Cash';
  if (mode === 'Cheque') return 'Cheque';
  if (mode === 'UPI') return 'UPI';
  return 'Bank Transfer';
};

const canonicalizeTender = (tender, index, defaultDate) => {
  const mode = normalizeMode(tender?.mode || tender?.transactionMode);
  const amountInMinorUnits = toMinorUnits(tender?.amount, `Tender ${index + 1} amount`);
  const date = new Date(tender?.date || defaultDate);
  if (Number.isNaN(date.getTime())) throw createReceiptError(400, `Tender ${index + 1} date is invalid`);

  const cheque = mode === 'Cheque' ? {
    chequeNo: String(tender?.cheque?.chequeNo || tender?.chequeNumber || '').trim().toUpperCase(),
    chequeDate: new Date(tender?.cheque?.chequeDate || tender?.chequeDate || date),
    bankName: String(tender?.cheque?.bankName || tender?.chequeBank || '').trim(),
    bankBranch: String(tender?.cheque?.bankBranch || '').trim(),
    bankAccountNo: String(tender?.cheque?.bankAccountNo || '').trim(),
    image: tender?.cheque?.image || null,
  } : null;
  if (cheque && (!cheque.chequeNo || !cheque.bankName || Number.isNaN(cheque.chequeDate.getTime()))) {
    throw createReceiptError(400, `Tender ${index + 1} requires cheque number, bank name, and a valid cheque date`);
  }

  return {
    mode,
    amountInMinorUnits,
    amount: fromMinorUnits(amountInMinorUnits),
    date,
    bankAccountId: tender?.bankAccountId || tender?.bankAccount || null,
    referenceNumber: String(tender?.referenceNumber || tender?.transactionId || '').trim(),
    upiTransactionId: String(tender?.upiTransactionId || tender?.transactionId || '').trim(),
    cheque,
    narration: String(tender?.narration || '').trim(),
  };
};

const receiptFingerprint = ({ dealerId, receiptDate, sourceType, sourceId, tenders, narration }) => createHash('sha256')
  .update(JSON.stringify({
    dealerId: String(dealerId),
    receiptDate: new Date(receiptDate).toISOString(),
    sourceType,
    sourceId: String(sourceId),
    narration: narration || '',
    tenders: tenders.map((tender) => ({
      mode: tender.mode,
      amount: tender.amount,
      date: tender.date.toISOString(),
      bankAccountId: tender.bankAccountId ? String(tender.bankAccountId) : null,
      referenceNumber: tender.referenceNumber,
      upiTransactionId: tender.upiTransactionId,
      cheque: tender.cheque ? {
        chequeNo: tender.cheque.chequeNo,
        chequeDate: tender.cheque.chequeDate.toISOString(),
        bankName: tender.cheque.bankName,
      } : null,
    })),
  }))
  .digest('hex');

const findSystemAccount = async (AccountMaster, accountName, session, { create = false } = {}) => {
  let account = await AccountMaster.findOne({ accountName }).session(session);
  if (!account && create) {
    account = new AccountMaster({
      accountName,
      accountGroup: 'Current Assets',
      accountType: 'Asset',
      openingBalance: 0,
      openingBalanceType: 'Dr',
      isSystem: true,
      description: 'Uncleared dealer cheques held for deposit',
    });
    await account.save({ session });
  }
  if (!account) throw createReceiptError(409, `Required system account "${accountName}" is not configured`);
  return account;
};

const resolveOperationalBank = async (BankAccount, requestedId, session) => {
  if (requestedId) {
    const requested = await BankAccount.findOne({ _id: requestedId, isActive: { $ne: false } }).session(session);
    if (!requested) throw createReceiptError(400, 'Selected receiving bank account was not found or is inactive');
    return requested;
  }

  const primary = await BankAccount.findOne({ isPrimary: true, isActive: { $ne: false } }).session(session);
  if (primary) return primary;
  const active = await BankAccount.find({ isActive: { $ne: false } }).limit(2).session(session);
  if (active.length === 1) return active[0];
  throw createReceiptError(400, 'Select the company bank account that received this payment');
};

const incrementOperationalAccount = async ({ models, mode, bankAccountId, amount, session }) => {
  if (mode === 'Cheque') return null;
  if (mode === 'Cash') {
    let cash = await models.CashAccount.findOne({ singletonKey: 'primary' }).session(session);
    if (!cash) {
      const legacyCashAccounts = await models.CashAccount.find({
        $or: [{ singletonKey: null }, { singletonKey: { $exists: false } }],
      }).limit(2).session(session);
      if (legacyCashAccounts.length > 1) {
        throw createReceiptError(
          409,
          'Multiple legacy cash accounts exist; migrate them before posting dealer receipts'
        );
      }
      cash = legacyCashAccounts[0] || null;
    }
    if (!cash) {
      cash = new models.CashAccount({
        singletonKey: 'primary',
        accountName: 'Cash in Hand',
        openingBalance: 0,
        currentBalance: amount,
        lastUpdated: new Date(),
      });
      await cash.save({ session });
    } else {
      const updated = await models.CashAccount.findOneAndUpdate(
        { _id: cash._id },
        { $inc: { currentBalance: amount }, $set: { singletonKey: 'primary', lastUpdated: new Date() } },
        { new: true, session }
      );
      if (!updated) throw createReceiptError(409, 'Cash balance changed while posting; please retry');
      cash = updated;
    }
    return { type: 'Cash', document: cash };
  }

  const bank = await resolveOperationalBank(models.BankAccount, bankAccountId, session);
  const updated = await models.BankAccount.findOneAndUpdate(
    { _id: bank._id, isActive: { $ne: false }, currentBalance: bank.currentBalance },
    { $inc: { currentBalance: amount }, $set: { updatedAt: new Date() } },
    { new: true, session }
  );
  if (!updated) throw createReceiptError(409, 'Bank balance changed while posting; please retry');
  return { type: 'Bank', document: updated };
};

const journalNumber = (sequence) => {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `JV-${yearMonth}-${randomUUID().replaceAll('-', '').toUpperCase()}-${String(sequence).padStart(2, '0')}`;
};

const existingReceiptResult = async (models, sourceType, sourceId, fingerprint, expectedCount, session) => {
  const vouchers = await models.Voucher.find({ sourceType, sourceId: String(sourceId) })
    .sort({ sourceSequence: 1 })
    .session(session);
  if (vouchers.length === 0) return null;
  if (vouchers.length !== expectedCount || vouchers.some((voucher) => voucher.postingFingerprint !== fingerprint)) {
    throw createReceiptError(409, 'This payment source was already posted with different financial details');
  }
  const cheques = await models.Cheque.find({ receiptVoucher: { $in: vouchers.map((voucher) => voucher._id) } }).session(session);
  return { vouchers, cheques, replayed: true };
};

/**
 * Post one dealer receipt atomically. A mixed receipt is represented by one
 * Voucher per tender, all sharing sourceType/sourceId and a deterministic
 * sourceSequence. Allocation remains a separate classification transaction.
 */
export const postDealerReceipt = async ({
  dbConnection,
  dealerId,
  receiptDate = new Date(),
  sourceType,
  sourceId,
  tenders,
  actorId,
  narration = '',
  notes = '',
}, { session: existingSession = null } = {}) => {
  if (!dbConnection) throw createReceiptError(500, 'Company database connection is required');
  if (!dealerId || !sourceType || sourceId == null || sourceId === '' || !actorId) {
    throw createReceiptError(400, 'dealerId, sourceType, sourceId, and actorId are required');
  }
  const normalizedReceiptDate = new Date(receiptDate);
  if (Number.isNaN(normalizedReceiptDate.getTime())) throw createReceiptError(400, 'Receipt date is invalid');
  if (!Array.isArray(tenders) || tenders.length === 0) throw createReceiptError(400, 'At least one receipt tender is required');

  const normalizedTenders = tenders.map((tender, index) => canonicalizeTender(tender, index, normalizedReceiptDate));
  const receiptFinancialYear = getFinancialYear(normalizedReceiptDate);
  const tenderFinancialYears = new Set(normalizedTenders.map((tender) => getFinancialYear(tender.date)));
  if (tenderFinancialYears.size !== 1 || !tenderFinancialYears.has(receiptFinancialYear)) {
    throw createReceiptError(400, 'All receipt splits must remain in the receipt financial year');
  }
  const totalInMinorUnits = normalizedTenders.reduce((sum, tender) => sum + tender.amountInMinorUnits, 0);
  if (totalInMinorUnits <= 0) throw createReceiptError(400, 'Receipt total must be greater than zero');
  const fingerprint = receiptFingerprint({
    dealerId,
    receiptDate: normalizedReceiptDate,
    sourceType,
    sourceId,
    tenders: normalizedTenders,
    narration,
  });

  const models = getModels(dbConnection);

  const execute = async (session) => {
    const distinctTenderDates = new Map(
      normalizedTenders.map((tender) => [tender.date.toISOString(), tender.date])
    );
    for (const tenderDate of distinctTenderDates.values()) {
      await assertPeriodOpen(dbConnection, tenderDate, 'dealer receipt', { session });
    }

    const replay = await existingReceiptResult(
      models,
      sourceType,
      sourceId,
      fingerprint,
      normalizedTenders.length,
      session
    );
    if (replay) return replay;

    const dealer = await models.Dealer.findById(dealerId).session(session);
    if (!dealer) throw createReceiptError(404, 'Dealer not found');

    const lock = await acquireDealerLedgerPostingLock({
      Dealer: models.Dealer,
      dealer,
      session,
    });
    if (lock.matchedCount !== 1) throw createReceiptError(409, 'Dealer ledger changed while posting; please retry');

    const debtorsAccount = await findSystemAccount(models.AccountMaster, 'Sundry Debtors', session);
    const cashAccount = normalizedTenders.some((tender) => tender.mode === 'Cash')
      ? await findSystemAccount(models.AccountMaster, 'Cash Account', session)
      : null;
    const bankControlAccount = normalizedTenders.some((tender) => !['Cash', 'Cheque'].includes(tender.mode))
      ? await findSystemAccount(models.AccountMaster, 'Bank Account', session)
      : null;
    const chequesInHandAccount = normalizedTenders.some((tender) => tender.mode === 'Cheque')
      ? await findSystemAccount(models.AccountMaster, 'Cheques in Hand', session, { create: true })
      : null;

    const baseVoucherNumber = await generateVoucherNumber(
      'Receipt',
      normalizedReceiptDate,
      dbConnection,
      session
    );
    const vouchers = [];
    const cheques = [];

    for (let index = 0; index < normalizedTenders.length; index += 1) {
      const tender = normalizedTenders[index];
      const sequence = index + 1;
      const postingKey = `dealer-receipt:${sourceType}:${String(sourceId)}:${sequence}`;
      const voucherNumber = sequence === 1 ? baseVoucherNumber : `${baseVoucherNumber}-${sequence}`;
      const operationalAccount = await incrementOperationalAccount({
        models,
        mode: tender.mode,
        bankAccountId: tender.bankAccountId,
        amount: tender.amount,
        session,
      });

      const voucher = new models.Voucher({
        voucherNumber,
        voucherType: 'Receipt',
        voucherDate: tender.date,
        financialYear: getFinancialYear(tender.date),
        partyType: 'Dealer',
        partyId: dealer._id,
        partyName: dealer.name,
        transactionMode: tender.mode,
        bankAccount: operationalAccount?.type === 'Bank' ? operationalAccount.document._id : null,
        bankAccountName: operationalAccount?.type === 'Bank' ? operationalAccount.document.accountName : null,
        chequeNumber: tender.cheque?.chequeNo || null,
        chequeDate: tender.cheque?.chequeDate || null,
        chequeBank: tender.cheque?.bankName || null,
        chequeStatus: tender.cheque ? 'Pending' : null,
        upiTransactionId: tender.upiTransactionId || null,
        referenceNumber: tender.referenceNumber || tender.cheque?.chequeNo || null,
        totalAmount: tender.amount,
        allocatedAmount: 0,
        unallocatedAmount: tender.amount,
        allocationType: 'OnAccount',
        allocations: [],
        narration: tender.narration || narration,
        notes,
        status: 'Posted',
        sourceType,
        sourceId: String(sourceId),
        sourceSequence: sequence,
        postingKey,
        postingFingerprint: fingerprint,
        createdBy: actorId,
      });
      await voucher.save({ session });

      let cheque = null;
      if (tender.cheque) {
        const duplicateCheque = await models.Cheque.findOne({
          chequeNo: tender.cheque.chequeNo,
          isDeleted: false,
        }).session(session);
        if (duplicateCheque) throw createReceiptError(409, `Cheque ${tender.cheque.chequeNo} is already registered`);
        cheque = new models.Cheque({
          chequeNo: tender.cheque.chequeNo,
          amount: tender.amount,
          date: tender.cheque.chequeDate,
          bankName: tender.cheque.bankName,
          bankBranch: tender.cheque.bankBranch || undefined,
          bankAccountNo: tender.cheque.bankAccountNo || undefined,
          dealerId: dealer._id,
          status: 'Not Deposited',
          remarks: narration,
          receiptVoucher: voucher._id,
          postingKey: `${postingKey}:cheque`,
          createdBy: actorId,
        });
        try {
          await cheque.save({ session });
        } catch (error) {
          if (error?.code === 11000
            && (error?.keyPattern?.chequeNo || error?.keyValue?.chequeNo)) {
            throw createReceiptError(409, `Cheque ${tender.cheque.chequeNo} is already registered`);
          }
          throw error;
        }
        voucher.cheque = cheque._id;
      }

      const ledger = new models.DealerLedger({
        dealer: dealer._id,
        dealerName: dealer.name,
        dealerCode: dealer.code,
        entryDate: tender.date,
        transactionType: 'Payment',
        paymentReceived: tender.amount,
        paymentMethod: ledgerPaymentMethod(tender.mode),
        chequeDetails: tender.cheque ? {
          chequeNo: tender.cheque.chequeNo,
          bankName: tender.cheque.bankName,
          chequeDate: tender.cheque.chequeDate,
          status: 'Pending',
        } : undefined,
        upiDetails: tender.mode === 'UPI' ? { transactionId: tender.upiTransactionId } : undefined,
        bankTransferDetails: !['Cash', 'Cheque', 'UPI'].includes(tender.mode)
          ? { transactionId: tender.referenceNumber }
          : undefined,
        debitAmount: 0,
        creditAmount: tender.amount,
        runningBalance: 0,
        referenceType: 'Voucher',
        referenceId: voucher._id,
        referenceNumber: voucher.voucherNumber,
        postingKey: `${postingKey}:ledger`,
        description: `Payment Received - ${voucher.voucherNumber} (${tender.mode})`,
        remarks: narration,
        createdBy: actorId,
      });
      await ledger.save({ session });

      const debitAccount = tender.mode === 'Cash'
        ? cashAccount
        : tender.mode === 'Cheque'
          ? chequesInHandAccount
          : bankControlAccount;
      const journal = new models.JournalVoucher({
        voucherNumber: journalNumber(sequence),
        voucherDate: tender.date,
        financialYear: getFinancialYear(tender.date),
        voucherType: 'Receipt',
        referenceType: 'Manual',
        referenceId: voucher._id,
        referenceNumber: voucher.voucherNumber,
        postingKey: `${postingKey}:journal`,
        entries: [
          {
            accountId: debitAccount._id,
            accountName: debitAccount.accountName,
            accountGroup: debitAccount.accountGroup,
            debit: tender.amount,
            credit: 0,
            narration: `Receipt from ${dealer.name} - ${voucher.voucherNumber}`,
          },
          {
            accountId: debtorsAccount._id,
            accountName: debtorsAccount.accountName,
            accountGroup: debtorsAccount.accountGroup,
            debit: 0,
            credit: tender.amount,
            narration: `Dealer receipt - ${dealer.name}`,
          },
        ],
        totalDebit: tender.amount,
        totalCredit: tender.amount,
        totalAmount: tender.amount,
        narration: narration || `Dealer receipt ${voucher.voucherNumber}`,
        isAutoGenerated: true,
        createdBy: actorId,
      });
      await journal.save({ session });
      voucher.journalVoucher = journal._id;
      if (cheque) cheque.receiptJournal = journal._id;
      await voucher.save({ session });
      if (cheque) {
        await cheque.save({ session });
        cheques.push(cheque);
      }
      vouchers.push(voucher);
    }

    return { vouchers, cheques, replayed: false, totalAmount: fromMinorUnits(totalInMinorUnits) };
  };

  if (existingSession) return execute(existingSession);

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const session = await dbConnection.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        result = await execute(session);
      }, {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });
      return result;
    } catch (error) {
      const isDuplicate = error?.code === 11000;
      if (isDuplicate) {
        const replaySession = await dbConnection.startSession();
        try {
          const replay = await existingReceiptResult(
            models,
            sourceType,
            sourceId,
            fingerprint,
            normalizedTenders.length,
            replaySession
          );
          if (replay) return replay;
        } finally {
          await replaySession.endSession();
        }
      }
      if (attempt < 4 && (isDuplicate || error?.hasErrorLabel?.('TransientTransactionError'))) continue;
      throw error;
    } finally {
      await session.endSession();
    }
  }
  throw createReceiptError(409, 'Could not post the dealer receipt; please retry');
};

const finalizeReceiptSourceReversal = async ({
  dbConnection,
  models,
  sourceType,
  sourceId,
  actorId,
  reason,
  effectiveDate,
  session,
}) => {
  if (!['DealerPayment', 'DeliveryPayment', 'SECollection'].includes(sourceType)) return;
  if (!mongoose.isValidObjectId(sourceId)) {
    throw createReceiptError(409, `Receipt source ${sourceType} has an invalid source ID`);
  }
  const sourceObjectId = new mongoose.Types.ObjectId(sourceId);

  if (sourceType === 'DealerPayment') {
    const payments = dbConnection.collection('dealerpayments');
    const payment = await payments.findOne({ _id: sourceObjectId }, { session });
    if (!payment) throw createReceiptError(409, 'Source dealer payment was not found');
    if (payment.status === 'Reversed') return;
    if (payment.status !== 'Approved') {
      throw createReceiptError(409, `Source dealer payment is ${payment.status} and cannot be reversed`);
    }

    if (payment.paymentCategory === 'Advance Payment') {
      const remainingAdvance = Number(payment.advanceDetails?.remainingAdvance || 0);
      if (!Number.isFinite(remainingAdvance) || remainingAdvance < 0) {
        throw createReceiptError(409, 'Advance compatibility balance is invalid');
      }
      const dealerResult = await models.Dealer.updateOne({
        _id: payment.dealer,
        advanceBalance: { $gte: remainingAdvance },
        advancePayments: { $elemMatch: { payment: payment._id } },
      }, {
        $inc: { advanceBalance: -remainingAdvance },
        $pull: { advancePayments: { payment: payment._id } },
      }, { session });
      if (dealerResult.matchedCount !== 1) {
        throw createReceiptError(
          409,
          'Dealer advance mirror is missing or inconsistent; migrate it before reversing'
        );
      }
    }

    const paymentResult = await payments.updateOne({
      _id: payment._id,
      status: 'Approved',
    }, {
      $set: {
        status: 'Reversed',
        receiptReversedAt: effectiveDate,
        reversedBy: actorId,
        reversalReason: String(reason).trim(),
        ...(payment.paymentCategory === 'Advance Payment' ? {
          'advanceDetails.adjustedAmount': 0,
          'advanceDetails.remainingAdvance': 0,
        } : {}),
      },
    }, { session });
    if (paymentResult.matchedCount !== 1) {
      throw createReceiptError(409, 'Source dealer payment changed while reversing; please retry');
    }
    return;
  }

  if (sourceType === 'DeliveryPayment') {
    const payments = dbConnection.collection('deliverypayments');
    const payment = await payments.findOne({ _id: sourceObjectId }, { session });
    if (!payment) throw createReceiptError(409, 'Source delivery payment was not found');
    if (payment.verificationStatus === 'rejected' && payment.receiptReversedAt) return;
    if (payment.verificationStatus !== 'verified') {
      throw createReceiptError(
        409,
        `Source delivery payment is ${payment.verificationStatus} and cannot be reversed`
      );
    }
    const paymentResult = await payments.updateOne({
      _id: payment._id,
      verificationStatus: 'verified',
    }, {
      $set: {
        verificationStatus: 'rejected',
        receiptReversedAt: effectiveDate,
        reversalReason: String(reason).trim(),
        reversedBy: actorId,
        verificationNotes: String(reason).trim(),
      },
    }, { session });
    if (paymentResult.matchedCount !== 1) {
      throw createReceiptError(409, 'Source delivery payment changed while reversing; please retry');
    }
    const assignmentResult = await dbConnection.collection('deliveryassignments').updateOne({
      _id: payment.deliveryAssignment,
      paymentCollected: true,
    }, {
      $set: { paymentCollected: false, paymentCollectedAt: null },
    }, { session });
    if (assignmentResult.matchedCount !== 1) {
      throw createReceiptError(409, 'Delivery assignment claim is inconsistent; migrate it before reversing');
    }
    return;
  }

  if (sourceType === 'SECollection') {
    const collections = dbConnection.collection('collections');
    const collection = await collections.findOne({ _id: sourceObjectId }, { session });
    if (!collection) throw createReceiptError(409, 'Source sales collection was not found');
    if (collection.status === 'Reversed') return;
    if (collection.status !== 'Approved') {
      throw createReceiptError(409, `Source sales collection is ${collection.status} and cannot be reversed`);
    }
    const collectionResult = await collections.updateOne({
      _id: collection._id,
      status: 'Approved',
    }, {
      $set: {
        status: 'Reversed',
        receiptReversedAt: effectiveDate,
        reversalReason: String(reason).trim(),
        reversedBy: actorId,
      },
    }, { session });
    if (collectionResult.matchedCount !== 1) {
      throw createReceiptError(409, 'Source sales collection changed while reversing; please retry');
    }
  }
};

export const reverseDealerReceipt = async ({
  dbConnection,
  voucherIds = null,
  sourceType = null,
  sourceId = null,
  actorId,
  reason,
  reversalDate = new Date(),
}, { session: existingSession = null } = {}) => {
  if (!actorId || !reason || !String(reason).trim()) {
    throw createReceiptError(400, 'actorId and reversal reason are required');
  }
  const effectiveDate = new Date(reversalDate);
  if (Number.isNaN(effectiveDate.getTime())) throw createReceiptError(400, 'Reversal date is invalid');
  const models = getModels(dbConnection);

  const execute = async (session) => {
    await assertPeriodOpen(dbConnection, effectiveDate, 'dealer receipt reversal', { session });
    const query = Array.isArray(voucherIds) && voucherIds.length
      ? { _id: { $in: voucherIds } }
      : { sourceType, sourceId: String(sourceId) };
    const vouchers = await models.Voucher.find(query).sort({ sourceSequence: 1 }).session(session);
    if (!vouchers.length) throw createReceiptError(404, 'Dealer receipt voucher not found');
    if (vouchers.some((voucher) => voucher.partyType !== 'Dealer' || voucher.voucherType !== 'Receipt')) {
      throw createReceiptError(400, 'Only dealer receipt vouchers can use this reversal service');
    }
    if (vouchers.every((voucher) => ['Reversed', 'Cancelled'].includes(voucher.status))) {
      return { vouchers, replayed: true };
    }

    const activeAllocations = await models.PaymentAllocation.find({
      voucherId: { $in: vouchers.map((voucher) => voucher._id) },
      $or: [{ status: 'Active' }, { status: null }, { status: { $exists: false } }],
    }).session(session);
    if (activeAllocations.length) {
      throw createReceiptError(409, 'Reverse the receipt allocations before reversing the receipt');
    }

    const dealerId = vouchers[0].partyId;
    if (vouchers.some((voucher) => String(voucher.partyId) !== String(dealerId))) {
      throw createReceiptError(409, 'Receipt source contains vouchers for more than one dealer');
    }
    const dealer = await models.Dealer.findById(dealerId).session(session);
    if (!dealer) throw createReceiptError(404, 'Dealer not found');
    const lock = await acquireDealerLedgerPostingLock({
      Dealer: models.Dealer,
      dealer,
      session,
    });
    if (lock.matchedCount !== 1) throw createReceiptError(409, 'Dealer ledger changed while reversing; please retry');

    const reversed = [];
    for (let index = 0; index < vouchers.length; index += 1) {
      const voucher = vouchers[index];
      if (['Reversed', 'Cancelled'].includes(voucher.status)) {
        reversed.push(voucher);
        continue;
      }
      if (Number(voucher.allocatedAmount || 0) > 0.001) {
        throw createReceiptError(409, `Voucher ${voucher.voucherNumber} still has allocated value`);
      }
      const amount = Number(voucher.totalAmount);
      if (!Number.isFinite(amount) || amount <= 0) throw createReceiptError(409, 'Voucher amount is invalid');

      let linkedCheque = null;
      if (voucher.transactionMode === 'Cheque') {
        linkedCheque = await models.Cheque.findOne({
          receiptVoucher: voucher._id,
          isDeleted: false,
        }).session(session);
        if (!linkedCheque) {
          throw createReceiptError(409, `Cheque for voucher ${voucher.voucherNumber} was not found`);
        }
        if (linkedCheque.status === 'Bounced') {
          throw createReceiptError(409, `Cheque ${linkedCheque.chequeNo} is already bounced but its receipt is still posted`);
        }
        if (linkedCheque.status === 'Cleared') {
          if (!linkedCheque.depositBankAccount || !linkedCheque.clearanceJournal) {
            throw createReceiptError(409, `Cleared cheque ${linkedCheque.chequeNo} has incomplete accounting links`);
          }
          const clearance = await models.JournalVoucher.findById(linkedCheque.clearanceJournal).session(session);
          if (!clearance) {
            throw createReceiptError(409, `Clearance journal for cheque ${linkedCheque.chequeNo} was not found`);
          }
          if (!clearance.reversedBy) {
            const bankResult = await models.BankAccount.updateOne(
              { _id: linkedCheque.depositBankAccount },
              { $inc: { currentBalance: -amount }, $set: { updatedAt: new Date() } },
              { session }
            );
            if (bankResult.matchedCount !== 1) {
              throw createReceiptError(409, `Clearing bank for cheque ${linkedCheque.chequeNo} was not found`);
            }
            const clearanceReversal = new models.JournalVoucher({
              voucherNumber: journalNumber(25 + index),
              voucherDate: effectiveDate,
              financialYear: getFinancialYear(effectiveDate),
              voucherType: 'Receipt',
              referenceType: 'Manual',
              referenceId: linkedCheque._id,
              referenceNumber: linkedCheque.chequeNo,
              postingKey: `${linkedCheque.postingKey}:clearance-reversal`,
              reversalOf: clearance._id,
              entries: clearance.entries.map((line) => ({
                accountId: line.accountId,
                accountName: line.accountName,
                accountGroup: line.accountGroup,
                debit: Number(line.credit || 0),
                credit: Number(line.debit || 0),
                narration: `Reversal: ${line.narration || linkedCheque.chequeNo}`,
              })),
              totalDebit: amount,
              totalCredit: amount,
              totalAmount: amount,
              narration: `Reverse clearance for cheque ${linkedCheque.chequeNo}: ${String(reason).trim()}`,
              isAutoGenerated: true,
              createdBy: actorId,
            });
            await clearanceReversal.save({ session });
            clearance.reversedBy = clearanceReversal._id;
            await clearance.save({ session });
          }
        }
      }

      if (voucher.transactionMode === 'Cash') {
        const cash = await models.CashAccount.findOne({ singletonKey: 'primary' }).session(session);
        if (!cash) throw createReceiptError(409, 'Cash account was not found for reversal');
        await models.CashAccount.updateOne(
          { _id: cash._id },
          { $inc: { currentBalance: -amount }, $set: { lastUpdated: new Date() } },
          { session }
        );
      } else if (voucher.transactionMode !== 'Cheque') {
        if (!voucher.bankAccount) throw createReceiptError(409, `Voucher ${voucher.voucherNumber} has no receiving bank account`);
        const bankResult = await models.BankAccount.updateOne(
          { _id: voucher.bankAccount },
          { $inc: { currentBalance: -amount }, $set: { updatedAt: new Date() } },
          { session }
        );
        if (bankResult.matchedCount !== 1) throw createReceiptError(409, 'Receiving bank account was not found');
      }

      const basePostingKey = voucher.postingKey || `dealer-receipt:legacy-voucher:${voucher._id}`;
      const reversalLedger = new models.DealerLedger({
        dealer: dealer._id,
        dealerName: dealer.name,
        dealerCode: dealer.code,
        entryDate: effectiveDate,
        transactionType: 'Adjustment',
        debitAmount: amount,
        creditAmount: 0,
        paymentReceived: 0,
        paymentMethod: 'Adjustment',
        runningBalance: 0,
        referenceType: 'VoucherReversal',
        referenceId: voucher._id,
        referenceNumber: voucher.voucherNumber,
        postingKey: `${basePostingKey}:reversal-ledger`,
        description: `Reversal of receipt ${voucher.voucherNumber}`,
        remarks: String(reason).trim(),
        createdBy: actorId,
      });
      await reversalLedger.save({ session });

      const originalJournal = voucher.journalVoucher
        ? await models.JournalVoucher.findById(voucher.journalVoucher).session(session)
        : await models.JournalVoucher.findOne({ referenceId: voucher._id, status: 'Posted' }).session(session);
      if (!originalJournal) throw createReceiptError(409, `Journal entry for ${voucher.voucherNumber} was not found`);
      const reversalJournal = new models.JournalVoucher({
        voucherNumber: journalNumber(50 + index),
        voucherDate: effectiveDate,
        financialYear: getFinancialYear(effectiveDate),
        voucherType: 'Receipt',
        referenceType: 'Manual',
        referenceId: voucher._id,
        referenceNumber: voucher.voucherNumber,
        postingKey: `${basePostingKey}:reversal-journal`,
        reversalOf: originalJournal._id,
        entries: originalJournal.entries.map((line) => ({
          accountId: line.accountId,
          accountName: line.accountName,
          accountGroup: line.accountGroup,
          debit: Number(line.credit || 0),
          credit: Number(line.debit || 0),
          narration: `Reversal: ${line.narration || voucher.voucherNumber}`,
        })),
        totalDebit: amount,
        totalCredit: amount,
        totalAmount: amount,
        narration: `Reversal of dealer receipt ${voucher.voucherNumber}: ${String(reason).trim()}`,
        isAutoGenerated: true,
        createdBy: actorId,
      });
      await reversalJournal.save({ session });
      originalJournal.reversedBy = reversalJournal._id;
      await originalJournal.save({ session });

      if (linkedCheque) {
        linkedCheque.status = 'Bounced';
        linkedCheque.bounceDate = effectiveDate;
        linkedCheque.bounceReason = String(reason).trim();
        linkedCheque.bounceJournal = reversalJournal._id;
        linkedCheque.updatedBy = actorId;
        await linkedCheque.save({ session });
      }

      const claim = await models.Voucher.updateOne({
        _id: voucher._id,
        status: 'Posted',
        allocatedAmount: { $lte: 0.001 },
      }, {
        $set: {
          status: 'Reversed',
          reversedAt: effectiveDate,
          reversedBy: actorId,
          cancelReason: String(reason).trim(),
          ...(linkedCheque ? { chequeStatus: 'Bounced' } : {}),
        }
      }, { session });
      if (claim.matchedCount !== 1) throw createReceiptError(409, 'Voucher changed while reversing; please retry');
      reversed.push(await models.Voucher.findById(voucher._id).session(session));
    }
    const sourceGroups = new Map();
    for (const voucher of vouchers) {
      if (voucher.sourceType && voucher.sourceId) {
        sourceGroups.set(`${voucher.sourceType}:${voucher.sourceId}`, {
          sourceType: voucher.sourceType,
          sourceId: voucher.sourceId,
        });
      }
    }
    for (const { sourceType: groupType, sourceId: groupId } of sourceGroups.values()) {
      const remainingPosted = await models.Voucher.exists({
        sourceType: groupType,
        sourceId: groupId,
        status: 'Posted',
      }).session(session);
      if (remainingPosted) continue;
      await finalizeReceiptSourceReversal({
        dbConnection,
        models,
        sourceType: groupType,
        sourceId: groupId,
        actorId,
        reason,
        effectiveDate,
        session,
      });
    }
    return { vouchers: reversed, replayed: false };
  };

  if (existingSession) return execute(existingSession);
  const session = await dbConnection.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await execute(session);
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    });
    return result;
  } finally {
    await session.endSession();
  }
};

export default { postDealerReceipt, reverseDealerReceipt };
