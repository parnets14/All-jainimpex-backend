/**
 * HRMS crons (multi-company):
 *  - Leave accrual (Point 1): runs daily 00:05 IST; runAccrual is idempotent
 *    (monthly types credited once/month, upfront once/FY).
 *  - No-punch-in alert (Point 8): every 5 min; when the company's configured
 *    alert time (HrmsSettings.noPunchAlertTime, default 13:30) is reached, raise
 *    one HrmsAlert per active employee who has no punch-in today (excluding their
 *    weekly off and approved leave).
 */
import cron from 'node-cron';
import { getCompanyConnection } from '../config/multiDatabase.js';
import { runAccrual } from '../controllers/hrmsController.js';
import { hrmsSettingsSchema } from '../models/HrmsSettings.js';
import { hrmsAlertSchema } from '../models/HrmsAlert.js';
import { employeeSchema } from '../models/Employee.js';
import { attendanceSchema } from '../models/Attendance.js';
import { processBiometricPunches, finalizeDayAttendance } from '../utils/biometricAttendance.js';

const COMPANIES = ['jain-impex', 'ridhi', 'shree-jain-impex'];

const DAY_INDEX = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

const getModels = (db) => ({
  HrmsSettings: db.models.HrmsSettings || db.model('HrmsSettings', hrmsSettingsSchema),
  HrmsAlert: db.models.HrmsAlert || db.model('HrmsAlert', hrmsAlertSchema),
  Employee: db.models.Employee || db.model('Employee', employeeSchema),
  Attendance: db.models.Attendance || db.model('Attendance', attendanceSchema),
});

// ── Accrual ──
const runAccrualAllCompanies = async () => {
  console.log('⏰ HRMS leave accrual cron...');
  for (const company of COMPANIES) {
    try {
      const db = getCompanyConnection(company);
      if (!db) continue;
      const result = await runAccrual(db);
      console.log(`   ${company}: accrual for ${result.credited} employee(s)`);
    } catch (e) {
      console.error(`   ${company} accrual error:`, e.message);
    }
  }
};

// ── No-punch alert ──
// "HH:mm" -> minutes
const hmToMin = (hm) => {
  if (!hm || !hm.includes(':')) return 13 * 60 + 30;
  const [h, m] = hm.split(':').map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
};

const runNoPunchAlert = async () => {
  const now = new Date();
  // Convert current time to IST to compare against configured alert time
  const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const nowMin = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();
  const todayDow = istNow.getUTCDay(); // day-of-week in IST

  // IST midnight for today (UTC instant of 18:30 previous day)
  const istMidnight = new Date(istNow);
  istMidnight.setUTCHours(0, 0, 0, 0);
  const startOfDay = new Date(istMidnight.getTime() - 5.5 * 60 * 60 * 1000);
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);

  for (const company of COMPANIES) {
    try {
      const db = getCompanyConnection(company);
      if (!db) continue;
      const { HrmsSettings, HrmsAlert, Employee, Attendance } = getModels(db);

      let settings = await HrmsSettings.findOne({ key: 'default' });
      const alertMin = hmToMin(settings?.noPunchAlertTime || '13:30');

      // Only fire within a 5-min window after the configured time (cron runs every 5 min)
      if (nowMin < alertMin || nowMin >= alertMin + 5) continue;

      const employees = await Employee.find({ status: 'Active' })
        .select('_id name weeklyOff').lean();

      for (const emp of employees) {
        // skip weekly off
        const offIdx = DAY_INDEX[emp.weeklyOff] ?? 0;
        if (todayDow === offIdx) continue;

        const att = await Attendance.findOne({
          employee: emp._id,
          date: { $gte: startOfDay, $lte: endOfDay },
        }).lean();

        // skip if punched in, on approved leave, or already marked present/leave
        const hasPunch = att && (att.punchIn?.time || (att.sessions || []).some((s) => s.in?.time));
        const onLeave = att && att.status === 'Leave';
        if (hasPunch || onLeave) continue;

        // raise (idempotent) alert
        try {
          await HrmsAlert.updateOne(
            { type: 'no_punch_in', employee: emp._id, date: startOfDay },
            {
              $setOnInsert: {
                type: 'no_punch_in',
                employee: emp._id,
                employeeName: emp.name,
                date: startOfDay,
                message: `${emp.name} has no punch-in by ${settings?.noPunchAlertTime || '13:30'} today.`,
                read: false,
              },
            },
            { upsert: true }
          );
        } catch (e) {
          if (e.code !== 11000) console.error(`   ${company} alert error:`, e.message);
        }
      }
    } catch (e) {
      console.error(`   ${company} no-punch cron error:`, e.message);
    }
  }
};

// ── Biometric Phase 2: raw punches -> attendance ──
const runBiometricProcessing = async () => {
  for (const company of COMPANIES) {
    try {
      const db = getCompanyConnection(company);
      if (!db) continue;
      const r = await processBiometricPunches(db);
      if (r.processedPunches > 0) {
        console.log(`🟢 [biometric/${company}] processed ${r.processedPunches} punch(es) -> ${r.updatedAttendance} day(s); unmapped ${r.unmapped}`);
      }
    } catch (e) {
      console.error(`   ${company} biometric processing error:`, e.message);
    }
  }
};

// ── Biometric end-of-day finalizer (mark yesterday's absentees) ──
const runBiometricFinalize = async () => {
  for (const company of COMPANIES) {
    try {
      const db = getCompanyConnection(company);
      if (!db) continue;
      const r = await finalizeDayAttendance(db);
      console.log(`🟢 [biometric/${company}] finalized ${r.dayKey}: marked ${r.marked} absent`);
    } catch (e) {
      console.error(`   ${company} biometric finalize error:`, e.message);
    }
  }
};

export const startHrmsCrons = () => {
  cron.schedule('5 0 * * *', runAccrualAllCompanies, { timezone: 'Asia/Kolkata' });
  // No-punch alert check every 5 minutes
  cron.schedule('*/5 * * * *', runNoPunchAlert, { timezone: 'Asia/Kolkata' });
  // Biometric Phase 2: convert raw punches -> attendance every 5 minutes
  cron.schedule('*/5 * * * *', runBiometricProcessing, { timezone: 'Asia/Kolkata' });
  // End-of-day finalizer (mark absentees for yesterday) at 00:20 IST
  cron.schedule('20 0 * * *', runBiometricFinalize, { timezone: 'Asia/Kolkata' });
  console.log('⏰ HRMS crons scheduled (accrual 00:05, no-punch every 5m, biometric every 5m, finalize 00:20 IST)');
};

export default startHrmsCrons;
