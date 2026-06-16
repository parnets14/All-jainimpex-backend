import { fixedAssetSchema } from '../models/FixedAsset.js';
import { journalVoucherSchema } from '../models/JournalVoucher.js';
import { accountMasterSchema } from '../models/AccountMaster.js';
import { assertPeriodOpen, handlePeriodLockError } from '../services/periodLockService.js';

const getModels = (dbConnection) => ({
  FixedAsset: dbConnection.models.FixedAsset || dbConnection.model('FixedAsset', fixedAssetSchema),
  JournalVoucher: dbConnection.models.JournalVoucher || dbConnection.model('JournalVoucher', journalVoucherSchema),
  AccountMaster: dbConnection.models.AccountMaster || dbConnection.model('AccountMaster', accountMasterSchema),
});

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const DAY = 24 * 60 * 60 * 1000;
const getFYStartDate = (fy) => new Date(parseInt(fy.split('-')[0], 10), 3, 1);
const getFYEndDate = (fy) => new Date(parseInt(fy.split('-')[0], 10) + 1, 2, 31, 23, 59, 59, 999);

// ── CRUD ─────────────────────────────────────────────────────────────────────

export const getFixedAssets = async (req, res) => {
  try {
    const { FixedAsset } = getModels(req.dbConnection);
    const { status, category, search } = req.query;
    const query = {};
    if (status) query.status = status;
    if (category) query.assetCategory = category;
    if (search) {
      query.$or = [
        { assetName: { $regex: search, $options: 'i' } },
        { assetCode: { $regex: search, $options: 'i' } },
        { serialNumber: { $regex: search, $options: 'i' } },
      ];
    }
    const assets = await FixedAsset.find(query).sort({ purchaseDate: -1 }).lean();

    const summary = assets.reduce(
      (a, x) => ({
        grossValue: round2(a.grossValue + (x.purchaseValue || 0)),
        accumulatedDepreciation: round2(a.accumulatedDepreciation + (x.accumulatedDepreciation || 0)),
        netValue: round2(a.netValue + ((x.purchaseValue || 0) - (x.accumulatedDepreciation || 0))),
        count: a.count + 1,
      }),
      { grossValue: 0, accumulatedDepreciation: 0, netValue: 0, count: 0 }
    );

    res.json({ success: true, data: assets, summary });
  } catch (error) {
    console.error('Get fixed assets error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createFixedAsset = async (req, res) => {
  try {
    const { FixedAsset } = getModels(req.dbConnection);
    const body = { ...req.body };
    // currentValue defaults to purchaseValue minus any opening accumulated depreciation
    if (body.currentValue == null) {
      body.currentValue = (body.purchaseValue || 0) - (body.accumulatedDepreciation || 0);
    }
    body.createdBy = req.user?._id;
    const asset = await FixedAsset.create(body);
    res.status(201).json({ success: true, message: 'Fixed asset created', data: asset });
  } catch (error) {
    console.error('Create fixed asset error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateFixedAsset = async (req, res) => {
  try {
    const { FixedAsset } = getModels(req.dbConnection);
    const body = { ...req.body };
    delete body.assetCode;
    delete body.accumulatedDepreciation; // changed only via depreciation runs
    const asset = await FixedAsset.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
    if (!asset) return res.status(404).json({ success: false, message: 'Fixed asset not found' });
    res.json({ success: true, message: 'Fixed asset updated', data: asset });
  } catch (error) {
    console.error('Update fixed asset error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteFixedAsset = async (req, res) => {
  try {
    const { FixedAsset } = getModels(req.dbConnection);
    const asset = await FixedAsset.findByIdAndDelete(req.params.id);
    if (!asset) return res.status(404).json({ success: false, message: 'Fixed asset not found' });
    res.json({ success: true, message: 'Fixed asset deleted' });
  } catch (error) {
    console.error('Delete fixed asset error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Depreciation ───────────────────────────────────────────────────────────

// Compute depreciation for a single asset for a financial year (prorated by days held)
const computeAssetDepreciation = (asset, fyStart, fyEnd) => {
  if (asset.depreciationMethod === 'None' || asset.status !== 'Active') return 0;
  const purchase = new Date(asset.purchaseDate);
  if (purchase > fyEnd) return 0; // not yet acquired in this FY

  const rate = asset.depreciationRate || 0;
  const gross = asset.purchaseValue || 0;
  const accumulated = asset.accumulatedDepreciation || 0;
  const wdv = gross - accumulated;
  if (wdv <= 0) return 0;

  let annual = 0;
  if (asset.depreciationMethod === 'Written Down Value') {
    annual = rate > 0 ? (wdv * rate) / 100 : 0;
  } else {
    // Straight Line
    if (rate > 0) annual = (gross * rate) / 100;
    else if (asset.usefulLife > 0) annual = gross / asset.usefulLife;
  }
  if (annual <= 0) return 0;

  // Prorate by days held within the FY
  const periodStart = purchase > fyStart ? purchase : fyStart;
  const daysHeld = Math.max(0, Math.floor((fyEnd - periodStart) / DAY) + 1);
  const totalDays = Math.floor((fyEnd - fyStart) / DAY) + 1;
  let dep = annual * (daysHeld / totalDays);

  // Never depreciate below zero book value
  dep = Math.min(dep, wdv);
  return round2(dep);
};

// @desc    Preview depreciation for a financial year (no posting)
// @route   GET /api/fixed-assets/depreciation/preview?financialYear=2025-26
export const previewDepreciation = async (req, res) => {
  try {
    const { FixedAsset, JournalVoucher } = getModels(req.dbConnection);
    const { financialYear } = req.query;
    if (!financialYear || !/^\d{4}-\d{2}$/.test(financialYear)) {
      return res.status(400).json({ success: false, message: 'Valid financialYear required, e.g. "2025-26"' });
    }
    const fyStart = getFYStartDate(financialYear);
    const fyEnd = getFYEndDate(financialYear);

    const alreadyPosted = await JournalVoucher.findOne({
      voucherType: 'Depreciation',
      referenceNumber: `DEP-${financialYear}`,
      status: 'Posted',
    });

    const assets = await FixedAsset.find({ status: 'Active' }).lean();
    const lines = assets
      .map((a) => ({
        assetId: a._id,
        assetName: a.assetName,
        assetCode: a.assetCode,
        method: a.depreciationMethod,
        rate: a.depreciationRate,
        grossValue: round2(a.purchaseValue || 0),
        openingAccumulated: round2(a.accumulatedDepreciation || 0),
        depreciation: computeAssetDepreciation(a, fyStart, fyEnd),
      }))
      .filter((l) => l.depreciation > 0);

    const total = round2(lines.reduce((s, l) => s + l.depreciation, 0));

    res.json({
      success: true,
      data: {
        financialYear,
        alreadyPosted: !!alreadyPosted,
        lines,
        totalDepreciation: total,
      },
    });
  } catch (error) {
    console.error('Preview depreciation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get or create a posting account by name within a group
const getOrCreateAccount = async (AccountMaster, accountName, accountGroup, accountType, obType) => {
  let acc = await AccountMaster.findOne({ accountName });
  if (!acc) {
    acc = await AccountMaster.create({
      accountName, accountGroup, accountType,
      openingBalance: 0, openingBalanceType: obType, isSystem: true,
      description: 'Auto-created for depreciation postings',
    });
  }
  return acc;
};

// @desc    Run (post) depreciation for a financial year
// @route   POST /api/fixed-assets/depreciation/run  { financialYear }
export const runDepreciation = async (req, res) => {
  try {
    const { FixedAsset, JournalVoucher, AccountMaster } = getModels(req.dbConnection);
    const { financialYear } = req.body;
    if (!financialYear || !/^\d{4}-\d{2}$/.test(financialYear)) {
      return res.status(400).json({ success: false, message: 'Valid financialYear required, e.g. "2025-26"' });
    }
    const fyStart = getFYStartDate(financialYear);
    const fyEnd = getFYEndDate(financialYear);

    // Block if the year is closed
    await assertPeriodOpen(req.dbConnection, fyEnd, 'depreciation run');

    // Prevent double-run for the same FY
    const existing = await JournalVoucher.findOne({
      voucherType: 'Depreciation',
      referenceNumber: `DEP-${financialYear}`,
      status: 'Posted',
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Depreciation for ${financialYear} has already been posted (voucher ${existing.voucherNumber}).`,
      });
    }

    const assets = await FixedAsset.find({ status: 'Active' });
    const perAsset = [];
    let totalDep = 0;
    for (const a of assets) {
      const dep = computeAssetDepreciation(a, fyStart, fyEnd);
      if (dep > 0) {
        perAsset.push({ asset: a, dep });
        totalDep = round2(totalDep + dep);
      }
    }

    if (totalDep <= 0) {
      return res.status(400).json({ success: false, message: 'No depreciation to post for this year.' });
    }

    // Accounts
    const depExpense = await getOrCreateAccount(AccountMaster, 'Depreciation', 'Indirect Expenses', 'Expense', 'Dr');
    const accDep = await getOrCreateAccount(AccountMaster, 'Accumulated Depreciation', 'Fixed Assets', 'Asset', 'Cr');

    // Post the journal voucher (Dr Depreciation expense / Cr Accumulated Depreciation)
    const year = fyEnd.getFullYear();
    const month = String(fyEnd.getMonth() + 1).padStart(2, '0');
    const prefix = `JV-${year}${month}`;
    const lastJournal = await JournalVoucher.findOne({ voucherNumber: { $regex: `^${prefix}` } }).sort({ voucherNumber: -1 });
    let seq = 1;
    if (lastJournal?.voucherNumber) {
      const n = parseInt(lastJournal.voucherNumber.split('-').pop());
      if (!isNaN(n)) seq = n + 1;
    }
    const voucherNumber = `${prefix}-${String(seq).padStart(4, '0')}`;

    await JournalVoucher.create({
      voucherNumber,
      voucherDate: fyEnd,
      financialYear,
      voucherType: 'Depreciation',
      referenceType: 'Manual',
      referenceNumber: `DEP-${financialYear}`,
      entries: [
        { accountId: depExpense._id, accountName: depExpense.accountName, accountGroup: depExpense.accountGroup, debit: totalDep, credit: 0, narration: `Depreciation for FY ${financialYear}` },
        { accountId: accDep._id, accountName: accDep.accountName, accountGroup: accDep.accountGroup, debit: 0, credit: totalDep, narration: `Accumulated depreciation FY ${financialYear}` },
      ],
      totalDebit: totalDep,
      totalCredit: totalDep,
      totalAmount: totalDep,
      narration: `Depreciation run for FY ${financialYear}`,
      isAutoGenerated: true,
      createdBy: req.user?._id,
    });

    // Update each asset's accumulated depreciation + net book value
    for (const { asset, dep } of perAsset) {
      asset.accumulatedDepreciation = round2((asset.accumulatedDepreciation || 0) + dep);
      asset.currentValue = round2((asset.purchaseValue || 0) - asset.accumulatedDepreciation);
      await asset.save();
    }

    res.json({
      success: true,
      message: `Posted depreciation of ₹${totalDep.toLocaleString('en-IN')} for FY ${financialYear} (voucher ${voucherNumber}).`,
      data: { financialYear, voucherNumber, totalDepreciation: totalDep, assetsAffected: perAsset.length },
    });
  } catch (error) {
    if (handlePeriodLockError(error, res)) return;
    console.error('Run depreciation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
