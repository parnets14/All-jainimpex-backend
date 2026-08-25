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
  const hasOpenSession = sessions.some(
    (session) => session?.in?.time && !session?.out?.time
  );

  let intervals = sessions
    .map((session) => validInterval(session?.in?.time, session?.out?.time))
    .filter(Boolean);
  let source = "sessions";

  if (intervals.length === 0) {
    const legacy = validInterval(record?.punchIn?.time, record?.punchOut?.time);
    if (legacy) {
      intervals = [legacy];
      source = "legacy-punch";
    }
  }

  if (intervals.length === 0) {
    const storedMinutes = Math.max(0, Number(record?.workingHours || 0) * 60);
    const useStored = allowStoredHoursFallback && storedMinutes > 0;
    return {
      firstIn: null,
      lastOut: null,
      completedSessionCount: 0,
      hasOpenSession,
      spanMinutes: useStored ? storedMinutes : 0,
      sessionMinutes: useStored ? storedMinutes : 0,
      actualBreakMinutes: Math.max(0, Number(record?.breakMinutes || 0)),
      configuredLunchMinutes: Math.max(0, Number(allowedLunchMinutes) || 0),
      deductedBreakMinutes: Math.max(0, Number(record?.breakMinutes || 0)),
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

  const firstInMs = merged[0].start;
  const lastOutMs = merged[merged.length - 1].end;
  const spanMinutes = Math.max(0, (lastOutMs - firstInMs) / 60000);
  const sessionMinutes = merged.reduce(
    (total, interval) => total + (interval.end - interval.start) / 60000,
    0
  );
  const actualBreakMinutes = Math.max(0, spanMinutes - sessionMinutes);
  const configuredLunchMinutes = Math.max(0, Number(allowedLunchMinutes) || 0);
  const deductedBreakMinutes = Math.max(configuredLunchMinutes, actualBreakMinutes);
  const creditedWorkingMinutes = Math.max(0, spanMinutes - deductedBreakMinutes);

  return {
    firstIn: new Date(firstInMs),
    lastOut: new Date(lastOutMs),
    completedSessionCount: merged.length,
    hasOpenSession,
    spanMinutes: round2(spanMinutes),
    sessionMinutes: round2(sessionMinutes),
    actualBreakMinutes: round2(actualBreakMinutes),
    configuredLunchMinutes: round2(configuredLunchMinutes),
    deductedBreakMinutes: round2(deductedBreakMinutes),
    creditedWorkingMinutes: round2(creditedWorkingMinutes),
    creditedWorkingHours: round2(creditedWorkingMinutes / 60),
    source,
    dataQuality: "calculated",
  };
};

export default calculateAttendanceTime;
