/**
 * One-time fix: Remove "Absent" attendance records that were incorrectly
 * created on employees' weekly off days by the old cron (which hardcoded Sat/Sun).
 * 
 * Run: node --experimental-modules scripts/fixWeeklyOffAbsent.js
 * (from crm_backend directory, with .env loaded)
 */
import 'dotenv/config';
import { getCompanyConnection, getValidCompanies } from '../config/multiDatabase.js';
import { attendanceSchema } from '../models/Attendance.js';
import { employeeSchema } from '../models/Employee.js';

const DAY_INDEX = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

const fixCompany = async (company) => {
  const conn = getCompanyConnection(company);
  await conn.asPromise();
  
  const Attendance = conn.models.Attendance || conn.model('Attendance', attendanceSchema);
  const Employee = conn.models.Employee || conn.model('Employee', employeeSchema);

  const employees = await Employee.find({ status: 'Active', weeklyOff: { $exists: true, $ne: '' } })
    .select('_id name weeklyOff').lean();

  console.log(`[${company}] Checking ${employees.length} employees with weeklyOff set...`);

  let totalDeleted = 0;

  for (const emp of employees) {
    const offDay = DAY_INDEX[emp.weeklyOff];
    if (offDay === undefined) continue;

    // Find all "Absent" records for this employee
    const absentRecords = await Attendance.find({
      employee: emp._id,
      status: 'Absent',
      // Only records with no sessions (pure cron-created absent markers)
      $or: [
        { sessions: { $size: 0 } },
        { sessions: { $exists: false } },
      ],
    }).select('_id date').lean();

    const toDelete = [];
    for (const rec of absentRecords) {
      // Check if this date falls on the employee's weekly off
      const recDate = new Date(rec.date);
      // Convert to IST day-of-week
      const istDate = new Date(recDate.getTime() + 5.5 * 3600000);
      const dow = istDate.getUTCDay();
      if (dow === offDay) {
        toDelete.push(rec._id);
      }
    }

    if (toDelete.length > 0) {
      await Attendance.deleteMany({ _id: { $in: toDelete } });
      console.log(`  ${emp.name}: deleted ${toDelete.length} incorrect absent record(s) on ${emp.weeklyOff}s`);
      totalDeleted += toDelete.length;
    }
  }

  console.log(`[${company}] Done. Removed ${totalDeleted} incorrect absent records.\n`);
};

const main = async () => {
  console.log('🔧 Fixing incorrect "Absent" records on weekly off days...\n');
  const companies = getValidCompanies();
  for (const company of companies) {
    await fixCompany(company);
  }
  console.log('✅ Fix complete. Exiting.');
  process.exit(0);
};

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
