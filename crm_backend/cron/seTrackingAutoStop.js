/**
 * SE Tracking Auto-Stop Cron
 * Runs at 11:59 PM IST (18:29 UTC) every day.
 * Purpose: Privacy compliance — auto-stop tracking for any SE who forgot to
 * punch out. Marks them as 'offline' in Firebase RTDB and force-closes their
 * HRMS attendance session (punch-out at 23:59 IST).
 *
 * Also runs a check-out at SEAttendance level so their daily record isn't
 * stuck in "checked in" state forever.
 */
import cron from 'node-cron';
import admin from 'firebase-admin';
import { getCompanyConnection } from '../config/multiDatabase.js';
import { userSchema } from '../models/User.js';
import { attendanceSchema as seAttendanceSchema } from '../SalesExecutiveAppBackend/models/Attendance.js';
import { attendanceSchema as hrmsAttendanceSchema } from '../models/Attendance.js';
import { employeeSchema } from '../models/Employee.js';

const MASTER_COMPANY = 'jain-impex';
const ALL_COMPANIES = ['jain-impex', 'ridhi', 'shree-jain-impex'];
const RTDB_URL = 'https://jain-impex-default-rtdb.asia-southeast1.firebasedatabase.app';

const getFirebaseDB = () => {
  try {
    return admin.app().database(RTDB_URL);
  } catch {
    return null;
  }
};

/**
 * Mark ALL active SE tracking nodes as offline in Firebase RTDB.
 * This is a blanket operation — at 11:59 PM IST nobody should be tracked.
 */
const markAllSEsOffline = async () => {
  const db = getFirebaseDB();
  if (!db) {
    console.log('⚠️ [SE_AUTO_STOP] Firebase not initialized, skipping');
    return 0;
  }

  let marked = 0;
  for (const company of ALL_COMPANIES) {
    try {
      const snap = await db.ref(`/se-tracking/${company}`).once('value');
      const users = snap.val();
      if (!users) continue;

      for (const userId of Object.keys(users)) {
        const userData = users[userId];
        if (userData.status === 'active' || userData.status === 'gps_off') {
          await db.ref(`/se-tracking/${company}/${userId}`).update({
            status: 'offline',
            lastUpdated: admin.database.ServerValue.TIMESTAMP,
          });
          marked++;
        }
      }
    } catch (e) {
      console.error(`[SE_AUTO_STOP] Firebase error for ${company}:`, e.message);
    }
  }
  return marked;
};

/**
 * Auto-close SEAttendance records that are still checked-in (no checkOutTime).
 * Sets checkOutTime to 23:59 IST and updates HRMS attendance session.
 */
const autoCloseAttendance = async () => {
  try {
    const masterConn = getCompanyConnection(MASTER_COMPANY);
    const SEAttendance = masterConn.models.SEAttendance || masterConn.model('SEAttendance', seAttendanceSchema);
    const Employee = masterConn.models.Employee || masterConn.model('Employee', employeeSchema);
    const HRMSAttendance = masterConn.models.Attendance || masterConn.model('Attendance', hrmsAttendanceSchema);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find all SEs who checked in today but haven't checked out
    const openRecords = await SEAttendance.find({
      date: today,
      checkInTime: { $ne: null },
      checkOutTime: null,
    });

    if (openRecords.length === 0) return 0;

    // 23:59 IST = 18:29 UTC
    const autoCheckOutTime = new Date();
    // Set to 23:59 IST: calculate UTC equivalent
    const istMidnight = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    istMidnight.setUTCHours(23, 59, 0, 0);
    const utcCheckOut = new Date(istMidnight.getTime() - 5.5 * 60 * 60 * 1000);

    let closed = 0;
    for (const record of openRecords) {
      record.checkOutTime = utcCheckOut;
      record.checkOutLocation = {
        type: 'Point',
        coordinates: record.checkInLocation?.coordinates || [0, 0],
        address: 'Auto-closed at 11:59 PM IST (forgot to punch out)',
      };
      await record.save();
      closed++;

      // Also close HRMS attendance session for this user
      try {
        const linkedEmp = await Employee.findOne({ linkedUserId: record.user, status: 'Active' }).select('_id').lean();
        if (linkedEmp) {
          const istMid = (d) => { const ms = new Date(d).getTime() + 5.5 * 3600000; const ist = new Date(ms); ist.setUTCHours(0, 0, 0, 0); return new Date(ist.getTime() - 5.5 * 3600000); };
          const dayStart = istMid(new Date());
          const hrmsAtt = await HRMSAttendance.findOne({ employee: linkedEmp._id, date: dayStart });
          if (hrmsAtt) {
            const sessions = hrmsAtt.sessions || [];
            const openIdx = sessions.findIndex(
              s => ['app', 'sales_executive_app'].includes(s.in?.source) && !s.out?.time
            );
            if (openIdx >= 0) {
              sessions[openIdx].out = {
                time: utcCheckOut,
                location: 'Auto-closed 23:59 IST',
                source: 'sales_executive_app',
              };
              hrmsAtt.sessions = sessions;
              hrmsAtt.markModified('sessions');
              await hrmsAtt.save();
            }
          }
        }
      } catch (syncErr) {
        console.error(`[SE_AUTO_STOP] HRMS sync failed for user ${record.user}:`, syncErr.message);
      }
    }

    return closed;
  } catch (error) {
    console.error('[SE_AUTO_STOP] Auto-close attendance error:', error.message);
    return 0;
  }
};

// Main execution function (exported for testing)
export const runAutoStopTracking = async () => {
  console.log('[SE_AUTO_STOP] Running 11:59 PM IST auto-stop...');

  const [firebaseMarked, attendanceClosed] = await Promise.all([
    markAllSEsOffline(),
    autoCloseAttendance(),
  ]);

  console.log(`[SE_AUTO_STOP] Done — Firebase marked offline: ${firebaseMarked}, Attendance auto-closed: ${attendanceClosed}`);
  return { firebaseMarked, attendanceClosed };
};

// Schedule: 11:59 PM IST = 18:29 UTC
// cron format: minute hour * * * (UTC)
cron.schedule('29 18 * * *', async () => {
  await runAutoStopTracking();
});

console.log('✅ SE Tracking Auto-Stop cron scheduled (11:59 PM IST / 18:29 UTC daily)');
