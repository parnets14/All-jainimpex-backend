export const ABSENT_REVIEW_GRACE_DAYS = 15;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Return UTC instants for the rolling IST attendance-review window.
 * The cutoff date itself remains reviewable: at IST midnight on September 2,
 * August 18 is reviewable and August 17 (or earlier) has expired.
 */
export const getAbsentReviewPolicyBounds = (now = new Date()) => {
  const instant = new Date(now);
  const istNow = new Date(instant.getTime() + IST_OFFSET_MS);
  const year = istNow.getUTCFullYear();
  const month = istNow.getUTCMonth();
  const day = istNow.getUTCDate();
  const todayStartUtc = new Date(Date.UTC(year, month, day) - IST_OFFSET_MS);
  const reviewableFromUtc = new Date(
    todayStartUtc.getTime() - ABSENT_REVIEW_GRACE_DAYS * DAY_MS
  );

  return {
    istNow,
    todayStartUtc,
    yesterdayEndUtc: new Date(todayStartUtc.getTime() - 1),
    reviewableFromUtc,
  };
};

export const getAbsentReviewDeadline = (attendanceDate) => {
  const attendanceStartUtc = new Date(attendanceDate);
  return new Date(
    attendanceStartUtc.getTime() + (ABSENT_REVIEW_GRACE_DAYS + 1) * DAY_MS - 1
  );
};

export const isManualAbsentReviewAllowed = (attendanceDate, now = new Date()) => {
  const { reviewableFromUtc } = getAbsentReviewPolicyBounds(now);
  return new Date(attendanceDate) >= reviewableFromUtc;
};
