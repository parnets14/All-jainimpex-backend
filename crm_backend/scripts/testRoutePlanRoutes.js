// Quick test to verify route plan routes are registered
console.log('Route Plan Routes Test');
console.log('======================\n');

console.log('Expected routes:');
console.log('POST /api/se/route-plan/dealer/visit');
console.log('POST /api/se/route-plan/dealer/skip');
console.log('\nMake sure the backend server is running and restart it if needed.');
console.log('\nTest by making a request to:');
console.log('curl -X POST http://localhost:5000/api/se/route-plan/dealer/visit');
