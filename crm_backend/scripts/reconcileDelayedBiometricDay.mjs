import 'dotenv/config';
import { getCompanyConnection } from '../config/multiDatabase.js';
import { biometricPunchSchema } from '../models/BiometricPunch.js';
import { attendanceSchema } from '../models/Attendance.js';
import { processBiometricPunches } from '../utils/biometricAttendance.js';

const company = process.argv[2] || 'jain-impex';
const day = process.argv[3] || '2026-09-01';
const apply = process.argv.includes('--apply');

const parseIstDay = (dateString) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) throw new Error(`Invalid date "${dateString}". Use YYYY-MM-DD.`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const dayOfMonth = Number(match[3]);
  const calendarDay = new Date(Date.UTC(year, month - 1, dayOfMonth));
  if (
    calendarDay.getUTCFullYear() !== year ||
    calendarDay.getUTCMonth() !== month - 1 ||
    calendarDay.getUTCDate() !== dayOfMonth
  ) {
    throw new Error(`Invalid calendar date "${dateString}".`);
  }

  const start = new Date(calendarDay.getTime() - 5.5 * 60 * 60 * 1000);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
};

const run = async () => {
  const { start, end } = parseIstDay(day);
  const db = getCompanyConnection(company);
  await db.asPromise();

  const BiometricPunch = db.models.BiometricPunch || db.model('BiometricPunch', biometricPunchSchema);
  const Attendance = db.models.Attendance || db.model('Attendance', attendanceSchema);

  const [punchCount, processedCount, autoPaidCount] = await Promise.all([
    BiometricPunch.countDocuments({ punchAt: { $gte: start, $lt: end } }),
    BiometricPunch.countDocuments({ punchAt: { $gte: start, $lt: end }, processed: true }),
    Attendance.countDocuments({
      date: { $gte: start, $lt: end },
      status: 'Leave',
      reviewStatus: 'auto_paid',
    }),
  ]);

  console.log(`\nDelayed biometric reconciliation: ${company} / ${day} IST`);
  console.log(JSON.stringify({ punchCount, processedCount, autoPaidCount, apply }, null, 2));

  if (!apply) {
    console.log('\nDRY RUN ONLY. No records changed. Re-run with --apply after reviewing the audit.');
    await db.close();
    return;
  }

  if (punchCount === 0) throw new Error('No biometric punches exist for the requested day.');

  const resetResult = await BiometricPunch.updateMany(
    { punchAt: { $gte: start, $lt: end } },
    {
      $set: {
        processed: false,
        unmapped: false,
        lastMappingAttemptAt: null,
      },
    }
  );
  console.log(`Requeued ${resetResult.modifiedCount || 0} previously processed punch(es).`);

  const result = await processBiometricPunches(db, {
    batchLimit: Math.max(5000, punchCount + 100),
    mappingRetryLimit: 0,
    punchAtRange: { start, end },
  });
  console.log('Reconciliation result:');
  console.log(JSON.stringify(result, null, 2));

  const [remainingAutoPaid, pendingTargetPunches, unmappedTargetPunches] = await Promise.all([
    Attendance.countDocuments({
      date: { $gte: start, $lt: end },
      status: 'Leave',
      reviewStatus: 'auto_paid',
    }),
    BiometricPunch.countDocuments({
      punchAt: { $gte: start, $lt: end },
      processed: false,
    }),
    BiometricPunch.countDocuments({
      punchAt: { $gte: start, $lt: end },
      processed: true,
      unmapped: true,
    }),
  ]);
  console.log(JSON.stringify({ remainingAutoPaid, pendingTargetPunches, unmappedTargetPunches }, null, 2));
  if (pendingTargetPunches > 0) {
    throw new Error(`${pendingTargetPunches} target-day punch(es) were not reconciled.`);
  }

  await db.close();
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
