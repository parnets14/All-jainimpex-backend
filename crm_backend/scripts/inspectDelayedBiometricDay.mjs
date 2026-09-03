import 'dotenv/config';
import { getCompanyConnection } from '../config/multiDatabase.js';
import { biometricPunchSchema } from '../models/BiometricPunch.js';
import { employeeSchema } from '../models/Employee.js';
import { attendanceSchema } from '../models/Attendance.js';
import { leaveSchema } from '../models/Leave.js';

const company = process.argv[2] || 'jain-impex';
const day = process.argv[3] || '2026-09-01';

const stripZeros = (value) => String(value || '').trim().replace(/^0+/, '');

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

const formatIst = (value) => value
  ? new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(new Date(value))
  : '-';

const run = async () => {
  const { start, end } = parseIstDay(day);
  const db = getCompanyConnection(company);
  await db.asPromise();

  const BiometricPunch = db.models.BiometricPunch || db.model('BiometricPunch', biometricPunchSchema);
  const Employee = db.models.Employee || db.model('Employee', employeeSchema);
  const Attendance = db.models.Attendance || db.model('Attendance', attendanceSchema);
  const Leave = db.models.Leave || db.model('Leave', leaveSchema);

  const [punches, employees, attendanceRows, approvedLeaves] = await Promise.all([
    BiometricPunch.find({ punchAt: { $gte: start, $lt: end } })
      .sort({ cardNo: 1, punchAt: 1 })
      .select('cardNo punchAt sourceId machineNo processed employee createdAt')
      .lean(),
    Employee.find({}).select('_id name empId biometricCardNo status').lean(),
    Attendance.find({ date: { $gte: start, $lt: end } })
      .select('employee date status leaveType reviewStatus reviewReason sessions punchIn punchOut createdAt updatedAt')
      .lean(),
    Leave.find({
      status: 'Approved',
      startDate: { $lt: end },
      endDate: { $gte: start },
    }).select('employee startDate endDate leaveType reason status createdAt updatedAt').lean(),
  ]);

  const employeeByKey = new Map();
  for (const employee of employees) {
    const keys = [employee.biometricCardNo, employee.empId]
      .flatMap((value) => [String(value || '').trim(), stripZeros(value)])
      .filter(Boolean);
    for (const key of keys) employeeByKey.set(key, employee);
  }

  const attendanceByEmployee = new Map();
  for (const attendance of attendanceRows) {
    const key = String(attendance.employee);
    if (!attendanceByEmployee.has(key)) attendanceByEmployee.set(key, []);
    attendanceByEmployee.get(key).push(attendance);
  }

  const approvedLeaveByEmployee = new Map();
  for (const leave of approvedLeaves) {
    const key = String(leave.employee);
    if (!approvedLeaveByEmployee.has(key)) approvedLeaveByEmployee.set(key, []);
    approvedLeaveByEmployee.get(key).push(leave);
  }

  const groupedPunches = new Map();
  for (const punch of punches) {
    const card = String(punch.cardNo || '').trim();
    const employee = employeeByKey.get(card) || employeeByKey.get(stripZeros(card)) || null;
    const key = employee ? String(employee._id) : `unmapped:${card}`;
    if (!groupedPunches.has(key)) groupedPunches.set(key, { card, employee, punches: [] });
    groupedPunches.get(key).punches.push(punch);
  }

  console.log(`\nDelayed biometric audit: ${company} / ${day} IST`);
  console.log(`Range: ${start.toISOString()} <= punchAt < ${end.toISOString()}`);
  console.log(`Raw punches: ${punches.length}; mapped employee/card groups: ${groupedPunches.size}; attendance rows: ${attendanceRows.length}; approved leaves: ${approvedLeaves.length}\n`);

  const summary = {
    presentOrLate: 0,
    leaveAutoPaid: 0,
    leaveExcused: 0,
    leaveApproved: 0,
    leaveWithoutApprovedRequest: 0,
    absentOrPending: 0,
    missingAttendance: 0,
    unmapped: 0,
    processedWithoutBiometricSession: 0,
  };

  for (const { card, employee, punches: employeePunches } of groupedPunches.values()) {
    if (!employee) {
      summary.unmapped += 1;
      console.log(`[UNMAPPED] card=${card}; punches=${employeePunches.length}; times=${employeePunches.map((p) => formatIst(p.punchAt)).join(' | ')}`);
      continue;
    }

    const rows = attendanceByEmployee.get(String(employee._id)) || [];
    const leaves = approvedLeaveByEmployee.get(String(employee._id)) || [];
    if (rows.length === 0) summary.missingAttendance += 1;

    for (const row of rows) {
      const hasBiometricSession = (row.sessions || []).some((session) => session?.in?.source === 'biometric');
      const allProcessed = employeePunches.every((punch) => punch.processed === true);
      if (allProcessed && !hasBiometricSession) summary.processedWithoutBiometricSession += 1;

      if (['Present', 'Late', 'Half Day'].includes(row.status)) summary.presentOrLate += 1;
      else if (row.status === 'Leave' && row.reviewStatus === 'auto_paid') summary.leaveAutoPaid += 1;
      else if (row.status === 'Leave' && row.reviewStatus === 'excused') summary.leaveExcused += 1;
      else if (row.status === 'Leave' && leaves.length > 0) summary.leaveApproved += 1;
      else if (row.status === 'Leave') summary.leaveWithoutApprovedRequest += 1;
      else summary.absentOrPending += 1;

      console.log(JSON.stringify({
        employee: employee.name,
        empId: employee.empId,
        card,
        punchTimesIst: employeePunches.map((punch) => formatIst(punch.punchAt)),
        punchProcessed: employeePunches.map((punch) => punch.processed),
        punchUploadedIst: employeePunches.map((punch) => formatIst(punch.createdAt)),
        attendanceDateIst: formatIst(row.date),
        attendanceStatus: row.status,
        leaveType: row.leaveType || null,
        reviewStatus: row.reviewStatus || null,
        reviewReason: row.reviewReason || null,
        sessionSources: (row.sessions || []).map((session) => session?.in?.source || 'legacy/unknown'),
        approvedLeaveRequests: leaves.map((leave) => ({
          type: leave.leaveType,
          reason: leave.reason,
          startIst: formatIst(leave.startDate),
          endIst: formatIst(leave.endDate),
        })),
      }));
    }
  }

  console.log('\nSummary:');
  console.log(JSON.stringify(summary, null, 2));
  console.log('\nThis script is read-only; no records were changed.');
  await db.close();
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
