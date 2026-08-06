/**
 * VERIFICATION SCRIPT — July 2026 Salary Check
 * 
 * For each employee in jain-impex:
 * 1. Shows their salary config (type, basic, allowances)
 * 2. Counts July 2026 working days (excluding their weekly off)
 * 3. Counts present/late/leave/absent days from attendance records
 * 4. Calculates what their salary SHOULD be
 * 5. Shows existing salary slip if any
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const BASE_URI = process.env.MONGO_BASE_URI;
const OPTIONS = process.env.MONGO_OPTIONS || '?retryWrites=true&w=majority';
const DB = process.env.MONGO_DB_JAINIMPEX || 'JainImpexCRM';

const DAY_INDEX = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

const DAY_NAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getOffDays = (weeklyOff) => {
  if (!weeklyOff) return [0];
  const days = Array.isArray(weeklyOff) ? weeklyOff : [weeklyOff];
  return days.map(d => DAY_INDEX[d]).filter(d => d !== undefined);
};

// IST midnight for a date
const istMid = (d) => {
  const ms = new Date(d).getTime() + 5.5 * 3600000;
  const ist = new Date(ms); ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 3600000);
};

async function main() {
  const uri = `${BASE_URI}/${DB}${OPTIONS}`;
  const conn = await mongoose.createConnection(uri).asPromise();
  console.log(`🔗 Connected to ${DB}\n`);

  const Employee = conn.model('Employee', new mongoose.Schema({}, { strict: false }));
  const Attendance = conn.model('Attendance', new mongoose.Schema({}, { strict: false }));
  const SalarySlip = conn.model('SalarySlip', new mongoose.Schema({}, { strict: false }));

  // July 2026 period (IST)
  const year = 2026;
  const month = 7;
  const periodFrom = istMid(new Date(year, month - 1, 1)); // 1 July IST midnight
  const periodTo = new Date(istMid(new Date(year, month, 0)).getTime() + 86400000 - 1); // 31 July end

  const employees = await Employee.find({ status: 'Active' })
    .select('name empId department designation weeklyOff salaryType basicSalary hra conveyance medicalAllowance specialAllowance pf professionalTax tds otherDeductions grossSalary netSalary')
    .sort({ name: 1 })
    .lean();

  console.log(`👤 ${employees.length} active employees`);
  console.log(`📅 Period: July 2026 (${periodFrom.toISOString()} → ${periodTo.toISOString()})\n`);
  console.log('='.repeat(100));

  for (const emp of employees) {
    const offDays = getOffDays(emp.weeklyOff);

    // Count working days in July (excluding weekly off)
    let workingDays = 0;
    const d = new Date(periodFrom);
    while (d <= periodTo) {
      const istDate = new Date(d.getTime() + 5.5 * 3600000);
      const dow = istDate.getUTCDay();
      if (!offDays.includes(dow)) workingDays++;
      d.setTime(d.getTime() + 86400000);
    }

    // Get attendance records for July
    const attendance = await Attendance.find({
      employee: emp._id,
      date: { $gte: periodFrom, $lte: periodTo },
    }).lean();

    let presentDays = 0;
    let lateDays = 0;
    let leaveDays = 0;
    let absentDays = 0;
    const statusCount = {};

    for (const rec of attendance) {
      statusCount[rec.status] = (statusCount[rec.status] || 0) + 1;
      if (rec.status === 'Present') presentDays++;
      else if (rec.status === 'Late') { presentDays++; lateDays++; }
      else if (rec.status === 'Leave') {
        if (rec.leaveType !== 'Unpaid Leave') { leaveDays++; presentDays++; }
        else absentDays++;
      }
      else if (rec.status === 'Absent') absentDays++;
    }

    // Days with no record at all (and not weekly off) = also absent
    const recordedDays = attendance.length;
    const unrecordedWorkingDays = workingDays - recordedDays;
    // These are days the cron hasn't processed yet (future or just missing)
    // Only count past days as absent
    const today = new Date();
    const lastDayToCheck = periodTo < today ? periodTo : today;
    let pastWorkingDays = 0;
    const d2 = new Date(periodFrom);
    while (d2 <= lastDayToCheck) {
      const istDate = new Date(d2.getTime() + 5.5 * 3600000);
      const dow = istDate.getUTCDay();
      if (!offDays.includes(dow)) pastWorkingDays++;
      d2.setTime(d2.getTime() + 86400000);
    }
    const effectiveAbsent = Math.max(0, pastWorkingDays - presentDays - absentDays - (leaveDays > presentDays ? 0 : 0));
    // Simpler: total absent = pastWorkingDays - presentDays (present already includes paid leave)
    const totalAbsent = Math.max(0, pastWorkingDays - presentDays);

    // Calculate expected salary
    const salaryType = emp.salaryType || 'fixed';
    const basic = Number(emp.basicSalary) || 0;
    const hra = Number(emp.hra) || 0;
    const conveyance = Number(emp.conveyance) || 0;
    const medical = Number(emp.medicalAllowance) || 0;
    const special = Number(emp.specialAllowance) || 0;
    const pf = Number(emp.pf) || 0;
    const profTax = Number(emp.professionalTax) || 0;
    const tds = Number(emp.tds) || 0;
    const otherDed = Number(emp.otherDeductions) || 0;

    let grossSalary = 0;
    let lopDays = 0;
    let lopAmount = 0;
    let netSalary = 0;

    if (salaryType === 'fixed') {
      grossSalary = basic + hra + conveyance + medical + special;
      lopDays = totalAbsent;
      const perDay = workingDays > 0 ? grossSalary / workingDays : 0;
      lopAmount = parseFloat((perDay * lopDays).toFixed(2));
      const totalDeductions = pf + profTax + tds + otherDed + lopAmount;
      netSalary = Math.max(0, grossSalary - totalDeductions);
    } else if (salaryType === 'daily') {
      grossSalary = basic * presentDays;
      const totalDeductions = grossSalary * 0.12; // PF
      netSalary = Math.max(0, grossSalary - totalDeductions);
    } else if (salaryType === 'hourly') {
      const totalHours = attendance.reduce((sum, r) => {
        if (r.status === 'Present' || r.status === 'Late') return sum + (r.workingHours || 0);
        return sum;
      }, 0);
      grossSalary = basic * totalHours;
      netSalary = Math.max(0, grossSalary - grossSalary * 0.12);
    }

    // Check existing salary slip
    const existingSlip = await SalarySlip.findOne({
      employeeId: emp._id,
      month: { $in: [month, String(month), '07', '7'] },
      year: { $in: [year, String(year)] },
    }).lean();

    // Print summary
    console.log(`\n📋 ${emp.name} (${emp.empId || 'N/A'}) — ${emp.department || ''} / ${emp.designation || ''}`);
    console.log(`   Salary Type: ${salaryType} | Basic: ₹${basic} | Weekly Off: ${emp.weeklyOff?.join(', ') || 'Sunday'}`);
    console.log(`   July Working Days: ${workingDays} (past: ${pastWorkingDays}) | Sundays skipped: ${31 - workingDays}`);
    console.log(`   Attendance: Present=${presentDays - leaveDays} Late=${lateDays} PaidLeave=${leaveDays} Absent=${absentDays} Records=${recordedDays}`);
    console.log(`   LOP Days: ${lopDays} | Gross: ₹${grossSalary.toFixed(0)} | LOP Deduction: ₹${lopAmount.toFixed(0)} | Net: ₹${netSalary.toFixed(0)}`);
    
    if (existingSlip) {
      console.log(`   💰 EXISTING SLIP: Net=₹${existingSlip.netSalary} Gross=₹${existingSlip.grossSalary} LOP=${existingSlip.lopDays}d Working=${existingSlip.workingDays}d Present=${existingSlip.daysWorked}d`);
    } else {
      console.log(`   📝 No salary slip generated for July yet`);
    }
    console.log('-'.repeat(100));
  }

  await conn.close();
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
