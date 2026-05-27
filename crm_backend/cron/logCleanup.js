import cron from 'node-cron';
import { activityLogSchema } from '../models/ActivityLog.js';
import { downloadLogSchema } from '../models/DownloadLog.js';
import { getCompanyConnection } from '../config/multiDatabase.js';

// Company list for multi-tenant cleanup
const COMPANIES = ['jain-impex', 'ridhi', 'shree-jain-impex'];

// Helper to get models for a specific company connection
const getLogModels = (dbConnection) => {
  return {
    ActivityLog: dbConnection.models.ActivityLog || dbConnection.model('ActivityLog', activityLogSchema),
    DownloadLog: dbConnection.models.DownloadLog || dbConnection.model('DownloadLog', downloadLogSchema)
  };
};

// Cron job to automatically cleanup old logs for ALL companies
// Runs every day at 2:00 AM to clean up logs older than 7 days
const scheduleLogCleanup = () => {
  cron.schedule('0 2 * * *', async () => {
    try {
      console.log('🧹 Running scheduled log cleanup for all companies...');
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);
      
      let totalActivityDeleted = 0;
      let totalDownloadDeleted = 0;
      
      for (const company of COMPANIES) {
        try {
          const connection = getCompanyConnection(company);
          const { ActivityLog, DownloadLog } = getLogModels(connection);
          
          const activityResult = await ActivityLog.deleteMany({
            timestamp: { $lt: cutoffDate }
          });
          
          const downloadResult = await DownloadLog.deleteMany({
            timestamp: { $lt: cutoffDate }
          });
          
          totalActivityDeleted += activityResult.deletedCount;
          totalDownloadDeleted += downloadResult.deletedCount;
          
          if (activityResult.deletedCount > 0 || downloadResult.deletedCount > 0) {
            console.log(`  ✅ ${company}: Cleaned ${activityResult.deletedCount} activity + ${downloadResult.deletedCount} download logs`);
          }
        } catch (companyError) {
          console.error(`  ❌ ${company}: Cleanup failed -`, companyError.message);
        }
      }
      
      const totalCleaned = totalActivityDeleted + totalDownloadDeleted;
      
      if (totalCleaned > 0) {
        console.log(`✅ Scheduled log cleanup completed: ${totalCleaned} total logs removed`);
      } else {
        console.log('✅ Scheduled log cleanup completed: No old logs to clean');
      }
      
    } catch (error) {
      console.error('❌ Error in scheduled log cleanup:', error);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });
  
  console.log('🧹 Log cleanup cron job scheduled (daily at 2:00 AM IST - all companies)');
};

// Manual function to cleanup logs for a specific company connection
export const cleanupLogsForConnection = async (dbConnection, daysToKeep = 7) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  const { ActivityLog, DownloadLog } = getLogModels(dbConnection);
  
  const activityResult = await ActivityLog.deleteMany({
    timestamp: { $lt: cutoffDate }
  });
  
  const downloadResult = await DownloadLog.deleteMany({
    timestamp: { $lt: cutoffDate }
  });
  
  return {
    activityLogsDeleted: activityResult.deletedCount,
    downloadLogsDeleted: downloadResult.deletedCount,
    totalDeleted: activityResult.deletedCount + downloadResult.deletedCount
  };
};

// Clear ALL logs for a specific company connection (Clear All Data button)
export const clearAllLogsForConnection = async (dbConnection) => {
  const { ActivityLog, DownloadLog } = getLogModels(dbConnection);
  
  const activityResult = await ActivityLog.deleteMany({});
  const downloadResult = await DownloadLog.deleteMany({});
  
  return {
    activityLogsDeleted: activityResult.deletedCount,
    downloadLogsDeleted: downloadResult.deletedCount,
    totalDeleted: activityResult.deletedCount + downloadResult.deletedCount
  };
};

// Function to get log statistics for a specific company connection
export const getLogStatisticsForConnection = async (dbConnection) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { ActivityLog, DownloadLog } = getLogModels(dbConnection);
    
    const [
      totalActivityLogs,
      totalDownloadLogs,
      recentActivityLogs,
      recentDownloadLogs,
      oldActivityLogs,
      oldDownloadLogs
    ] = await Promise.all([
      ActivityLog.countDocuments().catch(() => 0),
      DownloadLog.countDocuments().catch(() => 0),
      ActivityLog.countDocuments({ timestamp: { $gte: sevenDaysAgo } }).catch(() => 0),
      DownloadLog.countDocuments({ timestamp: { $gte: sevenDaysAgo } }).catch(() => 0),
      ActivityLog.countDocuments({ timestamp: { $lt: sevenDaysAgo } }).catch(() => 0),
      DownloadLog.countDocuments({ timestamp: { $lt: sevenDaysAgo } }).catch(() => 0)
    ]);
    
    return {
      total: {
        activityLogs: totalActivityLogs || 0,
        downloadLogs: totalDownloadLogs || 0,
        combined: (totalActivityLogs || 0) + (totalDownloadLogs || 0)
      },
      recent: {
        activityLogs: recentActivityLogs || 0,
        downloadLogs: recentDownloadLogs || 0,
        combined: (recentActivityLogs || 0) + (recentDownloadLogs || 0)
      },
      old: {
        activityLogs: oldActivityLogs || 0,
        downloadLogs: oldDownloadLogs || 0,
        combined: (oldActivityLogs || 0) + (oldDownloadLogs || 0)
      }
    };
  } catch (error) {
    console.error('❌ Error getting log statistics:', error);
    return {
      total: { activityLogs: 0, downloadLogs: 0, combined: 0 },
      recent: { activityLogs: 0, downloadLogs: 0, combined: 0 },
      old: { activityLogs: 0, downloadLogs: 0, combined: 0 }
    };
  }
};

// Legacy exports for backward compatibility
export const cleanupLogsManually = async (daysToKeep = 7) => {
  console.log(`🧹 Manual log cleanup triggered for all companies (keeping ${daysToKeep} days)...`);
  let totalResult = { activityLogsDeleted: 0, downloadLogsDeleted: 0, totalDeleted: 0 };
  
  for (const company of COMPANIES) {
    try {
      const connection = getCompanyConnection(company);
      const result = await cleanupLogsForConnection(connection, daysToKeep);
      totalResult.activityLogsDeleted += result.activityLogsDeleted;
      totalResult.downloadLogsDeleted += result.downloadLogsDeleted;
      totalResult.totalDeleted += result.totalDeleted;
    } catch (error) {
      console.error(`  ❌ ${company}: Manual cleanup failed -`, error.message);
    }
  }
  
  console.log(`✅ Manual cleanup completed: ${totalResult.totalDeleted} total logs removed`);
  return totalResult;
};

export const getLogStatistics = async () => {
  // Return stats for first company as default (legacy)
  try {
    const connection = getCompanyConnection(COMPANIES[0]);
    return await getLogStatisticsForConnection(connection);
  } catch (error) {
    return {
      total: { activityLogs: 0, downloadLogs: 0, combined: 0 },
      recent: { activityLogs: 0, downloadLogs: 0, combined: 0 },
      old: { activityLogs: 0, downloadLogs: 0, combined: 0 }
    };
  }
};

export default scheduleLogCleanup;
