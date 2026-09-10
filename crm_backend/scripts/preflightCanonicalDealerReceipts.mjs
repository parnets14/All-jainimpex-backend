import 'dotenv/config';
import { closeAllConnections, getCompanyConnection, isValidCompany } from '../config/multiDatabase.js';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.length ? value.join('=') : true];
  })
);

const company = String(args.get('company') || '');
const apply = args.get('apply') === true;
const confirmed = args.get('confirm') === 'CANONICAL-PAYMENTS';

if (!company || !isValidCompany(company)) {
  console.error('Usage (dry run): node scripts/preflightCanonicalDealerReceipts.mjs --company=<company>');
  console.error('Apply safe backfills: add --apply --confirm=CANONICAL-PAYMENTS');
  process.exitCode = 1;
} else if (apply && !confirmed) {
  console.error('Refusing writes without --confirm=CANONICAL-PAYMENTS');
  process.exitCode = 1;
} else {
  const duplicateGroups = async (collection, key, match = {}) => collection.aggregate([
    { $match: match },
    { $group: { _id: `$${key}`, count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { _id: { $ne: null }, count: { $gt: 1 } } },
    { $limit: 25 },
  ]).toArray();

  const sample = (collection, filter, projection) => collection
    .find(filter)
    .project(projection)
    .limit(25)
    .toArray();

  const indexByKey = (indexes, key) => indexes.find(
    (index) => JSON.stringify(index.key) === JSON.stringify(key)
  );

  const run = async () => {
    const connection = getCompanyConnection(company);
    await connection.asPromise();
    const db = connection.db;

    const sourceLinkIssues = (collectionName, match, sourceType, projection) => db
      .collection(collectionName)
      .aggregate([
        { $match: match },
        { $set: { canonicalReceiptIds: { $ifNull: ['$receiptVoucherIds', []] } } },
        {
          $lookup: {
            from: 'vouchers',
            let: {
              receiptIds: '$canonicalReceiptIds',
              expectedSourceId: { $toString: '$_id' },
              expectedDealerId: '$dealer',
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $in: ['$_id', '$$receiptIds'] },
                      { $eq: ['$sourceType', sourceType] },
                      { $eq: ['$sourceId', '$$expectedSourceId'] },
                      { $eq: ['$partyType', 'Dealer'] },
                      { $eq: ['$partyId', '$$expectedDealerId'] },
                      { $eq: ['$voucherType', 'Receipt'] },
                      { $eq: ['$status', 'Posted'] },
                    ],
                  },
                },
              },
            ],
            as: 'resolvedReceiptVouchers',
          },
        },
        {
          $match: {
            $expr: {
              $or: [
                { $eq: [{ $size: '$canonicalReceiptIds' }, 0] },
                {
                  $ne: [
                    { $size: '$canonicalReceiptIds' },
                    { $size: '$resolvedReceiptVouchers' },
                  ],
                },
                { $ne: [{ $type: '$receiptPostedAt' }, 'date'] },
              ],
            },
          },
        },
        { $project: projection },
        { $limit: 25 },
      ])
      .toArray();

    const [
      duplicateCheques,
      duplicateVoucherKeys,
      duplicateLedgerKeys,
      duplicateJournalKeys,
      duplicateChequePostingKeys,
      duplicateActiveDeliveryClaims,
      cashAccounts,
      activeLegacyAllocationsWithoutStatus,
      activeAllocationsWithoutStableVoucherLinks,
      advancesWithAnyUnlinkedAdjustment,
      chequesWithInvalidCanonicalLinks,
      approvedDealerPaymentsWithInvalidReceiptLinks,
      verifiedDeliveryPaymentsWithInvalidReceiptLinks,
      postedSeCollectionsWithInvalidReceiptLinks,
      chequeIndexes,
    ] = await Promise.all([
      duplicateGroups(db.collection('cheques'), 'chequeNo', { isDeleted: { $ne: true } }),
      duplicateGroups(db.collection('vouchers'), 'postingKey', { postingKey: { $type: 'string' } }),
      duplicateGroups(db.collection('dealerledgers'), 'postingKey', { postingKey: { $type: 'string' } }),
      duplicateGroups(db.collection('journalvouchers'), 'postingKey', { postingKey: { $type: 'string' } }),
      duplicateGroups(db.collection('cheques'), 'postingKey', { postingKey: { $type: 'string' } }),
      duplicateGroups(db.collection('deliverypayments'), 'deliveryAssignment', {
        verificationStatus: { $in: ['pending', 'verified'] },
      }),
      db.collection('cashaccounts').find({}).project({
        _id: 1,
        singletonKey: 1,
        currentBalance: 1,
      }).toArray(),
      db.collection('paymentallocations').countDocuments({
        status: { $ne: 'Reversed' },
        $or: [{ status: null }, { status: { $exists: false } }],
      }),
      db.collection('paymentallocations').aggregate([
        { $match: { status: { $ne: 'Reversed' } } },
        {
          $lookup: {
            from: 'vouchers',
            localField: 'voucherId',
            foreignField: '_id',
            as: 'voucher',
          },
        },
        { $set: { voucher: { $first: '$voucher' } } },
        {
          $set: {
            allocationRows: { $ifNull: ['$allocations', []] },
            linkedRows: {
              $filter: {
                input: { $ifNull: ['$voucher.allocations', []] },
                as: 'voucherRow',
                cond: { $eq: ['$$voucherRow.paymentAllocationId', '$_id'] },
              },
            },
          },
        },
        {
          $set: {
            everyAllocationRowLinkedExactlyOnce: {
              $allElementsTrue: [{
                $map: {
                  input: '$allocationRows',
                  as: 'allocationRow',
                  in: {
                    $eq: [
                      {
                        $size: {
                          $filter: {
                            input: '$linkedRows',
                            as: 'voucherRow',
                            cond: {
                              $eq: ['$$voucherRow.allocationRowId', '$$allocationRow._id'],
                            },
                          },
                        },
                      },
                      1,
                    ],
                  },
                },
              }],
            },
          },
        },
        {
          $match: {
            $expr: {
              $or: [
                { $eq: ['$voucher', null] },
                { $ne: ['$voucher.status', 'Posted'] },
                { $eq: [{ $size: '$allocationRows' }, 0] },
                {
                  $ne: [
                    { $size: '$linkedRows' },
                    { $size: '$allocationRows' },
                  ],
                },
                { $eq: ['$everyAllocationRowLinkedExactlyOnce', false] },
              ],
            },
          },
        },
        {
          $project: {
            _id: 1,
            allocationNumber: 1,
            voucherId: 1,
            voucherNumber: 1,
            linkedVoucherNumber: '$voucher.voucherNumber',
          },
        },
        { $limit: 25 },
      ]).toArray(),
      sample(db.collection('dealerpayments'), {
        paymentCategory: 'Advance Payment',
        'advanceDetails.adjustedAgainstInvoices': {
          $elemMatch: {
            $or: [
              { paymentAllocationId: { $exists: false } },
              { paymentAllocationId: null },
              { allocationRowId: { $exists: false } },
              { allocationRowId: null },
            ],
          },
        },
      }, { paymentNumber: 1, status: 1, advanceDetails: 1 }),
      db.collection('cheques').aggregate([
        { $match: { isDeleted: { $ne: true } } },
        {
          $lookup: {
            from: 'vouchers',
            localField: 'receiptVoucher',
            foreignField: '_id',
            as: 'receiptVoucherDocument',
          },
        },
        {
          $lookup: {
            from: 'journalvouchers',
            localField: 'receiptJournal',
            foreignField: '_id',
            as: 'receiptJournalDocument',
          },
        },
        {
          $lookup: {
            from: 'journalvouchers',
            localField: 'clearanceJournal',
            foreignField: '_id',
            as: 'clearanceJournalDocument',
          },
        },
        {
          $lookup: {
            from: 'bankaccounts',
            localField: 'depositBankAccount',
            foreignField: '_id',
            as: 'depositBankAccountDocument',
          },
        },
        {
          $set: {
            receiptVoucherDocument: { $first: '$receiptVoucherDocument' },
            receiptJournalDocument: { $first: '$receiptJournalDocument' },
            clearanceJournalDocument: { $first: '$clearanceJournalDocument' },
            depositBankAccountDocument: { $first: '$depositBankAccountDocument' },
          },
        },
        {
          $lookup: {
            from: 'journalvouchers',
            localField: 'receiptJournalDocument.reversedBy',
            foreignField: '_id',
            as: 'receiptReversalDocument',
          },
        },
        {
          $lookup: {
            from: 'journalvouchers',
            localField: 'bounceJournal',
            foreignField: '_id',
            as: 'bounceJournalDocument',
          },
        },
        {
          $lookup: {
            from: 'journalvouchers',
            localField: 'clearanceJournalDocument.reversedBy',
            foreignField: '_id',
            as: 'clearanceReversalDocument',
          },
        },
        {
          $set: {
            receiptReversalDocument: { $first: '$receiptReversalDocument' },
            bounceJournalDocument: { $first: '$bounceJournalDocument' },
            clearanceReversalDocument: { $first: '$clearanceReversalDocument' },
          },
        },
        {
          $match: {
            $expr: {
              $or: [
                { $ne: [{ $type: '$postingKey' }, 'string'] },
                { $eq: ['$postingKey', ''] },
                { $eq: ['$receiptVoucherDocument', null] },
                { $eq: ['$receiptJournalDocument', null] },
                { $ne: ['$receiptVoucherDocument.transactionMode', 'Cheque'] },
                { $ne: ['$receiptVoucherDocument.voucherType', 'Receipt'] },
                { $ne: ['$receiptVoucherDocument.partyType', 'Dealer'] },
                { $ne: ['$receiptVoucherDocument.partyId', '$dealerId'] },
                { $ne: ['$receiptVoucherDocument.journalVoucher', '$receiptJournal'] },
                { $ne: ['$receiptJournalDocument.referenceId', '$receiptVoucher'] },
                {
                  $and: [
                    { $eq: [{ $type: '$clearanceJournal' }, 'objectId'] },
                    { $ne: ['$clearanceJournalDocument.referenceId', '$_id'] },
                  ],
                },
                {
                  $and: [
                    { $ne: ['$status', 'Bounced'] },
                    { $ne: ['$receiptVoucherDocument.status', 'Posted'] },
                  ],
                },
                {
                  $and: [
                    { $ne: ['$status', 'Bounced'] },
                    {
                      $or: [
                        { $eq: [{ $type: '$receiptJournalDocument.reversedBy' }, 'objectId'] },
                        { $eq: [{ $type: '$bounceJournal' }, 'objectId'] },
                      ],
                    },
                  ],
                },
                {
                  $and: [
                    { $eq: ['$status', 'Bounced'] },
                    {
                      $or: [
                        { $not: [{ $in: ['$receiptVoucherDocument.status', ['Reversed', 'Cancelled']] }] },
                        { $eq: ['$receiptReversalDocument', null] },
                        { $eq: ['$bounceJournalDocument', null] },
                        { $ne: ['$receiptReversalDocument._id', '$bounceJournal'] },
                        { $ne: ['$bounceJournalDocument._id', '$receiptJournalDocument.reversedBy'] },
                        { $ne: ['$receiptReversalDocument.reversalOf', '$receiptJournal'] },
                        { $ne: ['$receiptReversalDocument.referenceId', '$receiptVoucher'] },
                      ],
                    },
                  ],
                },
                {
                  $and: [
                    { $ne: [{ $type: '$depositBankAccount' }, 'missing'] },
                    { $ne: ['$depositBankAccount', null] },
                    { $eq: ['$depositBankAccountDocument', null] },
                  ],
                },
                {
                  $and: [
                    { $ne: [{ $type: '$clearanceJournal' }, 'missing'] },
                    { $ne: ['$clearanceJournal', null] },
                    { $eq: ['$clearanceJournalDocument', null] },
                  ],
                },
                {
                  $and: [
                    { $eq: ['$status', 'Cleared'] },
                    {
                      $or: [
                        { $eq: ['$depositBankAccountDocument', null] },
                        { $eq: ['$clearanceJournalDocument', null] },
                        { $eq: [{ $type: '$clearanceJournalDocument.reversedBy' }, 'objectId'] },
                      ],
                    },
                  ],
                },
                {
                  $and: [
                    { $eq: ['$status', 'Bounced'] },
                    { $eq: [{ $type: '$clearanceJournal' }, 'objectId'] },
                    {
                      $or: [
                        { $eq: ['$clearanceReversalDocument', null] },
                        { $ne: ['$clearanceReversalDocument._id', '$clearanceJournalDocument.reversedBy'] },
                        { $ne: ['$clearanceReversalDocument.reversalOf', '$clearanceJournal'] },
                        { $ne: ['$clearanceReversalDocument.referenceId', '$_id'] },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
        {
          $project: {
            chequeNo: 1,
            status: 1,
            dealerId: 1,
            receiptVoucher: 1,
            receiptJournal: 1,
            bounceJournal: 1,
            depositBankAccount: 1,
            clearanceJournal: 1,
            postingKey: 1,
          },
        },
        { $limit: 25 },
      ]).toArray(),
      sourceLinkIssues(
        'dealerpayments',
        { status: 'Approved' },
        'DealerPayment',
        {
          paymentNumber: 1,
          paymentCategory: 1,
          dealer: 1,
          status: 1,
          receiptVoucherIds: 1,
          receiptPostedAt: 1,
        }
      ),
      sourceLinkIssues(
        'deliverypayments',
        { verificationStatus: 'verified' },
        'DeliveryPayment',
        {
          deliveryAssignment: 1,
          dealer: 1,
          verificationStatus: 1,
          receiptVoucherIds: 1,
          receiptPostedAt: 1,
        }
      ),
      sourceLinkIssues(
        'collections',
        {
          status: 'Approved',
          $or: [
            { receiptPostedAt: { $type: 'date' } },
            { voucherId: { $exists: true, $ne: null } },
            { 'receiptVoucherIds.0': { $exists: true } },
          ],
        },
        'SECollection',
        {
          collectionNumber: 1,
          dealer: 1,
          status: 1,
          voucherId: 1,
          receiptVoucherIds: 1,
          receiptPostedAt: 1,
        }
      ),
      db.collection('cheques').indexes().catch(() => []),
    ]);

    const chequeNumberIndex = indexByKey(chequeIndexes, { chequeNo: 1 });
    const cashAccountSingletonConflicts = (
      cashAccounts.length > 1
      || cashAccounts.some(
        (account) => account.singletonKey != null && account.singletonKey !== 'primary'
      )
    ) ? cashAccounts : [];
    const blockers = {
      duplicateCheques,
      duplicateVoucherKeys,
      duplicateLedgerKeys,
      duplicateJournalKeys,
      duplicateChequePostingKeys,
      duplicateActiveDeliveryClaims,
      cashAccountSingletonConflicts,
      chequeNumberIndexNotUnique: chequeNumberIndex?.unique === true ? [] : [chequeNumberIndex || 'missing'],
      activeAllocationsWithoutStableVoucherLinks,
      advancesWithAnyUnlinkedAdjustment,
      chequesWithInvalidCanonicalLinks,
      approvedDealerPaymentsWithInvalidReceiptLinks,
      verifiedDeliveryPaymentsWithInvalidReceiptLinks,
      postedSeCollectionsWithInvalidReceiptLinks,
    };
    const blockerCount = Object.values(blockers).reduce(
      (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
      0
    );

    console.log(JSON.stringify({
      company,
      mode: apply ? 'apply-safe-backfills' : 'dry-run',
      blockerCount,
      blockers,
      migrationRequired: {
        activeLegacyAllocationsWithoutLifecycleStatus: activeLegacyAllocationsWithoutStatus,
      },
      cashAccounts,
    }, null, 2));

    if (!apply) {
      console.log('\nDry run only. No data or indexes were changed.');
      return;
    }
    if (blockerCount > 0) {
      throw new Error('Blocking legacy links, duplicates, or index conflicts require reviewed migration before writes');
    }

    const session = await connection.startSession();
    try {
      await session.withTransaction(async () => {
        await db.collection('paymentallocations').updateMany({
          $or: [{ status: null }, { status: { $exists: false } }],
        }, {
          $set: { status: 'Active' },
        }, { session });

        if (cashAccounts.length === 1 && !cashAccounts[0].singletonKey) {
          await db.collection('cashaccounts').updateOne(
            { _id: cashAccounts[0]._id, $or: [{ singletonKey: null }, { singletonKey: { $exists: false } }] },
            { $set: { singletonKey: 'primary' } },
            { session }
          );
        }
      });
    } finally {
      await session.endSession();
    }
    console.log('Safe lifecycle and singleton backfills committed. Stable financial links were not guessed.');
  };

  run()
    .catch((error) => {
      console.error(`Preflight failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeAllConnections();
    });
}
