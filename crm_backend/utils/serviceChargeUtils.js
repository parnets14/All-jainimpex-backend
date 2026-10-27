/**
 * Normalize incoming service charge rows before they are written to an invoice.
 *
 * Rows without a selected master charge (`serviceChargeId`) are discarded, and all
 * numeric/boolean fields are coerced so Mongoose never receives an empty string where
 * an ObjectId or Number is expected (an empty `serviceChargeId` would otherwise raise
 * a CastError and fail the whole invoice save).
 *
 * @param {Array} serviceCharges - Raw `serviceCharges` array from the request body.
 * @returns {Array} Clean array safe to assign to `invoice.serviceCharges`.
 */
export const normalizeServiceCharges = (serviceCharges) => {
  if (!Array.isArray(serviceCharges)) return [];

  return serviceCharges
    // `chargeName` is required by the invoice schema, so a row missing either the
    // master reference or the name is treated as an incomplete, unsubmitted row.
    .filter((charge) => charge && charge.serviceChargeId && charge.chargeName)
    .map((charge) => ({
      serviceChargeId: charge.serviceChargeId,
      chargeName: charge.chargeName || "",
      description: charge.description || "",
      sacCode: charge.sacCode || "",
      amount: Number(charge.amount) || 0,
      taxApplicable: charge.taxApplicable === true,
      taxRate: Number(charge.taxRate) || 0,
      cgst: Number(charge.cgst) || 0,
      sgst: Number(charge.sgst) || 0,
      igst: Number(charge.igst) || 0,
      taxAmount: Number(charge.taxAmount) || 0,
      totalAmount: Number(charge.totalAmount) || 0
    }));
};

/**
 * Resolve service-charge rows against the ServiceChargeMaster before they are
 * written to an invoice.
 *
 * WHY: the identity and the TAX of a service charge belong to the master, not to
 * the request. Previously `chargeName`, `taxApplicable` and `taxRate` were taken
 * from the client payload and never re-read, so a tampered request could send
 * `taxApplicable: false` against a taxable master and pay no GST. The master is
 * now authoritative for those four fields; only `amount` stays user-entered.
 *
 * Also returns `warnings` for rows that were ignored, instead of dropping them
 * silently — a mis-selected row used to vanish with no indication.
 *
 * @param {Array} rawServiceCharges - Raw rows from the request body.
 * @param {Object} ServiceChargeMaster - The company-scoped model.
 * @returns {Promise<{charges: Array, warnings: string[]}>}
 */
export const prepareServiceCharges = async (rawServiceCharges, ServiceChargeMaster) => {
  const warnings = [];
  const rows = Array.isArray(rawServiceCharges) ? rawServiceCharges : [];

  const usable = [];
  rows.forEach((row, index) => {
    if (!row || !row.serviceChargeId || !row.chargeName) {
      warnings.push(`Service charge row ${index + 1} was ignored because no charge was selected from the master.`);
      return;
    }
    usable.push(row);
  });

  if (usable.length === 0) return { charges: [], warnings };

  const ids = [...new Set(usable.map((row) => String(row.serviceChargeId)))]
    .filter((id) => /^[a-f\d]{24}$/i.test(id));

  const masters = ids.length && ServiceChargeMaster
    ? await ServiceChargeMaster.find({ _id: { $in: ids } })
      .select('chargeName description sacCode taxApplicable taxRate isActive')
      .lean()
    : [];
  const byId = new Map(masters.map((master) => [String(master._id), master]));

  const charges = [];
  for (const row of usable) {
    const master = byId.get(String(row.serviceChargeId));

    if (!master) {
      // Keep the row rather than losing a charge the user entered, but say so.
      warnings.push(`Service charge "${row.chargeName}" references a master that no longer exists; the submitted values were used.`);
      charges.push(...normalizeServiceCharges([row]));
      continue;
    }

    if (master.isActive === false) {
      warnings.push(`Service charge "${master.chargeName}" is inactive in the master but was still applied.`);
    }

    // Master wins for identity and tax; `amount` remains the user's input.
    charges.push(...normalizeServiceCharges([{
      ...row,
      chargeName: master.chargeName,
      description: master.description || row.description || '',
      sacCode: master.sacCode || '',
      taxApplicable: master.taxApplicable === true,
      taxRate: master.taxRate || 0
    }]));
  }

  return { charges, warnings };
};

export default { normalizeServiceCharges, prepareServiceCharges };
