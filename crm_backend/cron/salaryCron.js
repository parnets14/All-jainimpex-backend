import cron from 'node-cron';
import { salaryQueue } from '../queue/salaryQueue.js';
import Employee from '../models/Employee.js';
import Salary from '../models/SalarySlip.js';

// Run on 1st of every month at 2:00 AM
cron.schedule('0 2 1 * *', async () => {
  try {
    console.log('🚀 Starting automatic salary generation...');
    
    const currentDate = new Date();
    const month = currentDate.getMonth() + 1;
    const year = currentDate.getFullYear();

    const activeEmployees = await Employee.find({ status: 'Active' });

    let generatedCount = 0;
    let skippedCount = 0;

    for (const employee of activeEmployees) {
      // Check if salary already exists for this month
      const existingSalary = await Salary.findOne({
        employeeId: employee._id,
        month,
        year
      });

      if (!existingSalary) {
        await salaryQueue.add('generate salary', {
          employeeId: employee._id,
          month,
          year,
          generatedBy: null // System generated
        });
        generatedCount++;
        console.log(`Queued salary generation for ${employee.name}`);
      } else {
        skippedCount++;
      }
    }

    console.log(`✅ Automatic salary generation completed: ${generatedCount} queued, ${skippedCount} skipped`);
  } catch (error) {
    console.error('❌ Error in automatic salary generation:', error);
  }
});

console.log('⏰ Salary cron job initialized - will run on 1st of every month');