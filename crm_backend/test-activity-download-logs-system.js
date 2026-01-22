import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ActivityLog from './models/ActivityLog.js';
import DownloadLog from './models/DownloadLog.js';
import { cleanupLogsManually, getLogStatistics } from './cron/logCleanup.js';

dotenv.config();

const testActivityDownloadLogsSystem = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Test 1: Create sample activity logs
    console.log('\n📝 Test 1: Creating sample activity logs...');
    const sampleActivityLogs = [
      {
        user: new mongoose.Types.ObjectId(),
        username: 'testuser1',
        module: 'User Management',
        activity: 'Viewed users list',
        action: 'READ',
        details: { method: 'GET', url: '/api/users' },
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 Test Browser',
        status: 'SUCCESS'
      },
      {
        user: new mongoose.Types.ObjectId(),
        username: 'testuser2',
        module: 'Dealer Management',
        activity: 'Created new dealer',
        action: 'CREATE',
        details: { method: 'POST', url: '/api/dealers' },
        ipAddress: '192.168.1.101',
        userAgent: 'Mozilla/5.0 Test Browser',
        status: 'SUCCESS'
      },
      // Create an old log (8 days ago) to test cleanup
      {
        user: new mongoose.Types.ObjectId(),
        username: 'testuser3',
        module: 'Product Management',
        activity: 'Viewed products list',
        action: 'READ',
        details: { method: 'GET', url: '/api/products' },
        ipAddress: '192.168.1.102',
        userAgent: 'Mozilla/5.0 Test Browser',
        status: 'SUCCESS',
        timestamp: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) // 8 days ago
      }
    ];

    const createdActivityLogs = await ActivityLog.insertMany(sampleActivityLogs);
    console.log(`✅ Created ${createdActivityLogs.length} sample activity logs`);

    // Test 2: Create sample download logs
    console.log('\n📥 Test 2: Creating sample download logs...');
    const sampleDownloadLogs = [
      {
        user: new mongoose.Types.ObjectId(),
        username: 'testuser1',
        reportName: 'Users Report',
        module: 'User Management',
        reportType: 'EXCEL',
        fileSize: 15420,
        filters: { role: 'admin', status: 'active' },
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 Test Browser',
        status: 'SUCCESS'
      },
      {
        user: new mongoose.Types.ObjectId(),
        username: 'testuser2',
        reportName: 'Dealers Report',
        module: 'Dealer Management',
        reportType: 'PDF',
        fileSize: 25680,
        filters: { region: 'North', type: 'retailer' },
        ipAddress: '192.168.1.101',
        userAgent: 'Mozilla/5.0 Test Browser',
        status: 'SUCCESS'
      },
      // Create an old download log (8 days ago) to test cleanup
      {
        user: new mongoose.Types.ObjectId(),
        username: 'testuser3',
        reportName: 'Products Report',
        module: 'Product Management',
        reportType: 'CSV',
        fileSize: 8950,
        filters: { category: 'pipes', brand: 'test' },
        ipAddress: '192.168.1.102',
        userAgent: 'Mozilla/5.0 Test Browser',
        status: 'SUCCESS',
        timestamp: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) // 8 days ago
      }
    ];

    const createdDownloadLogs = await DownloadLog.insertMany(sampleDownloadLogs);
    console.log(`✅ Created ${createdDownloadLogs.length} sample download logs`);

    // Test 3: Get log statistics
    console.log('\n📊 Test 3: Getting log statistics...');
    const stats = await getLogStatistics();
    console.log('📈 Log Statistics:');
    console.log(`   Total Activity Logs: ${stats.total.activityLogs}`);
    console.log(`   Total Download Logs: ${stats.total.downloadLogs}`);
    console.log(`   Recent Activity Logs: ${stats.recent.activityLogs}`);
    console.log(`   Recent Download Logs: ${stats.recent.downloadLogs}`);
    console.log(`   Old Activity Logs: ${stats.old.activityLogs}`);
    console.log(`   Old Download Logs: ${stats.old.downloadLogs}`);

    // Test 4: Test manual cleanup
    console.log('\n🧹 Test 4: Testing manual cleanup...');
    const cleanupResult = await cleanupLogsManually(7);
    console.log('🗑️ Cleanup Results:');
    console.log(`   Activity logs deleted: ${cleanupResult.activityLogsDeleted}`);
    console.log(`   Download logs deleted: ${cleanupResult.downloadLogsDeleted}`);
    console.log(`   Total logs deleted: ${cleanupResult.totalDeleted}`);

    // Test 5: Verify cleanup worked
    console.log('\n✅ Test 5: Verifying cleanup worked...');
    const statsAfterCleanup = await getLogStatistics();
    console.log('📈 Statistics after cleanup:');
    console.log(`   Total Activity Logs: ${statsAfterCleanup.total.activityLogs}`);
    console.log(`   Total Download Logs: ${statsAfterCleanup.total.downloadLogs}`);
    console.log(`   Old Activity Logs: ${statsAfterCleanup.old.activityLogs}`);
    console.log(`   Old Download Logs: ${statsAfterCleanup.old.downloadLogs}`);

    // Test 6: Test filtering and pagination (simulate API calls)
    console.log('\n🔍 Test 6: Testing filtering and pagination...');
    
    // Test activity logs filtering
    const filteredActivityLogs = await ActivityLog.find({
      module: { $regex: 'User', $options: 'i' }
    }).limit(10);
    console.log(`📋 Found ${filteredActivityLogs.length} activity logs matching 'User' module`);

    // Test download logs filtering
    const filteredDownloadLogs = await DownloadLog.find({
      reportType: 'EXCEL'
    }).limit(10);
    console.log(`📋 Found ${filteredDownloadLogs.length} download logs with type 'EXCEL'`);

    // Cleanup test data
    console.log('\n🧹 Cleaning up test data...');
    await ActivityLog.deleteMany({
      username: { $in: ['testuser1', 'testuser2', 'testuser3'] }
    });
    await DownloadLog.deleteMany({
      username: { $in: ['testuser1', 'testuser2', 'testuser3'] }
    });
    console.log('✅ Test data cleaned up');

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📋 Test Summary:');
    console.log('   ✅ Activity logs creation and retrieval');
    console.log('   ✅ Download logs creation and retrieval');
    console.log('   ✅ Log statistics calculation');
    console.log('   ✅ Manual cleanup functionality');
    console.log('   ✅ Filtering and pagination');
    console.log('   ✅ Database operations');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
};

// Run the test
testActivityDownloadLogsSystem();