/**
 * SE Daily Summary Cron
 * Runs at 9:00 PM IST (15:30 UTC) every day.
 * Calculates each Sales Executive's daily stats:
 *   - Work duration, check-in/out times
 *   - Total distance traveled (from Firebase trail history)
 *   - Active/idle/moving time
 *   - Dealers visited vs assigned
 *   - Orders placed & collections made
 * Stores in SEDailySummary collection (jain-impex DB).
 */
import cron from 'node-cron';
import admin from 'firebase-admin';
import { getCompanyConnection } from '../config/multiDatabase.js';
import { userSchema } from '../models/User.js';
import { dailySummarySchema } from '../SalesExecutiveAppBackend/models/DailySummary.js';
import { attendanceSchema as seAttendanceSchema } from '../SalesExecutiveAppBackend/models/Attendance.js';
import { dealerVisitSchema } from '../SalesExecutiveAppBackend/models/DealerVisit.js';
import { salesOrderSchema } from '../models/SalesOrder.js';
import { collectionSchema } from '../SalesExecutiveAppBackend/models/Collection.js';
import { dealerSchema } from '../models/Dealer.js';

const MASTER_COMPANY = 'jain-impex';
const ALL_COMPANIES = ['jain-impex', 'ridhi', 'shree-jain-impex'];

// Haversine distance in km
const distKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

// Get Firebase RTDB instance
const getFirebaseDB = () => {
  if (!admin.apps.length) {
    // Firebase Admin should already be initialized in server.js
    // If not, this will be a no-op and we skip trail data
    return null;
  }
  return admin.database();
};

// Calculate trail stats from Firebase history points
const calcTrailStats = (points) => {
  if (!points || points.length === 0) return { totalDistanceKm: 0, trailPoints: 0, activeTimeMin: 0, idleTimeMin: 0, movingTimeMin: 0 };

  const sorted = points.sort((a, b) => (a.t || 0) - (b.t || 0));
  let totalKm = 0;
  for (let i = 1; i < sorted.length; i++) {
    totalKm += distKm(sorted[i - 1].lat, sorted[i - 1].lng, sorted[i].lat, sorted[i].lng);
  }

  const firstT = sorted[0].t || 0;
  const lastT = sorted[sorted.length - 1].t || 0;
  const activeTimeMin = Math.max(0, Math.round((lastT - firstT) / 60000));

  // Detect idle stops (same location for >5 min within 45m radius)
  let idleMin = 0;
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && distKm(sorted[i].lat, sorted[i].lng, sorted[j].lat, sorted[j].lng) * 1000 <= 45) j++;
    const durMin = ((sorted[j - 1].t || 0) - (sorted[i].t || 0)) / 60000;
    if (durMin >= 5 && j - i >= 2) {
      idleMin += Math.round(durMin);
      i = j;
    } else {
      i++;
    }
  }

  return {
    totalDistanceKm: parseFloat(totalKm.toFixed(2)),
    trailPoints: sorted.length,
    activeTimeMin,
    idleTimeMin: idleMin,
    movingTimeMin: Math.max(0, activeTimeMin - idleMin),
  };
};

// Generate summary for one SE for a given date
const generateSummaryForUser = async (userId, userName, userPhone, dateStr, models, firebaseDB) => {
  const { SEAttendance, DealerVisit, SalesOrder, Collection, Dealer, SEDailySummary } = models;

  const dayStart = new Date(dateStr + 'T00:00:00.000+05:30'); // IST midnight
  const dayEnd = new Date(dateStr + 'T23:59:59.999+05:30');

  // 1. Attendance
  const attendance = await SEAttendance.findOne({
    user: userId,
    date: { $gte: dayStart, $lte: dayEnd },
  }).lean();

  const checkInTime = attendance?.checkInTime || null;
  const checkOutTime = attendance?.checkOutTime || null;
  const workDurationMin = (checkInTime && checkOutTime)
    ? Math.round((new Date(checkOutTime) - new Date(checkInTime)) / 60000)
    : 0;

  // 2. Trail data from Firebase
  let trailStats = { totalDistanceKm: 0, trailPoints: 0, activeTimeMin: 0, idleTimeMin: 0, movingTimeMin: 0 };
  if (firebaseDB) {
    try {
      // Read from all company paths and merge
      const allPoints = [];
      for (const company of ALL_COMPANIES) {
        const snap = await firebaseDB.ref(`/se-tracking-history/${company}/${userId}/${dateStr}`).once('value');
        const data = snap.val();
        if (data) {
          Object.values(data).forEach(p => {
            if (p && typeof p.lat === 'number' && typeof p.lng === 'number') {
              allPoints.push(p);
            }
          });
        }
      }
      // Deduplicate by timestamp (in case same point written to multiple paths)
      const seen = new Set();
      const unique = allPoints.filter(p => {
        const key = `${p.lat.toFixed(5)}_${p.lng.toFixed(5)}_${p.t}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      trailStats = calcTrailStats(unique);
    } catch (e) {
      console.warn(`  ⚠️ Trail fetch failed for ${userName}:`, e.message);
    }
  }

  // 3. Dealer visits
  const visitCount = await DealerVisit.countDocuments({
    user: userId,
    checkInAt: { $gte: dayStart, $lte: dayEnd },
  });

  // Assigned dealers count
  const assignedCount = await Dealer.countDocuments({
    salesExecutiveId: userId,
  });

  const coveragePercent = assignedCount > 0 ? Math.round((visitCount / assignedCount) * 100) : 0;

  // 4. Orders
  const orders = await SalesOrder.find({
    createdBy: userId,
    createdAt: { $gte: dayStart, $lte: dayEnd },
  }).select('totalAmount').lean();

  const ordersPlaced = orders.length;
  const orderValue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  // 5. Collections
  const collections = await Collection.find({
    collectedBy: userId,
    date: { $gte: dayStart, $lte: dayEnd },
  }).select('amount').lean();

  const collectionsCount = collections.length;
  const collectionAmount = collections.reduce((sum, c) => sum + (c.amount || 0), 0);

  // 6. Upsert summary
  const summary = {
    user: userId,
    date: dayStart,
    checkInTime,
    checkOutTime,
    workDurationMin,
    ...trailStats,
    dealersVisited: visitCount,
    dealersAssigned: assignedCount,
    visitCoveragePercent: coveragePercent,
    ordersPlaced,
    orderValue,
    collectionsCount,
    collectionAmount,
    userName,
    userPhone,
  };

  await SEDailySummary.findOneAndUpdate(
    { user: userId, date: dayStart },
    summary,
    { upsert: true, new: true }
  );

  return summary;
};

// Main cron function
const runDailySummary = async (targetDate = null) => {
  const dateStr = targetDate || new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10); // IST today
  console.log(`\n📊 [SE Daily Summary] Generating for ${dateStr}...`);

  try {
    const masterConn = getCompanyConnection(MASTER_COMPANY);
    const User = masterConn.models.User || masterConn.model('User', userSchema);
    const SEAttendance = masterConn.models.SEAttendance || masterConn.model('SEAttendance', seAttendanceSchema);
    const DealerVisit = masterConn.models.DealerVisit || masterConn.model('DealerVisit', dealerVisitSchema);
    const SalesOrder = masterConn.models.SalesOrder || masterConn.model('SalesOrder', salesOrderSchema);
    const Collection = masterConn.models.Collection || masterConn.model('Collection', collectionSchema);
    const Dealer = masterConn.models.Dealer || masterConn.model('Dealer', dealerSchema);
    const SEDailySummary = masterConn.models.SEDailySummary || masterConn.model('SEDailySummary', dailySummarySchema);

    const firebaseDB = getFirebaseDB();

    // Get all active sales executives
    const salesExecs = await User.find({ role: 'sales_executive', status: 'Active' })
      .select('_id name phone')
      .lean();

    console.log(`  Found ${salesExecs.length} active SEs`);

    const models = { SEAttendance, DealerVisit, SalesOrder, Collection, Dealer, SEDailySummary };
    let generated = 0;

    for (const se of salesExecs) {
      try {
        await generateSummaryForUser(se._id, se.name, se.phone, dateStr, models, firebaseDB);
        generated++;
      } catch (err) {
        console.error(`  ❌ Failed for ${se.name}:`, err.message);
      }
    }

    console.log(`✅ [SE Daily Summary] Generated ${generated}/${salesExecs.length} summaries for ${dateStr}\n`);
  } catch (error) {
    console.error('❌ [SE Daily Summary] Cron failed:', error.message);
  }
};

// Schedule: 9:00 PM IST = 15:30 UTC
// Cron: minute hour day month weekday
const startSEDailySummaryCron = () => {
  cron.schedule('30 15 * * *', () => {
    runDailySummary();
  }, { timezone: 'UTC' });

  console.log('⏰ SE Daily Summary cron scheduled (9:00 PM IST daily)');
};

export { startSEDailySummaryCron, runDailySummary };
export default startSEDailySummaryCron;
