const asTimestamp = (value) => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const validInterval = (startValue, endValue) => {
  const start = asTimestamp(startValue);
  const end = asTimestamp(endValue);
  return start != null && end != null && end >= start ? { start, end } : null;
};

const round2 = (value) => Number(Number(value || 0).toFixed(2));

/**
 * Calculate attendance time from immutable punch/session facts.
 *
 * Credited minutes = first completed in-to-last completed out span
 *                    - max(configured lunch, actual inter-session gaps)
 *
 * This means the configured lunch is always excluded, while a longer actual
 * break is excluded in full. Overlapping mixed-source sessions are merged so
 * they cannot double-credit work.
 */
export const calculateAttendanceTime = (
  record,
  { allowedLunchMinutes = 0, allowStoredHoursFallback = true } = {}
) => {
  const sessions = Array.isArray(record?.sessions) ? record.sessions : [];
  const hasSessionFacts = sessions.length > 0;
  const hasOpenSession = Boolean(sessions.some(
    (session) => session?.in?.time && !session?.out?.time
  ) || (!hasSessionFacts && record?.punchIn?.time && !record?.punchOut?.time));

  let intervals = sessions
    .map((session) => validInterval(session?.in?.time, session?.out?.time))
    .filter(Boolean);
  let source = "sessions";

  // Once modern session facts exist they are authoritative. Open-only or
  // malformed sessions must not resurrect stale legacy punches or cached hours.
  if (!hasSessionFacts && intervals.length === 0) {
    const legacy = validInterval(record?.punchIn?.time, record?.punchOut?.time);
    if (legacy) {
      intervals = [legacy];
      source = "legacy-punch";
    }
  }

  if (intervals.length === 0) {
    const storedMinutes = Math.max(0, Number(record?.workingHours || 0) * 60);
    const useStored = !hasSessionFacts && allowStoredHoursFallback && storedMinutes > 0;
    const historicalBreakMinutes = hasSessionFacts
      ? 0
      : Math.max(0, Number(record?.breakMinutes || 0));
    return {
      firstIn: null,
      lastOut: null,
      completedSessionCount: 0,
      hasOpenSession,
      spanMinutes: useStored ? storedMinutes : 0,
      sessionMinutes: useStored ? storedMinutes : 0,
      actualBreakMinutes: historicalBreakMinutes,
      observedBreakMinutes: historicalBreakMinutes,
      // Historical stored values cannot prove a completed inter-session gap,
      // so they never trigger the new excess-break monetary penalty.
      completedActualBreakMinutes: 0,
      configuredLunchMinutes: Math.max(0, Number(allowedLunchMinutes) || 0),
      deductedBreakMinutes: historicalBreakMinutes,
      creditedWorkingMinutes: round2(useStored ? storedMinutes : 0),
      creditedWorkingHours: round2(useStored ? storedMinutes / 60 : 0),
      source: useStored ? "stored-hours-only" : "no-completed-session",
      dataQuality: useStored ? "stored-hours-only" : "no-completed-session",
    };
  }

  intervals.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (!last || interval.start > last.end) {
      merged.push({ ...interval });
    } else if (interval.end > last.end) {
      last.end = interval.end;
    }
  }

  // Compute observable gaps between ALL session in-times (including open ones)
  // and preceding completed out-times. This captures lunch breaks that are
  // visible from punch timestamps even before the final punch-out completes.
  const allSorted = sessions
    .filter((s) => s?.in?.time)
    .map((s) => ({
      inMs: asTimestamp(s.in.time),
      outMs: asTimestamp(s.out?.time),
    }))
    .filter((s) => s.inMs != null)
    .sort((a, b) => a.inMs - b.inMs);
  let observedBreakMinutes = 0;
  for (let i = 1; i < allSorted.length; i++) {
    const prevOut = allSorted[i - 1].outMs;
    const curIn = allSorted[i].inMs;
    if (prevOut != null && curIn > prevOut) {
      observedBreakMinutes += (curIn - prevOut) / 60000;
    }
  }
  observedBreakMinutes = round2(Math.max(0, observedBreakMinutes));

  const firstInMs = merged[0].start;
  const lastOutMs = merged[merged.length - 1].end;
  const spanMinutes = Math.max(0, (lastOutMs - firstInMs) / 60000);
  const sessionMinutes = merged.reduce(
    (total, interval) => total + (interval.end - interval.start) / 60000,
    0
  );
  const completedActualBreakMinutes = Math.max(0, spanMinutes - sessionMinutes);
  // Use observed gaps (from all in/out timestamps, including trailing-open sessions)
  // when they are larger than the pure completed-interval gap. This makes lunch
  // visible even when the return session is still open.
  const effectiveActualBreak = Math.max(completedActualBreakMinutes, observedBreakMinutes);
  const configuredLunchMinutes = Math.max(0, Number(allowedLunchMinutes) || 0);
  // For credited-time/payroll purposes, only completed-interval gaps participate
  // in deduction. Observed open-session gaps are reported for visibility only.
  const deductedBreakMinutes = Math.max(configuredLunchMinutes, completedActualBreakMinutes);
  const creditedWorkingMinutes = Math.max(0, spanMinutes - deductedBreakMinutes);

  return {
    firstIn: new Date(firstInMs),
    lastOut: new Date(lastOutMs),
    completedSessionCount: merged.length,
    hasOpenSession,
    spanMinutes: round2(spanMinutes),
    sessionMinutes: round2(sessionMinutes),
    actualBreakMinutes: round2(effectiveActualBreak),
    observedBreakMinutes: round2(effectiveActualBreak),
    completedActualBreakMinutes: round2(completedActualBreakMinutes),
    configuredLunchMinutes: round2(configuredLunchMinutes),
    deductedBreakMinutes: round2(deductedBreakMinutes),
    creditedWorkingMinutes: round2(creditedWorkingMinutes),
    creditedWorkingHours: round2(creditedWorkingMinutes / 60),
    source,
    dataQuality: "calculated",
  };
};

export default calculateAttendanceTime;
