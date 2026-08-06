/**
 * ONE-TIME FIX SCRIPT
 * 
 * Deletes all "Absent" attendance records that fall on an employee's
 * registered weekly off day (e.g. Sunday). These were incorrectly created
 * by the finalizeDayAttendance cron.
 *
 * Also deletes "Absent" records on holidays (once holidays are configured).
 *
 * Run: node fix-absent-on-weeklyoff.mjs
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const COMPANIES = [
  { name: 'jain-impex', db: process.env.MONGO_DB_JAINIMPEX || 'JainImpexCRM' },
  { name: 'ridhi', db: process.env.MONGO_DB_RIDHI || 'ridhi_crm' },
  { name: 'shree-jain-impex', db: process.env.MONGO_DB_SHREEJAIN || 'shreejain_crm' },
];

const BASE_URI = process.env.MONGO_BASE_URI;
const OPTIONS = process.env.MONGO_OPTIONS || '?retryWrites=true&w=majority';

const DAY_INDEX = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

const getOffDays = (weeklyOff) => {
  if (!weeklyOff) return [0]; // default Sunday
  const days = Array.isArray(weeklyOff) ? weeklyOff : [weeklyOff];
  return days.map(d => DAY_INDEX[d]).filter(d => d !== undefined);
};

// IST day-of-week from a UTC date stored in attendance
const istDayOfWeek = (date) => {
  const istMs = new Date(date).getTime() + 5.5 * 60 * 60 * 1000;
  return new Date(istMs).getUTCDay();
};

async function fixCompany(companyName, dbName) {
  const uri = `${BASE_URI}/${dbName}${OPTIONS}`;
  const conn = await mongoose.createConnection(uri).asPromise();
  console.log(`\n🔗 Connected to ${companyName} (${dbName})`);

  const Employee = conn.model('Employee', new mongoose.Schema({
    name: String,
    empId: String,
    weeklyOff: [String],
    status: String,
  }));

  const Attendance = conn.model('Attendance', new mongoose.Schema({
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    date: Date,
    status: String,
    sessions: Array,
    punchIn: Object,
    punchOut: Object,
    workingHours: Number,
  }));

  // Also check for holidays
  let holidays = [];
  try {
    const Holiday = conn.model('Holiday', new mongoose.Schema({ date: Date }));
    holidays = await Holiday.find({}).select('date').lean();
    console.log(`   📅 Found ${holidays.length} holiday(s) in database`);
  } catch (e) {
    console.log(`   📅 No Holiday collection yet`);
  }
  const holidayDates = new Set(
    holidays.map(h => {
      const istMs = new Date(h.date).getTime() + 5.5 * 3600000;
      return new Date(istMs).toISOString().slice(0, 10);
    })
  );

  // Get all employees with their weeklyOff
  const employees = await Employee.find({}).select('_id name weeklyOff').lean();
  console.log(`   👤 ${employees.length} employee(s)`);

  let totalDeleted = 0;

  for (const emp of employees) {
    const offDays = getOffDays(emp.weeklyOff);

    // Find all "Absent" records for this employee that have no actual sessions/punch data
    const absentRecords = await Attendance.find({
      employee: emp._id,
      status: 'Absent',
      $or: [
        { sessions: { $size: 0 } },
        { sessions: { $exists: false } },
        { sessions: null },
      ],
    }).select('_id date').lean();

    const toDelete = [];
    for (const rec of absentRecords) {
      const dow = istDayOfWeek(rec.date);
      const istDate = new Date(new Date(rec.date).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);

      // Delete if it's on the employee's weekly off OR a company holiday
      if (offDays.includes(dow) || holidayDates.has(istDate)) {
        toDelete.push(rec._id);
      }
    }

    if (toDelete.length > 0) {
      const result = await Attendance.deleteMany({ _id: { $in: toDelete } });
      totalDeleted += result.deletedCount;
      console.log(`   ✅ ${emp.name} (${emp.empId}): deleted ${result.deletedCount} wrong absent record(s)`);
    }
  }

  console.log(`   🎯 Total deleted for ${companyName}: ${totalDeleted}`);
  await conn.close();
  return totalDeleted;
}

async function main() {
  console.log('='.repeat(60));
  console.log('🔧 FIX: Removing "Absent" records on weekly-off / holiday days');
  console.log('='.repeat(60));

  let grandTotal = 0;
  for (const company of COMPANIES) {
    try {
      const count = await fixCompany(company.name, company.db);
      grandTotal += count;
    } catch (e) {
      console.error(`   ❌ ${company.name} failed: ${e.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✅ DONE! Total incorrect absent records removed: ${grandTotal}`);
  console.log('='.repeat(60));
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
