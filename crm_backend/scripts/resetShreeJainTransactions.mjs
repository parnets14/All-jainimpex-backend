#!/usr/bin/env node

/**
 * Shree Jain Impex transactional reset.
 *
 * DEFAULT: read-only dry run. The script is permanently locked to the
 * `shree-jain-impex` tenant and refuses live writes unless every safety flag,
 * the connected database name, and the dry-run manifest fingerprint match.
 *
 * PRESERVES:
 * - Products, Product Price List/History, pricing values, hierarchy and masters
 * - Users, roles, permissions and HRMS data
 * - Dealers and their original openingBalance/openingBalanceType/openingBalanceDate
 * - Dealer/Supplier Ledger rows whose transactionType is "Opening Balance"
 * - Journal Vouchers whose voucherType is "Opening Entry"
 * - Completed legacy "Opening Stock" adjustments are retained only when valid
 * - Unrelated manual journals, expenses, TDS and year closings are outside
 *   this sales/purchase reset and are left untouched
 * - Canonical Price List opening stock and valid legacy opening adjustments
 * - Suppliers, warehouses, bank/cash/account masters and other master data
 *
 * RESETS/DELETES:
 * - Sales, purchase, payment, voucher, invoice, GRN and delivery transactions
 * - Non-opening ledger, journal and stock activity
 * - Transaction-derived dealer, cash and bank state
 * - Transaction number sources; GRN counter rows are deleted explicitly
 *
 * DRY RUN:
 *   node scripts/resetShreeJainTransactions.mjs
 *
 * LIVE (only after a reviewed dry run and verified backup):
 *   node scripts/resetShreeJainTransactions.mjs --apply \
 *     --confirm=RESET-SHREE-JAIN-IMPEX --backup-confirmed \
 *     --maintenance-confirmed --expected-db=<database> \
 *     --manifest=<dry-run-fingerprint>
 */

import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(scriptDirectory, '..', '.env') });

const { COMPANY_DB_MAP, getCompanyConnection } = await import('../config/multiDatabase.js');

const COMPANY = 'shree-jain-impex';
const LIVE_CONFIRMATION = 'RESET-SHREE-JAIN-IMPEX';
const expectedMappedDatabase = COMPANY_DB_MAP[COMPANY];
const args = process.argv.slice(2);

const APPLY = args.includes('--apply');
const BACKUP_CONFIRMED = args.includes('--backup-confirmed');
const MAINTENANCE_CONFIRMED = args.includes('--maintenance-confirmed');
const HELP = args.includes('--help') || args.includes('-h');
const valueArg = (name) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) || null;
const CONFIRMATION = valueArg('--confirm');
const EXPECTED_DB_ARG = valueArg('--expected-db');
const MANIFEST_ARG = valueArg('--manifest');
const COMPANY_ARG = valueArg('--company');

const knownBooleanArgs = new Set([
  '--apply',
  '--backup-confirmed',
  '--maintenance-confirmed',
  '--help',
  '-h',
]);
const knownValuePrefixes = [
  '--confirm=',
  '--expected-db=',
  '--manifest=',
  '--company=',
];
const unknownArgs = args.filter((arg) => (
  !knownBooleanArgs.has(arg) && !knownValuePrefixes.some((prefix) => arg.startsWith(prefix))
));

if (HELP) {
  console.log(`
Shree Jain Impex transaction reset (dry-run by default)

Dry run:
  node scripts/resetShreeJainTransactions.mjs

Live mode requires all values printed by a successful dry run:
  node scripts/resetShreeJainTransactions.mjs --apply \\
    --confirm=${LIVE_CONFIRMATION} --backup-confirmed \\
    --maintenance-confirmed --expected-db=<database> \\
    --manifest=<dry-run-fingerprint>
`);
  process.exit(0);
}

if (unknownArgs.length > 0) {
  console.error(`Unknown argument(s): ${unknownArgs.join(', ')}`);
  process.exit(1);
}
if (COMPANY_ARG && COMPANY_ARG !== COMPANY) {
  console.error(`This script is hard-locked to --company=${COMPANY}.`);
  process.exit(1);
}
if (!expectedMappedDatabase) {
  console.error(`No configured database mapping exists for ${COMPANY}.`);
  process.exit(1);
}

// deleteMany preserves indexes, unlike collection.drop().
const FULL_DELETE_COLLECTIONS = [
  // Sales and dealer transactions
  'salesorders',
  'dealerinvoices',
  'dealerpayments',
  'creditnotes',
  'dealerorderrequests',
  'dealerperformances',
  'collections',
  // Delivery descendants
  'deliverypayments',
  'deliveryassignments',
  'deliveryroutes',
  // Purchase and supplier transactions
  'purchaseorders',
  'grns',
  'supplierinvoices',
  'supplierpayments',
  'debitnotes',
  // Shared payment transaction documents
  'vouchers',
  'paymentallocations',
  'cheques',
  // Reconciliation summaries depend on voucher IDs and cannot survive a payment reset.
  'bankreconciliations',
];

const PROTECTED_COLLECTIONS = [
  'products',
  'users',
  'dealers',
  'suppliers',
  'brands',
  'categories',
  'subcategories',
  'extendedsubcategories',
  'warehouses',
  'regions',
  'routes',
  'accountmasters',
  'productpricelisthistories',
  'dealerpricings',
  'bankaccounts',
  'cashaccounts',
  // Retained accounting records must not change while their transaction journals are filtered.
  'expenses',
  'tdsentries',
  'financialyearclosings',
  'yearendchecklists',
];

const SELECTIVE_WRITE_COLLECTIONS = [
  'dealerledgers',
  'supplierledgers',
  'journalvouchers',
  'stockmovements',
  'stockadjustments',
  'notifications',
  'counters',
  'dealers',
  'bankaccounts',
  'cashaccounts',
];

const WRITE_ALLOWLIST = new Set([...FULL_DELETE_COLLECTIONS, ...SELECTIVE_WRITE_COLLECTIONS]);
const protectedDeleteCollision = FULL_DELETE_COLLECTIONS.filter((name) => PROTECTED_COLLECTIONS.includes(name));
if (protectedDeleteCollision.length > 0) {
  throw new Error(`Unsafe configuration: protected collections in delete list: ${protectedDeleteCollision.join(', ')}`);
}
for (const collection of [...FULL_DELETE_COLLECTIONS, ...SELECTIVE_WRITE_COLLECTIONS]) {
  if (!WRITE_ALLOWLIST.has(collection)) {
    throw new Error(`Unsafe configuration: ${collection} is outside the write allowlist`);
  }
}

const TRANSACTION_NOTIFICATION_FILTER = {
  $or: [
    {
      type: {
        $in: [
          'order_status',
          'payment',
          'credit',
          'invoice',
          'payment_reminder',
          'order_request',
          'delivery_otp',
        ],
      },
    },
    { orderId: { $ne: null } },
    { 'metadata.invoiceId': { $exists: true } },
    { 'metadata.orderId': { $exists: true } },
  ],
};

const NON_OPENING_DEALER_LEDGER_FILTER = { transactionType: { $ne: 'Opening Balance' } };
const NON_OPENING_SUPPLIER_LEDGER_FILTER = { transactionType: { $ne: 'Opening Balance' } };
const LEGACY_OPENING_ADJUSTMENT_FILTER = {
  reason: 'Opening Stock',
  status: 'Completed',
};
const NON_OPENING_ADJUSTMENT_FILTER = { $nor: [LEGACY_OPENING_ADJUSTMENT_FILTER] };
const buildTransactionJournalFilter = (voucherIds) => ({
  voucherType: { $ne: 'Opening Entry' },
  $or: [
    {
      referenceType: {
        $in: [
          'DealerInvoice',
          'SupplierInvoice',
          'DealerPayment',
          'SupplierPayment',
          'SalesOrder',
          'PurchaseOrder',
        ],
      },
    },
    ...(voucherIds.length > 0 ? [{ referenceId: { $in: voucherIds } }] : []),
  ],
});
const buildManualNonOpeningJournalFilter = (transactionJournalFilter) => ({
  voucherType: { $ne: 'Opening Entry' },
  $nor: transactionJournalFilter.$or,
});
const GRN_COUNTER_FILTER = { _id: { $regex: /^grn-/i } };
const RETAINED_COUNTER_FILTER = { $nor: [GRN_COUNTER_FILTER] };

const collectionExists = (existingCollections, name) => existingCollections.has(name);
const collection = (db, name) => db.db.collection(name);
const countIfExists = async (db, existingCollections, name, filter = {}, session = null) => (
  collectionExists(existingCollections, name)
    ? collection(db, name).countDocuments(filter, session ? { session } : {})
    : 0
);

const normalizeForHash = (value) => {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(normalizeForHash);
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('hex');
  if (typeof value === 'object') {
    if (value._bsontype === 'ObjectId') return value.toString();
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalizeForHash(nested)])
    );
  }
  return value;
};

const fingerprint = (value) => crypto
  .createHash('sha256')
  .update(JSON.stringify(normalizeForHash(value)))
  .digest('hex');

const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const readSorted = async (db, existingCollections, name, filter = {}, projection = null, session = null) => {
  if (!collectionExists(existingCollections, name)) return [];
  const options = {
    ...(projection ? { projection } : {}),
    ...(session ? { session } : {}),
  };
  return collection(db, name)
    .find(filter, options)
    .sort({ _id: 1 })
    .toArray();
};

const omitFields = (document, fields) => Object.fromEntries(
  Object.entries(document).filter(([key]) => !fields.has(key))
);

const protectedHashOmissions = {
  dealers: new Set([
    'openingBalanceAllocated',
    'advanceBalance',
    'advancePayments',
    'totalOrders',
    'totalValue',
    'ledgerPostingVersion',
    'paidAmount',
    'pendingAmount',
    'creditLockToken',
    'creditLockExpiresAt',
  ]),
  bankaccounts: new Set(['currentBalance']),
  cashaccounts: new Set(['currentBalance', 'lastUpdated']),
};

const readProtectedDocuments = async (db, existingCollections, name, session = null) => {
  const documents = await readSorted(db, existingCollections, name, {}, null, session);
  const omissions = protectedHashOmissions[name];
  return omissions ? documents.map((document) => omitFields(document, omissions)) : documents;
};

const getLegacyOpeningAdjustments = async (db, existingCollections) => readSorted(
  db,
  existingCollections,
  'stockadjustments',
  LEGACY_OPENING_ADJUSTMENT_FILTER
);

const buildOpeningStockClauses = (legacyOpeningAdjustmentNumbers) => {
  const clauses = [
    { referenceType: 'OPENING' },
    { movementRole: 'OPENING' },
    { operationKey: { $regex: /^OPENING:/ } },
    // Read-only compatibility for raw legacy data predating the IN/OUT enum.
    { type: 'OPENING' },
  ];
  if (legacyOpeningAdjustmentNumbers.length > 0) {
    clauses.push({
      referenceType: 'ADJUSTMENT',
      referenceNo: { $in: legacyOpeningAdjustmentNumbers },
    });
  }
  return clauses;
};

const findOpeningIntegrityIssues = async (
  db,
  existingCollections,
  openingStockFilter,
  legacyOpeningAdjustments
) => {
  const issues = [];

  if (collectionExists(existingCollections, 'dealerledgers')) {
    const duplicates = await collection(db, 'dealerledgers').aggregate([
      { $match: { transactionType: 'Opening Balance' } },
      { $group: { _id: '$dealer', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: 'groups' },
    ]).toArray();
    if ((duplicates[0]?.groups || 0) > 0) {
      issues.push(`${duplicates[0].groups} dealer(s) have duplicate Opening Balance ledger rows`);
    }

    if (collectionExists(existingCollections, 'dealers')) {
      const orphaned = await collection(db, 'dealerledgers').aggregate([
        { $match: { transactionType: 'Opening Balance' } },
        {
          $lookup: {
            from: 'dealers',
            localField: 'dealer',
            foreignField: '_id',
            as: 'dealerDocument',
          },
        },
        { $match: { dealerDocument: { $size: 0 } } },
        { $count: 'rows' },
      ]).toArray();
      if ((orphaned[0]?.rows || 0) > 0) {
        issues.push(`${orphaned[0].rows} Opening Balance ledger row(s) reference missing dealers`);
      }
    }
  }

  if (collectionExists(existingCollections, 'stockmovements')) {
    const duplicateStockKeys = await collection(db, 'stockmovements').aggregate([
      { $match: openingStockFilter },
      {
        $group: {
          _id: { productId: '$productId', warehouseId: '$warehouseId' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $count: 'groups' },
    ]).toArray();
    if ((duplicateStockKeys[0]?.groups || 0) > 0) {
      issues.push(`${duplicateStockKeys[0].groups} product/warehouse key(s) have multiple opening-stock movements`);
    }

    const invalidDirection = await collection(db, 'stockmovements').countDocuments({
      $and: [openingStockFilter, { type: { $nin: ['IN', 'OPENING'] } }],
    });
    if (invalidDirection > 0) {
      issues.push(`${invalidDirection} preserved opening-stock movement(s) are not inbound`);
    }

    for (const targetCollection of ['products', 'warehouses']) {
      if (!collectionExists(existingCollections, targetCollection)) continue;
      const localField = targetCollection === 'products' ? 'productId' : 'warehouseId';
      const orphaned = await collection(db, 'stockmovements').aggregate([
        { $match: openingStockFilter },
        {
          $lookup: {
            from: targetCollection,
            localField,
            foreignField: '_id',
            as: 'targetDocument',
          },
        },
        { $match: { targetDocument: { $size: 0 } } },
        { $count: 'rows' },
      ]).toArray();
      if ((orphaned[0]?.rows || 0) > 0) {
        issues.push(`${orphaned[0].rows} opening-stock movement(s) reference missing ${targetCollection}`);
      }
    }
  }

  const nonCompletedLegacyOpenings = await countIfExists(
    db,
    existingCollections,
    'stockadjustments',
    { reason: 'Opening Stock', status: { $ne: 'Completed' } }
  );
  if (nonCompletedLegacyOpenings > 0) {
    issues.push(`${nonCompletedLegacyOpenings} legacy Opening Stock adjustment(s) are not Completed`);
  }

  const invalidLegacyAdjustments = legacyOpeningAdjustments.filter((adjustment) => (
    adjustment.adjustmentType !== 'ADD' || !adjustment.adjustmentNo
  ));
  if (invalidLegacyAdjustments.length > 0) {
    issues.push(`${invalidLegacyAdjustments.length} legacy Opening Stock adjustment(s) are not valid completed ADD records`);
  }

  if (collectionExists(existingCollections, 'stockmutationlocks')) {
    const activeLeases = await collection(db, 'stockmutationlocks').countDocuments({
      leaseToken: { $ne: null },
      leaseExpiresAt: { $gt: new Date() },
    });
    if (activeLeases > 0) {
      issues.push(`${activeLeases} active stock mutation lease(s) exist; maintenance mode is not quiescent`);
    }
  }

  return issues;
};

const snapshotProtectedState = async (
  db,
  existingCollections,
  openingStockFilter,
  retainedJournalFilter,
  session = null
) => {
  const counts = {};
  const protectedCollectionHashes = {};
  for (const name of PROTECTED_COLLECTIONS) {
    counts[name] = await countIfExists(db, existingCollections, name, {}, session);
    protectedCollectionHashes[name] = fingerprint(
      await readProtectedDocuments(db, existingCollections, name, session)
    );
  }

  const dealerOpenings = await readSorted(
    db,
    existingCollections,
    'dealers',
    {},
    {
      _id: 1,
      openingBalance: 1,
      openingBalanceType: 1,
      openingBalanceDate: 1,
    },
    session
  );
  const openingLedgerRows = await readSorted(
    db,
    existingCollections,
    'dealerledgers',
    { transactionType: 'Opening Balance' },
    null,
    session
  );
  const supplierOpeningRows = await readSorted(
    db,
    existingCollections,
    'supplierledgers',
    { transactionType: 'Opening Balance' },
    null,
    session
  );
  const openingJournals = await readSorted(
    db,
    existingCollections,
    'journalvouchers',
    { voucherType: 'Opening Entry' },
    null,
    session
  );
  const retainedNonOpeningJournals = await readSorted(
    db,
    existingCollections,
    'journalvouchers',
    retainedJournalFilter,
    null,
    session
  );
  const openingStockRows = await readSorted(
    db,
    existingCollections,
    'stockmovements',
    openingStockFilter,
    null,
    session
  );
  const legacyOpeningAdjustments = await readSorted(
    db,
    existingCollections,
    'stockadjustments',
    LEGACY_OPENING_ADJUSTMENT_FILTER,
    null,
    session
  );
  const retainedCounters = await readSorted(
    db,
    existingCollections,
    'counters',
    RETAINED_COUNTER_FILTER,
    null,
    session
  );
  const dealerMutationTargets = await readSorted(
    db,
    existingCollections,
    'dealers',
    {},
    null,
    session
  );
  const bankAccountMutationTargets = await readSorted(
    db,
    existingCollections,
    'bankaccounts',
    {},
    null,
    session
  );
  const cashAccountMutationTargets = await readSorted(
    db,
    existingCollections,
    'cashaccounts',
    {},
    null,
    session
  );
  const openingStockRates = openingStockRows
    .filter((row) => row.rate != null && row.rate !== '')
    .map((row) => Number(row.rate))
    .filter(Number.isFinite);
  const distinctOpeningStockRates = [...new Set(openingStockRates)].sort((left, right) => left - right);

  return {
    counts,
    hashes: {
      protectedCollections: protectedCollectionHashes,
      dealerOpenings: fingerprint(dealerOpenings),
      dealerOpeningLedgers: fingerprint(
        openingLedgerRows.map((row) => omitFields(row, new Set(['runningBalance'])))
      ),
      supplierOpeningLedgers: fingerprint(
        supplierOpeningRows.map((row) => omitFields(row, new Set(['runningBalance'])))
      ),
      openingJournals: fingerprint(openingJournals),
      retainedNonOpeningJournals: fingerprint(retainedNonOpeningJournals),
      openingStock: fingerprint(
        openingStockRows.map((row) => omitFields(row, new Set(['balance'])))
      ),
      legacyOpeningAdjustments: fingerprint(legacyOpeningAdjustments),
      retainedCounters: fingerprint(retainedCounters),
    },
    preMutationHashes: {
      dealers: fingerprint(dealerMutationTargets),
      dealerOpeningLedgers: fingerprint(openingLedgerRows),
      supplierOpeningLedgers: fingerprint(supplierOpeningRows),
      openingStock: fingerprint(openingStockRows),
      bankAccounts: fingerprint(bankAccountMutationTargets),
      cashAccounts: fingerprint(cashAccountMutationTargets),
    },
    summaries: {
      dealersWithOpeningBalance: dealerOpenings.filter((dealer) => Number(dealer.openingBalance || 0) > 0).length,
      dealerOpeningBalanceTotal: roundCurrency(
        dealerOpenings.reduce((sum, dealer) => sum + Number(dealer.openingBalance || 0), 0)
      ),
      dealerOpeningDebitTotal: roundCurrency(dealerOpenings.reduce(
        (sum, dealer) => sum + (dealer.openingBalanceType === 'Dr' ? Number(dealer.openingBalance || 0) : 0),
        0
      )),
      dealerOpeningCreditTotal: roundCurrency(dealerOpenings.reduce(
        (sum, dealer) => sum + (dealer.openingBalanceType === 'Cr' ? Number(dealer.openingBalance || 0) : 0),
        0
      )),
      dealerOpeningLedgerRows: openingLedgerRows.length,
      dealerOpeningLedgerDebitTotal: roundCurrency(
        openingLedgerRows.reduce((sum, row) => sum + Number(row.debitAmount || 0), 0)
      ),
      dealerOpeningLedgerCreditTotal: roundCurrency(
        openingLedgerRows.reduce((sum, row) => sum + Number(row.creditAmount || 0), 0)
      ),
      supplierOpeningLedgerRows: supplierOpeningRows.length,
      openingJournalRows: openingJournals.length,
      retainedNonOpeningJournalRows: retainedNonOpeningJournals.length,
      openingStockRows: openingStockRows.length,
      openingStockQuantity: openingStockRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
      openingStockRateRows: openingStockRates.length,
      openingStockDistinctRates: distinctOpeningStockRates.length,
      openingStockMinimumRate: distinctOpeningStockRates[0] ?? null,
      openingStockMaximumRate: distinctOpeningStockRates.at(-1) ?? null,
      openingStockValue: roundCurrency(openingStockRows.reduce(
        (sum, row) => sum + (Number(row.quantity || 0) * Number(row.rate || 0)),
        0
      )),
      legacyOpeningAdjustmentRows: legacyOpeningAdjustments.length,
      retainedCounterRows: retainedCounters.length,
    },
  };
};

const buildManifest = async (
  db,
  existingCollections,
  actualDatabase,
  openingStockFilter,
  legacyOpeningAdjustments,
  integrityIssues,
  protectedSnapshot,
  transactionJournalFilter,
  retainedJournalFilter
) => {
  const fullDeleteCounts = {};
  const fullDeleteFingerprints = {};
  for (const name of FULL_DELETE_COLLECTIONS) {
    fullDeleteCounts[name] = await countIfExists(db, existingCollections, name);
    fullDeleteFingerprints[name] = fingerprint(
      await readSorted(db, existingCollections, name)
    );
  }

  return {
    company: COMPANY,
    database: actualDatabase,
    mode: 'dry-run-plan',
    fullDeleteCounts,
    fullDeleteFingerprints,
    selectiveCounts: {
      dealerLedgerOpeningKeep: await countIfExists(
        db,
        existingCollections,
        'dealerledgers',
        { transactionType: 'Opening Balance' }
      ),
      dealerLedgerDelete: await countIfExists(
        db,
        existingCollections,
        'dealerledgers',
        NON_OPENING_DEALER_LEDGER_FILTER
      ),
      supplierLedgerOpeningKeep: await countIfExists(
        db,
        existingCollections,
        'supplierledgers',
        { transactionType: 'Opening Balance' }
      ),
      supplierLedgerDelete: await countIfExists(
        db,
        existingCollections,
        'supplierledgers',
        NON_OPENING_SUPPLIER_LEDGER_FILTER
      ),
      openingJournalKeep: await countIfExists(
        db,
        existingCollections,
        'journalvouchers',
        { voucherType: 'Opening Entry' }
      ),
      transactionJournalDelete: await countIfExists(
        db,
        existingCollections,
        'journalvouchers',
        transactionJournalFilter
      ),
      manualNonOpeningJournalKeep: await countIfExists(
        db,
        existingCollections,
        'journalvouchers',
        retainedJournalFilter
      ),
      openingStockKeep: await countIfExists(db, existingCollections, 'stockmovements', openingStockFilter),
      stockMovementDelete: await countIfExists(
        db,
        existingCollections,
        'stockmovements',
        { $nor: openingStockFilter.$or }
      ),
      legacyOpeningAdjustmentKeep: legacyOpeningAdjustments.length,
      stockAdjustmentDelete: await countIfExists(
        db,
        existingCollections,
        'stockadjustments',
        NON_OPENING_ADJUSTMENT_FILTER
      ),
      transactionNotificationDelete: await countIfExists(
        db,
        existingCollections,
        'notifications',
        TRANSACTION_NOTIFICATION_FILTER
      ),
      grnCounterDelete: await countIfExists(db, existingCollections, 'counters', GRN_COUNTER_FILTER),
      dealerMasterReset: await countIfExists(db, existingCollections, 'dealers'),
      bankBalanceReset: await countIfExists(db, existingCollections, 'bankaccounts'),
      cashBalanceReset: await countIfExists(db, existingCollections, 'cashaccounts'),
    },
    selectiveDeleteFingerprints: {
      dealerLedgers: fingerprint(await readSorted(
        db, existingCollections, 'dealerledgers', NON_OPENING_DEALER_LEDGER_FILTER
      )),
      supplierLedgers: fingerprint(await readSorted(
        db, existingCollections, 'supplierledgers', NON_OPENING_SUPPLIER_LEDGER_FILTER
      )),
      journalVouchers: fingerprint(await readSorted(
        db, existingCollections, 'journalvouchers', transactionJournalFilter
      )),
      stockMovements: fingerprint(await readSorted(
        db, existingCollections, 'stockmovements', { $nor: openingStockFilter.$or }
      )),
      stockAdjustments: fingerprint(await readSorted(
        db, existingCollections, 'stockadjustments', NON_OPENING_ADJUSTMENT_FILTER
      )),
      notifications: fingerprint(await readSorted(
        db, existingCollections, 'notifications', TRANSACTION_NOTIFICATION_FILTER
      )),
      grnCounters: fingerprint(await readSorted(
        db, existingCollections, 'counters', GRN_COUNTER_FILTER
      )),
    },
    numberingPolicy: {
      restarted: [
        'Sales Order',
        'Dealer Invoice',
        'Purchase Order',
        'GRN',
        'Dealer/Supplier Payment',
        'Dealer Order Request',
      ],
      continued: [
        'Journal Voucher (opening/manual/accounting journals are retained to avoid duplicate numbers)',
      ],
    },
    preserve: protectedSnapshot,
    integrityIssues,
  };
};

const printManifest = (manifest, manifestFingerprint) => {
  console.log('\n=== SHREE JAIN IMPEX TRANSACTION RESET PREFLIGHT ===');
  console.log(`Company: ${manifest.company}`);
  console.log(`Database: ${manifest.database}`);
  console.log(`Mode: ${APPLY ? 'LIVE APPLY REQUESTED' : 'DRY RUN (NO WRITES)'}`);

  console.log('\nFull-delete collection counts:');
  for (const [name, count] of Object.entries(manifest.fullDeleteCounts)) {
    console.log(`  ${name}: ${count}`);
  }

  console.log('\nSelective operations:');
  for (const [name, count] of Object.entries(manifest.selectiveCounts)) {
    console.log(`  ${name}: ${count}`);
  }

  console.log('\nOpening/master preservation summary:');
  for (const [name, value] of Object.entries(manifest.preserve.summaries)) {
    const displayedValue = typeof value === 'object' ? JSON.stringify(value) : value;
    console.log(`  ${name}: ${displayedValue}`);
  }
  console.log('  Protected collection counts:');
  for (const [name, count] of Object.entries(manifest.preserve.counts)) {
    console.log(`    ${name}: ${count}`);
  }

  console.log('\nDocument numbering policy:');
  console.log(`  Restarted: ${manifest.numberingPolicy.restarted.join(', ')}`);
  console.log(`  Continued: ${manifest.numberingPolicy.continued.join(', ')}`);

  if (manifest.integrityIssues.length > 0) {
    console.log('\nBLOCKING INTEGRITY ISSUES:');
    for (const issue of manifest.integrityIssues) console.log(`  - ${issue}`);
  } else {
    console.log('\nOpening-data integrity checks: PASS');
  }

  console.log(`\nManifest fingerprint: ${manifestFingerprint}`);
};

const assertLiveSafety = (actualDatabase, manifestFingerprint, integrityIssues) => {
  if (!APPLY) return;
  const failures = [];
  if (CONFIRMATION !== LIVE_CONFIRMATION) failures.push(`--confirm=${LIVE_CONFIRMATION} is required`);
  if (!BACKUP_CONFIRMED) failures.push('--backup-confirmed is required');
  if (!MAINTENANCE_CONFIRMED) failures.push('--maintenance-confirmed is required');
  if (EXPECTED_DB_ARG !== actualDatabase) failures.push(`--expected-db must exactly equal ${actualDatabase}`);
  if (MANIFEST_ARG !== manifestFingerprint) failures.push('--manifest must match this preflight fingerprint');
  if (integrityIssues.length > 0) failures.push('opening-data integrity issues must be resolved first');

  if (failures.length > 0) {
    throw new Error(`Live reset refused:\n- ${failures.join('\n- ')}`);
  }
};

const deleteAll = async (db, existingCollections, name, session) => {
  if (!collectionExists(existingCollections, name)) return 0;
  const result = await collection(db, name).deleteMany({}, { session });
  return result.deletedCount;
};

const deleteMatching = async (db, existingCollections, name, filter, session) => {
  if (!collectionExists(existingCollections, name)) return 0;
  const result = await collection(db, name).deleteMany(filter, { session });
  return result.deletedCount;
};

const assertPlanUnchangedInTransaction = async (
  db,
  existingCollections,
  openingStockFilter,
  transactionJournalFilter,
  retainedJournalFilter,
  expectedManifest,
  beforeProtectedSnapshot,
  session
) => {
  const failures = [];

  for (const name of FULL_DELETE_COLLECTIONS) {
    const currentHash = fingerprint(
      await readSorted(db, existingCollections, name, {}, null, session)
    );
    if (currentHash !== expectedManifest.fullDeleteFingerprints[name]) {
      failures.push(`full-delete plan changed for ${name}`);
    }
  }

  const selectivePlans = {
    dealerLedgers: ['dealerledgers', NON_OPENING_DEALER_LEDGER_FILTER],
    supplierLedgers: ['supplierledgers', NON_OPENING_SUPPLIER_LEDGER_FILTER],
    journalVouchers: ['journalvouchers', transactionJournalFilter],
    stockMovements: ['stockmovements', { $nor: openingStockFilter.$or }],
    stockAdjustments: ['stockadjustments', NON_OPENING_ADJUSTMENT_FILTER],
    notifications: ['notifications', TRANSACTION_NOTIFICATION_FILTER],
    grnCounters: ['counters', GRN_COUNTER_FILTER],
  };
  for (const [key, [name, filter]] of Object.entries(selectivePlans)) {
    const currentHash = fingerprint(
      await readSorted(db, existingCollections, name, filter, null, session)
    );
    if (currentHash !== expectedManifest.selectiveDeleteFingerprints[key]) {
      failures.push(`selective-delete plan changed for ${name}`);
    }
  }

  const currentProtectedSnapshot = await snapshotProtectedState(
    db,
    existingCollections,
    openingStockFilter,
    retainedJournalFilter,
    session
  );
  failures.push(...compareProtectedSnapshots(beforeProtectedSnapshot, currentProtectedSnapshot));
  for (const [name, beforeHash] of Object.entries(beforeProtectedSnapshot.preMutationHashes)) {
    if (beforeHash !== currentProtectedSnapshot.preMutationHashes[name]) {
      failures.push(`pre-mutation input changed for ${name}`);
    }
  }

  const activeLeases = await countIfExists(
    db,
    existingCollections,
    'stockmutationlocks',
    { leaseToken: { $ne: null }, leaseExpiresAt: { $gt: new Date() } },
    session
  );
  if (activeLeases > 0) failures.push(`${activeLeases} active stock mutation lease(s) appeared`);

  if (failures.length > 0) {
    throw new Error(`Pre-delete plan verification failed; no writes applied:\n- ${failures.join('\n- ')}`);
  }
};

const applyReset = async (
  db,
  existingCollections,
  openingStockFilter,
  transactionJournalFilter,
  retainedJournalFilter,
  beforeProtectedSnapshot,
  expectedManifest
) => {
  const session = await db.startSession();
  const results = { fullDeletes: {}, selective: {} };
  try {
    await session.withTransaction(async () => {
      await assertPlanUnchangedInTransaction(
        db,
        existingCollections,
        openingStockFilter,
        transactionJournalFilter,
        retainedJournalFilter,
        expectedManifest,
        beforeProtectedSnapshot,
        session
      );

      for (const name of FULL_DELETE_COLLECTIONS) {
        results.fullDeletes[name] = await deleteAll(db, existingCollections, name, session);
      }

      results.selective.dealerLedgers = await deleteMatching(
        db,
        existingCollections,
        'dealerledgers',
        NON_OPENING_DEALER_LEDGER_FILTER,
        session
      );
      results.selective.supplierLedgers = await deleteMatching(
        db,
        existingCollections,
        'supplierledgers',
        NON_OPENING_SUPPLIER_LEDGER_FILTER,
        session
      );
      results.selective.journalVouchers = await deleteMatching(
        db,
        existingCollections,
        'journalvouchers',
        transactionJournalFilter,
        session
      );
      results.selective.stockMovements = await deleteMatching(
        db,
        existingCollections,
        'stockmovements',
        { $nor: openingStockFilter.$or },
        session
      );
      results.selective.stockAdjustments = await deleteMatching(
        db,
        existingCollections,
        'stockadjustments',
        NON_OPENING_ADJUSTMENT_FILTER,
        session
      );
      results.selective.notifications = await deleteMatching(
        db,
        existingCollections,
        'notifications',
        TRANSACTION_NOTIFICATION_FILTER,
        session
      );
      results.selective.grnCounters = await deleteMatching(
        db,
        existingCollections,
        'counters',
        GRN_COUNTER_FILTER,
        session
      );

      if (collectionExists(existingCollections, 'dealers')) {
        const result = await collection(db, 'dealers').updateMany(
          {},
          {
            $set: {
              openingBalanceAllocated: 0,
              advanceBalance: 0,
              advancePayments: [],
              totalOrders: 0,
              totalValue: 0,
              ledgerPostingVersion: 0,
            },
            $unset: {
              paidAmount: '',
              pendingAmount: '',
              creditLockToken: '',
              creditLockExpiresAt: '',
            },
          },
          { session }
        );
        results.selective.dealersReset = result.modifiedCount;
      }

      if (collectionExists(existingCollections, 'dealerledgers')) {
        await collection(db, 'dealerledgers').updateMany(
          { transactionType: 'Opening Balance' },
          [{ $set: { runningBalance: { $subtract: ['$debitAmount', '$creditAmount'] } } }],
          { session }
        );
      }
      if (collectionExists(existingCollections, 'supplierledgers')) {
        await collection(db, 'supplierledgers').updateMany(
          { transactionType: 'Opening Balance' },
          [{ $set: { runningBalance: { $subtract: ['$debitAmount', '$creditAmount'] } } }],
          { session }
        );
      }
      if (collectionExists(existingCollections, 'stockmovements')) {
        await collection(db, 'stockmovements').updateMany(
          openingStockFilter,
          [{
            $set: {
              balance: {
                $cond: [
                  { $eq: ['$type', 'OUT'] },
                  { $multiply: [-1, '$quantity'] },
                  '$quantity',
                ],
              },
            },
          }],
          { session }
        );
      }

      if (collectionExists(existingCollections, 'bankaccounts')) {
        const result = await collection(db, 'bankaccounts').updateMany(
          {},
          [{ $set: { currentBalance: { $ifNull: ['$openingBalance', 0] } } }],
          { session }
        );
        results.selective.bankBalancesReset = result.modifiedCount;
      }
      if (collectionExists(existingCollections, 'cashaccounts')) {
        const result = await collection(db, 'cashaccounts').updateMany(
          {},
          [{
            $set: {
              currentBalance: { $ifNull: ['$openingBalance', 0] },
              lastUpdated: '$$NOW',
            },
          }],
          { session }
        );
        results.selective.cashBalancesReset = result.modifiedCount;
      }

      const preCommitVerification = await verifyResetState(
        db,
        existingCollections,
        openingStockFilter,
        transactionJournalFilter,
        retainedJournalFilter,
        beforeProtectedSnapshot,
        session
      );
      if (preCommitVerification.failures.length > 0) {
        throw new Error(
          `Pre-commit verification failed; transaction will be rolled back:\n- `
          + preCommitVerification.failures.join('\n- ')
        );
      }
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    });
  } finally {
    await session.endSession();
  }
  return results;
};

const compareProtectedSnapshots = (beforeSnapshot, afterSnapshot) => {
  const failures = [];
  for (const [name, beforeCount] of Object.entries(beforeSnapshot.counts)) {
    const afterCount = afterSnapshot.counts[name];
    if (beforeCount !== afterCount) {
      failures.push(`protected collection ${name} changed count: ${beforeCount} -> ${afterCount}`);
    }
  }

  for (const [name, beforeHash] of Object.entries(beforeSnapshot.hashes.protectedCollections)) {
    const afterHash = afterSnapshot.hashes.protectedCollections[name];
    if (beforeHash !== afterHash) failures.push(`protected collection content changed: ${name}`);
  }

  for (const name of [
    'dealerOpenings',
    'dealerOpeningLedgers',
    'supplierOpeningLedgers',
    'openingJournals',
    'retainedNonOpeningJournals',
    'openingStock',
    'legacyOpeningAdjustments',
    'retainedCounters',
  ]) {
    if (beforeSnapshot.hashes[name] !== afterSnapshot.hashes[name]) {
      failures.push(`preserved dataset changed: ${name}`);
    }
  }
  return failures;
};

const verifyResetState = async (
  db,
  existingCollections,
  openingStockFilter,
  transactionJournalFilter,
  retainedJournalFilter,
  beforeProtectedSnapshot,
  session = null
) => {
  const failures = [];
  for (const name of FULL_DELETE_COLLECTIONS) {
    const remaining = await countIfExists(db, existingCollections, name, {}, session);
    if (remaining !== 0) failures.push(`${name} still contains ${remaining} document(s)`);
  }

  const remainingChecks = [
    ['dealerledgers', NON_OPENING_DEALER_LEDGER_FILTER, 'non-opening dealer ledger'],
    ['supplierledgers', NON_OPENING_SUPPLIER_LEDGER_FILTER, 'non-opening supplier ledger'],
    ['journalvouchers', transactionJournalFilter, 'transaction journal'],
    ['stockmovements', { $nor: openingStockFilter.$or }, 'non-opening stock movement'],
    ['stockadjustments', NON_OPENING_ADJUSTMENT_FILTER, 'non-opening stock adjustment'],
    ['notifications', TRANSACTION_NOTIFICATION_FILTER, 'transaction notification'],
    ['counters', GRN_COUNTER_FILTER, 'GRN counter'],
  ];
  for (const [name, filter, label] of remainingChecks) {
    const remaining = await countIfExists(db, existingCollections, name, filter, session);
    if (remaining !== 0) failures.push(`${remaining} ${label} record(s) remain`);
  }

  const dealerResetFailures = await countIfExists(
    db,
    existingCollections,
    'dealers',
    {
      $or: [
        { openingBalanceAllocated: { $ne: 0 } },
        { advanceBalance: { $ne: 0 } },
        { 'advancePayments.0': { $exists: true } },
        { totalOrders: { $ne: 0 } },
        { totalValue: { $ne: 0 } },
        { ledgerPostingVersion: { $ne: 0 } },
        { paidAmount: { $exists: true } },
        { pendingAmount: { $exists: true } },
        { creditLockToken: { $exists: true } },
        { creditLockExpiresAt: { $exists: true } },
      ],
    },
    session
  );
  if (dealerResetFailures > 0) failures.push(`${dealerResetFailures} dealer master reset(s) are incomplete`);

  const dealerOpeningBalanceFailures = await countIfExists(
    db,
    existingCollections,
    'dealerledgers',
    {
      transactionType: 'Opening Balance',
      $expr: {
        $ne: [
          { $ifNull: ['$runningBalance', 0] },
          {
            $subtract: [
              { $ifNull: ['$debitAmount', 0] },
              { $ifNull: ['$creditAmount', 0] },
            ],
          },
        ],
      },
    },
    session
  );
  if (dealerOpeningBalanceFailures > 0) {
    failures.push(`${dealerOpeningBalanceFailures} dealer opening running balance(s) are incorrect`);
  }

  const supplierOpeningBalanceFailures = await countIfExists(
    db,
    existingCollections,
    'supplierledgers',
    {
      transactionType: 'Opening Balance',
      $expr: {
        $ne: [
          { $ifNull: ['$runningBalance', 0] },
          {
            $subtract: [
              { $ifNull: ['$debitAmount', 0] },
              { $ifNull: ['$creditAmount', 0] },
            ],
          },
        ],
      },
    },
    session
  );
  if (supplierOpeningBalanceFailures > 0) {
    failures.push(`${supplierOpeningBalanceFailures} supplier opening running balance(s) are incorrect`);
  }

  const stockBalanceFailures = await countIfExists(
    db,
    existingCollections,
    'stockmovements',
    {
      $and: [
        openingStockFilter,
        { $expr: { $ne: ['$balance', '$quantity'] } },
      ],
    },
    session
  );
  if (stockBalanceFailures > 0) failures.push(`${stockBalanceFailures} opening-stock balance(s) are incorrect`);

  for (const name of ['bankaccounts', 'cashaccounts']) {
    const invalidBalances = await countIfExists(
      db,
      existingCollections,
      name,
      {
        $expr: {
          $ne: [
            { $ifNull: ['$currentBalance', 0] },
            { $ifNull: ['$openingBalance', 0] },
          ],
        },
      },
      session
    );
    if (invalidBalances > 0) failures.push(`${invalidBalances} ${name} balance reset(s) are incorrect`);
  }

  const afterProtectedSnapshot = await snapshotProtectedState(
    db,
    existingCollections,
    openingStockFilter,
    retainedJournalFilter,
    session
  );
  failures.push(...compareProtectedSnapshots(beforeProtectedSnapshot, afterProtectedSnapshot));

  return { failures, afterProtectedSnapshot };
};

let db;
try {
  console.log(`\nConnecting to the hard-locked tenant: ${COMPANY}`);
  db = getCompanyConnection(COMPANY);
  await db.asPromise();

  const actualDatabase = db.db.databaseName;
  if (actualDatabase !== expectedMappedDatabase) {
    throw new Error(
      `Database identity mismatch. Config maps ${COMPANY} to ${expectedMappedDatabase}, connected to ${actualDatabase}.`
    );
  }

  const existingCollections = new Set(
    (await db.db.listCollections({}, { nameOnly: true }).toArray()).map((entry) => entry.name)
  );

  const legacyOpeningAdjustments = await getLegacyOpeningAdjustments(db, existingCollections);
  const legacyOpeningAdjustmentNumbers = legacyOpeningAdjustments
    .map((adjustment) => adjustment.adjustmentNo)
    .filter(Boolean);
  const openingStockClauses = buildOpeningStockClauses(legacyOpeningAdjustmentNumbers);
  const openingStockFilter = { $or: openingStockClauses };
  const voucherIds = (await readSorted(
    db,
    existingCollections,
    'vouchers',
    {},
    { _id: 1 }
  )).map((voucher) => voucher._id);
  const transactionJournalFilter = buildTransactionJournalFilter(voucherIds);
  const retainedJournalFilter = buildManualNonOpeningJournalFilter(transactionJournalFilter);

  const protectedSnapshot = await snapshotProtectedState(
    db,
    existingCollections,
    openingStockFilter,
    retainedJournalFilter
  );
  const integrityIssues = await findOpeningIntegrityIssues(
    db,
    existingCollections,
    openingStockFilter,
    legacyOpeningAdjustments
  );
  const manifest = await buildManifest(
    db,
    existingCollections,
    actualDatabase,
    openingStockFilter,
    legacyOpeningAdjustments,
    integrityIssues,
    protectedSnapshot,
    transactionJournalFilter,
    retainedJournalFilter
  );
  const manifestFingerprint = fingerprint(manifest);

  printManifest(manifest, manifestFingerprint);
  assertLiveSafety(actualDatabase, manifestFingerprint, integrityIssues);

  if (!APPLY) {
    console.log('\nDRY RUN COMPLETE: no writes were executed.');
    if (integrityIssues.length === 0) {
      console.log('\nAfter creating and restore-testing a fresh tenant backup, the reviewed live command is:');
      console.log(
        `node scripts/resetShreeJainTransactions.mjs --apply `
        + `--confirm=${LIVE_CONFIRMATION} --backup-confirmed --maintenance-confirmed `
        + `--expected-db=${actualDatabase} --manifest=${manifestFingerprint}`
      );
    } else {
      console.log('\nLive mode is blocked until every opening-data integrity issue is resolved.');
    }
    process.exitCode = 0;
  } else {
    console.log('\nAll live safeguards passed. Executing one database transaction...');
    const applied = await applyReset(
      db,
      existingCollections,
      openingStockFilter,
      transactionJournalFilter,
      retainedJournalFilter,
      protectedSnapshot,
      manifest
    );
    const verification = await verifyResetState(
      db,
      existingCollections,
      openingStockFilter,
      transactionJournalFilter,
      retainedJournalFilter,
      protectedSnapshot
    );
    if (verification.failures.length > 0) {
      throw new Error(`Post-reset verification failed:\n- ${verification.failures.join('\n- ')}`);
    }
    console.log('\nLIVE RESET COMPLETE AND VERIFIED.');
    console.log(JSON.stringify(applied, null, 2));
  }
} catch (error) {
  console.error(`\nRESET SCRIPT FAILED: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (db) {
    try {
      await db.close();
    } catch (closeError) {
      console.error(`Failed to close database connection: ${closeError.message}`);
      process.exitCode = 1;
    }
  }
}
