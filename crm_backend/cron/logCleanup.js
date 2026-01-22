import cron from 'node-cron';
import ActivityLog from '../models/ActivityLog.js';
import DownloadLog from '../models/DownloadLog.js';

// Cron job to automatically cleanup old logs
// Runs every day at 2:00 AM to clean up logs older than 7 days
const scheduleLogCleanup = () => {
  cron.schedule('0 2 * * *', async () => {
    try {
      console.log('🧹 Running scheduled log cleanup...');
      
      // Calculate cutoff date (7 days ago)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);
      
      // Clean up activity logs older than 7 days
      const activityResult = await ActivityLog.deleteMany({
        timestamp: { $lt: cutoffDate }
      });
      
      // Clean up download logs older than 7 days
      const downloadResult = await DownloadLog.deleteMany({
        timestamp: { $lt: cutoffDate }
      });
      
      const totalCleaned = activityResult.deletedCount + downloadResult.deletedCount;
      
      if (totalCleaned > 0) {
        console.log(`✅ Scheduled log cleanup completed:`);
        console.log(`   - Activity logs cleaned: ${activityResult.deletedCount}`);
        console.log(`   - Download logs cleaned: ${downloadResult.deletedCount}`);
        console.log(`   - Total logs cleaned: ${totalCleaned}`);
      } else {
        console.log('✅ Scheduled log cleanup completed: No old logs to clean');
      }
      
      // Log the cleanup activity
      await ActivityLog.create({
        user: null, // System activity
        username: 'System',
        module: 'System Maintenance',
        activity: `Automatic log cleanup - Removed ${totalCleaned} old logs`,
        action: 'DELETE',
        details: {
          activityLogsDeleted: activityResult.deletedCount,
          downloadLogsDeleted: downloadResult.deletedCount,
          cutoffDate: cutoffDate.toISOString(),
          automated: true
        },
        status: 'SUCCESS'
      });
      
    } catch (error) {
      console.error('❌ Error in scheduled log cleanup:', error);
      
      // Log the failed cleanup
      try {
        await ActivityLog.create({
          user: null,
          username: 'System',
          module: 'System Maintenance',
          activity: 'Automatic log cleanup failed',
          action: 'DELETE',
          details: {
            error: error.message,
            automated: true
          },
          status: 'FAILED'
        });
      } catch (logError) {
        console.error('❌ Failed to log cleanup error:', logError);
      }
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata" // Adjust timezone as needed
  });
  
  console.log('🧹 Log cleanup cron job scheduled (daily at 2:00 AM IST)');
};

// Manual function to cleanup logs (can be called from API)
export const cleanupLogsManually = async (daysToKeep = 7) => {
  try {
    console.log(`🧹 Manual log cleanup triggered (keeping ${daysToKeep} days)...`);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const activityResult = await ActivityLog.deleteMany({
      timestamp: { $lt: cutoffDate }
    });
    
    const downloadResult = await DownloadLog.deleteMany({
      timestamp: { $lt: cutoffDate }
    });
    
    const totalCleaned = activityResult.deletedCount + downloadResult.deletedCount;
    
    console.log(`✅ Manual log cleanup completed:`);
    console.log(`   - Activity logs cleaned: ${activityResult.deletedCount}`);
    console.log(`   - Download logs cleaned: ${downloadResult.deletedCount}`);
    console.log(`   - Total logs cleaned: ${totalCleaned}`);
    
    return {
      activityLogsDeleted: activityResult.deletedCount,
      downloadLogsDeleted: downloadResult.deletedCount,
      totalDeleted: totalCleaned
    };
  } catch (error) {
    console.error('❌ Error in manual log cleanup:', error);
    throw error;
  }
};

// Function to get log statistics
export const getLogStatistics = async () => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
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
    // Return default stats if there's an error
    return {
      total: { activityLogs: 0, downloadLogs: 0, combined: 0 },
      recent: { activityLogs: 0, downloadLogs: 0, combined: 0 },
      old: { activityLogs: 0, downloadLogs: 0, combined: 0 }
    };
  }
};

export default scheduleLogCleanup;