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

export default { normalizeServiceCharges };
