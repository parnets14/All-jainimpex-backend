export const ABSENT_REVIEW_GRACE_DAYS = 15;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Return UTC instants for the current IST calendar boundaries.
 * Pending records from prior months remain manually reviewable through the
 * full 15th and expire at 00:00 IST on the 16th.
 */
export const getAbsentReviewPolicyBounds = (now = new Date()) => {
  const instant = new Date(now);
  const istNow = new Date(instant.getTime() + IST_OFFSET_MS);
  const year = istNow.getUTCFullYear();
  const month = istNow.getUTCMonth();
  const day = istNow.getUTCDate();
  const todayStartUtc = new Date(Date.UTC(year, month, day) - IST_OFFSET_MS);

  const currentMonthStartUtc = new Date(Date.UTC(year, month, 1) - IST_OFFSET_MS);
  const previousMonthStartUtc = new Date(Date.UTC(year, month - 1, 1) - IST_OFFSET_MS);
  const deadlinePassed = day > ABSENT_REVIEW_GRACE_DAYS;
  const reviewableFromUtc = deadlinePassed ? currentMonthStartUtc : previousMonthStartUtc;

  return {
    istNow,
    todayStartUtc,
    yesterdayEndUtc: new Date(todayStartUtc.getTime() - 1),
    currentMonthStartUtc,
    previousMonthStartUtc,
    reviewableFromUtc,
    deadlinePassed,
  };
};

export const isManualAbsentReviewAllowed = (attendanceDate, now = new Date()) => {
  const { reviewableFromUtc } = getAbsentReviewPolicyBounds(now);
  return new Date(attendanceDate) >= reviewableFromUtc;
};
