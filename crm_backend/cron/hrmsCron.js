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
import { holidaySchema } from '../models/Holiday.js';
import { processBiometricPunches, finalizeDayAttendance } from '../utils/biometricAttendance.js';
import {
  ABSENT_REVIEW_GRACE_DAYS,
  getAbsentReviewPolicyBounds,
} from '../utils/absentReviewPolicy.js';

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
  Holiday: db.models.Holiday || db.model('Holiday', holidaySchema),
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
      const { HrmsSettings, HrmsAlert, Employee, Attendance, Holiday } = getModels(db);

      let settings = await HrmsSettings.findOne({ key: 'default' });
      const alertMin = hmToMin(settings?.noPunchAlertTime || '13:30');

      // Only fire within a 5-min window after the configured time (cron runs every 5 min)
      if (nowMin < alertMin || nowMin >= alertMin + 5) continue;

      const employees = await Employee.find({ status: 'Active' })
        .select('_id name weeklyOff department').lean();
      const holidays = await Holiday.find({ date: { $gte: startOfDay, $lte: endOfDay } })
        .select('departments').lean();

      for (const emp of employees) {
        // skip weekly off
        const getOffDays = (weeklyOff) => {
          if (!weeklyOff) return [];
          const days = Array.isArray(weeklyOff) ? weeklyOff : [weeklyOff];
          return days.map(d => DAY_INDEX[d]).filter(d => d !== undefined);
        };
        const offDays = getOffDays(emp.weeklyOff);
        if (offDays.includes(todayDow)) continue;
        if (holidays.some((holiday) => !holiday.departments?.length || holiday.departments.includes(emp.department))) continue;

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
          const result = await HrmsAlert.updateOne(
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
          // Only notify admin on NEW alerts (not re-runs)
          if (result.upsertedCount > 0) {
            try {
              const { notifyNoPunchIn } = await import('../services/adminNotificationService.js');
              notifyNoPunchIn(emp.name, company);
            } catch (ne) { /* non-blocking */ }
          }
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

// ── Absent Review (9 AM IST) ──
// Scans YESTERDAY's persisted Absent records. For each absent employee:
//   • If it's within their free monthly paid-leave quota → auto-mark as Paid Leave
//     (reviewStatus 'auto_paid', status 'Leave', leaveType 'Paid Leave'). No cut, no review.
//   • Otherwise → mark reviewStatus 'pending' (still status 'Absent') and it appears in
//     the Absent Review component. One consolidated super-admin notification per company.
const runAbsentReview = async () => {
  const now = new Date();
  const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const nowMin = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();

  // Yesterday's IST day range
  const istMidnight = new Date(istNow);
  istMidnight.setUTCHours(0, 0, 0, 0);
  const todayStartUtc = new Date(istMidnight.getTime() - 5.5 * 60 * 60 * 1000);
  const yStart = new Date(todayStartUtc.getTime() - 24 * 60 * 60 * 1000);
  const yEnd = new Date(todayStartUtc.getTime() - 1);

  // All unresolved persisted absences through yesterday are eligible. This
  // catch-up range prevents a missed five-minute cron window from stranding
  // reviewStatus "none" records and permanently blocking payroll.

  for (const company of COMPANIES) {
    try {
      const db = getCompanyConnection(company);
      if (!db) continue;
      const { HrmsSettings, Employee, Attendance } = getModels(db);

      const settings = await HrmsSettings.findOne({ key: 'default' });
      const alertMin = hmToMin(settings?.absentReviewAlertTime || '09:00');
      const configuredMultiplier = Number(settings?.absentDeductionMultiplier ?? 1);
      const defaultMultiplier = Number.isFinite(configuredMultiplier) && configuredMultiplier > 0
        ? configuredMultiplier
        : 1;
      const { reviewableFromUtc } = getAbsentReviewPolicyBounds(now);

      // Settle every pending record whose own month-specific review deadline
      // has passed. On days 1–15, the previous month remains reviewable; from
      // the 16th, only the current month remains reviewable.
      const autoResult = await Attendance.updateMany(
        {
          date: { $lt: reviewableFromUtc },
          status: 'Absent',
          reviewStatus: 'pending',
        },
        {
          $set: {
            leaveType: 'Unpaid Leave',
            reviewStatus: 'unexcused',
            reviewReason: `Auto-marked unexcused after ${ABSENT_REVIEW_GRACE_DAYS}-day review window`,
            reviewedBy: null,
            reviewedAt: now,
            absentDeductionMultiplier: defaultMultiplier,
          },
        }
      );
      let autoUnexcused = autoResult.modifiedCount || 0;

      const freeQuota = Number(settings?.freeMonthlyPaidLeaves ?? 1);

      // Before the notification time, process only already-expired backlog so
      // it cannot block payroll. At/after the alert time, classify all records
      // through yesterday and notify for newly active pending reviews.
      const classificationDateFilter = nowMin < alertMin
        ? { $lt: reviewableFromUtc }
        : { $lte: yEnd };
      const absents = await Attendance.find({
        date: classificationDateFilter,
        status: 'Absent',
        reviewStatus: { $in: ['none', null] },
      }).sort({ date: 1, createdAt: 1 }).populate('employee', 'name empId').lean();

      let autoPaid = 0;
      const pendingEntries = [];

      for (const rec of absents) {
        if (!rec.employee) continue;

        // Count only the dedicated automatic unplanned-absence allowance.
        // Planned paid leave and manually excused leave do not consume it.
        const recIst = new Date(new Date(rec.date).getTime() + 5.5 * 3600000);
        const monthStartUtc = new Date(
          Date.UTC(recIst.getUTCFullYear(), recIst.getUTCMonth(), 1) - 5.5 * 3600000
        );
        const priorPaidCount = await Attendance.countDocuments({
          employee: rec.employee._id,
          date: { $gte: monthStartUtc, $lt: rec.date },
          reviewStatus: 'auto_paid',
        });

        if (priorPaidCount < freeQuota) {
          // Auto-apply free monthly paid leave — no review, no cut
          const claimed = await Attendance.updateOne(
            { _id: rec._id, status: 'Absent', reviewStatus: { $in: ['none', null] } },
            {
              $set: {
                status: 'Leave',
                leaveType: 'Paid Leave',
                reviewStatus: 'auto_paid',
                reviewReason: 'Auto free monthly paid leave',
                reviewedAt: new Date(),
              },
            }
          );
          if (claimed.modifiedCount > 0) autoPaid++;
        } else {
          // Needs an authorized attendance reviewer.
          const claimed = await Attendance.updateOne(
            { _id: rec._id, status: 'Absent', reviewStatus: { $in: ['none', null] } },
            { $set: { reviewStatus: 'pending' } }
          );
          if (claimed.modifiedCount > 0) {
            pendingEntries.push({
              name: rec.employee.name || 'Unknown',
              date: new Date(rec.date),
            });
          }
        }
      }

      // A late restart may classify an already-expired none/null record during
      // this same pass. Settle those newly pending prior-month rows immediately.
      if (pendingEntries.some((entry) => entry.date < reviewableFromUtc)) {
        const catchUpResult = await Attendance.updateMany(
          {
            date: { $lt: reviewableFromUtc },
            status: 'Absent',
            reviewStatus: 'pending',
          },
          {
            $set: {
              leaveType: 'Unpaid Leave',
              reviewStatus: 'unexcused',
              reviewReason: `Auto-marked unexcused after ${ABSENT_REVIEW_GRACE_DAYS}-day review window`,
              reviewedBy: null,
              reviewedAt: now,
              absentDeductionMultiplier: defaultMultiplier,
            },
          }
        );
        autoUnexcused += catchUpResult.modifiedCount || 0;
      }

      // Do not notify for newly caught-up records that were immediately settled
      // because their review deadline had already passed.
      const pendingNames = pendingEntries
        .filter((entry) => nowMin >= alertMin && entry.date >= reviewableFromUtc)
        .map((entry) => entry.name);

      // One consolidated notification to super-admin for pending reviews.
      if (pendingNames.length > 0) {
        try {
          const { default: sendAdminNotification } = await import('../services/adminNotificationService.js');
          const dateStr = new Date(yStart.getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
          await sendAdminNotification({
            type: 'absent_review',
            title: `${pendingNames.length} absent employee(s) need review`,
            message: `Through ${dateStr}: ${pendingNames.slice(0, 5).join(', ')}${pendingNames.length > 5 ? ` +${pendingNames.length - 5} more` : ''}. Mark each absence as paid or unpaid leave.`,
            priority: 'high',
            company,
            data: {
              route: '/hrms-admin/absent-review', date: dateStr, count: pendingNames.length,
              visibleToRoles: ['super_admin'],
            },
          });
        } catch (ne) { /* non-blocking */ }
      }

      if (autoPaid > 0 || pendingEntries.length > 0 || autoUnexcused > 0) {
        console.log(`🟠 [absent-review/${company}] auto-paid ${autoPaid}, pending ${pendingNames.length}, auto-unexcused ${autoUnexcused}`);
      }
    } catch (e) {
      console.error(`   ${company} absent-review cron error:`, e.message);
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
  // Absent review: check every 5 min, fires at configured time (default 09:00 IST)
  cron.schedule('*/5 * * * *', runAbsentReview, { timezone: 'Asia/Kolkata' });
  console.log('⏰ HRMS crons scheduled (accrual 00:05, no-punch every 5m, biometric every 5m, finalize 00:20, absent-review ~09:00 IST)');
};

export { runAbsentReview };
export default startHrmsCrons;
