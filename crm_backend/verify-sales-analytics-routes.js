// Quick verification script to check if the sales analytics routes are properly loaded
import express from 'express';
import salesAnalyticsRoutes from './routes/salesAnalyticsRoutes.js';

console.log('🧪 Verifying Sales Analytics Routes...\n');

try {
  // Create a test express app
  const testApp = express();
  
  // Try to use the routes
  testApp.use('/api/sales-analytics', salesAnalyticsRoutes);
  
  console.log('✅ Sales analytics routes imported successfully');
  console.log('✅ Routes can be mounted on Express app');
  
  // Check if the routes are properly defined
  const routeStack = salesAnalyticsRoutes.stack;
  if (routeStack && routeStack.length > 0) {
    console.log(`✅ Found ${routeStack.length} route(s) defined:`);
    routeStack.forEach((layer, index) => {
      const method = Object.keys(layer.route.methods)[0].toUpperCase();
      const path = layer.route.path;
      console.log(`   ${index + 1}. ${method} /api/sales-analytics${path}`);
    });
  }
  
  console.log('\n🎉 Sales Analytics Routes verification completed successfully!');
  console.log('📝 The routes should now work with the main server.');
  
} catch (error) {
  console.error('❌ Error verifying sales analytics routes:', error.message);
  console.error('💡 This indicates there might be an import/export issue.');
}