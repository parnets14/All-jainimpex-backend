console.log('🔍 DEBUGGING DATE CALCULATION DIFFERENCE');
console.log('='.repeat(50));

const now = new Date();
console.log('Current Date:', now.toISOString());

// Method 1: Used by BULK analytics API (working)
const endDate1 = new Date();
let startDate1 = new Date();
startDate1.setDate(endDate1.getDate() - 30);

console.log('\n📊 BULK API Method (setDate):');
console.log('Start Date:', startDate1.toISOString());
console.log('End Date:', endDate1.toISOString());

// Method 2: Used by DETAILED analytics API (not working)
const endDate2 = new Date();
const startDate2 = new Date(endDate2.getTime() - 30 * 24 * 60 * 60 * 1000);

console.log('\n📊 DETAILED API Method (getTime):');
console.log('Start Date:', startDate2.toISOString());
console.log('End Date:', endDate2.toISOString());

// Check if there's a difference
console.log('\n🔍 Comparison:');
console.log('Start dates are equal:', startDate1.getTime() === startDate2.getTime());
console.log('End dates are equal:', endDate1.getTime() === endDate2.getTime());

if (startDate1.getTime() !== startDate2.getTime()) {
  console.log('❌ START DATES ARE DIFFERENT!');
  console.log('Difference in milliseconds:', Math.abs(startDate1.getTime() - startDate2.getTime()));
  console.log('Difference in hours:', Math.abs(startDate1.getTime() - startDate2.getTime()) / (1000 * 60 * 60));
}

// Test with sample order dates
const sampleOrderDates = [
  '2026-01-30T07:55:44.148Z', // SO-2026-0001
  '2026-01-31T06:48:22.656Z'  // SO-2026-0003
];

console.log('\n🧪 Testing with actual order dates:');
sampleOrderDates.forEach((dateStr, index) => {
  const orderDate = new Date(dateStr);
  const isInBulkRange = orderDate >= startDate1 && orderDate <= endDate1;
  const isInDetailedRange = orderDate >= startDate2 && orderDate <= endDate2;
  
  console.log(`\nOrder ${index + 1} (${dateStr}):`);
  console.log(`  In BULK range (setDate): ${isInBulkRange}`);
  console.log(`  In DETAILED range (getTime): ${isInDetailedRange}`);
  
  if (isInBulkRange !== isInDetailedRange) {
    console.log('  ❌ MISMATCH! This explains the difference.');
  }
});

// Test edge cases around month boundaries
console.log('\n📅 Testing month boundary edge cases:');

// Simulate different current dates
const testDates = [
  '2026-01-31T07:00:00.000Z', // End of January
  '2026-01-01T07:00:00.000Z', // Start of January
  '2026-02-28T07:00:00.000Z', // End of February (non-leap year)
];

testDates.forEach(testDateStr => {
  console.log(`\n🗓️ Testing with current date: ${testDateStr}`);
  
  const testNow = new Date(testDateStr);
  
  // Method 1: setDate
  const testEnd1 = new Date(testNow);
  let testStart1 = new Date(testNow);
  testStart1.setDate(testEnd1.getDate() - 30);
  
  // Method 2: getTime
  const testEnd2 = new Date(testNow);
  const testStart2 = new Date(testEnd2.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  console.log(`  setDate method: ${testStart1.toISOString()} to ${testEnd1.toISOString()}`);
  console.log(`  getTime method: ${testStart2.toISOString()} to ${testEnd2.toISOString()}`);
  console.log(`  Same result: ${testStart1.getTime() === testStart2.getTime()}`);
});