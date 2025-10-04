// import { Queue, Worker } from 'bullmq';
// import mongoose from 'mongoose';
// import Employee from '../models/Employee.js';
// import Salary from '../models/SalarySlip.js';
// import Attendance from '../models/Attendance.js';
// import { generateSalaryPDF } from '../utils/pdfGenerator.js';
// import path from 'path';
// import fs from 'fs';
// import { fileURLToPath } from 'url';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// const connection = {
//   host: process.env.REDIS_HOST || 'localhost',
//   port: process.env.REDIS_PORT || 6379,
// };

// // Create salary queue
// export const salaryQueue = new Queue('salary generation', { connection });

// // Salary worker
// export const salaryWorker = new Worker('salary generation', async job => {
//   const { employeeId, month, year, generatedBy } = job.data;
  
//   try {
//     console.log(`Processing salary for employee ${employeeId}, ${month}/${year}`);
    
//     const employee = await Employee.findById(employeeId);
//     if (!employee) {
//       throw new Error('Employee not found');
//     }

//     // Calculate salary period (1st to last day of month)
//     const periodFrom = new Date(year, month - 1, 1);
//     const periodTo = new Date(year, month, 0); // Last day of month

//     // Get attendance for the month
//     const attendance = await Attendance.find({
//       employeeId,
//       date: {
//         $gte: periodFrom,
//         $lte: periodTo
//       }
//     });

//     // Calculate working days (excluding weekends)
//     let workingDays = 0;
//     let presentDays = 0;
//     let currentDate = new Date(periodFrom);
    
//     while (currentDate <= periodTo) {
//       const dayOfWeek = currentDate.getDay();
//       // Exclude weekends (0 = Sunday, 6 = Saturday)
//       if (dayOfWeek !== 0 && dayOfWeek !== 6) {
//         workingDays++;
        
//         // Check if employee was present on this day
//         const attendanceRecord = attendance.find(a => 
//           a.date.toDateString() === currentDate.toDateString()
//         );
        
//         if (attendanceRecord && attendanceRecord.status === 'present') {
//           presentDays++;
//         }
//       }
//       currentDate.setDate(currentDate.getDate() + 1);
//     }

//     // Calculate salary based on salary type
//     let calculatedSalary = 0;
//     const absentDays = workingDays - presentDays;

//     switch (employee.salaryType) {
//       case 'monthly':
//         calculatedSalary = (employee.basicSalary / workingDays) * presentDays;
//         break;
//       case 'daily':
//         calculatedSalary = employee.basicSalary * presentDays;
//         break;
//       case 'hourly':
//         // Calculate total hours worked
//         const totalHours = attendance.reduce((total, record) => {
//           if (record.status === 'present' && record.hoursWorked) {
//             return total + record.hoursWorked;
//           }
//           return total;
//         }, 0);
//         calculatedSalary = employee.basicSalary * totalHours;
//         break;
//       default:
//         calculatedSalary = employee.basicSalary;
//     }

//     // Calculate allowances and deductions
//     const allowancesTotal = 
//       (employee.hra || 0) + 
//       (employee.conveyance || 0) + 
//       (employee.medicalAllowance || 0) + 
//       (employee.specialAllowance || 0);

//     const deductionsTotal = 
//       (employee.pf || 0) + 
//       (employee.professionalTax || 0) + 
//       (employee.tds || 0) + 
//       (employee.otherDeductions || 0);

//     const grossSalary = calculatedSalary + allowancesTotal;
//     const netSalary = grossSalary - deductionsTotal;

//     // Create salary record
//     const salaryData = {
//       employeeId,
//       employee: {
//         name: employee.name,
//         empId: employee.empId,
//         designation: employee.designation,
//         department: employee.department
//       },
//       month,
//       year,
//       period: {
//         from: periodFrom,
//         to: periodTo
//       },
//       basicSalary: calculatedSalary,
//       allowances: {
//         hra: employee.hra || 0,
//         conveyance: employee.conveyance || 0,
//         medicalAllowance: employee.medicalAllowance || 0,
//         specialAllowance: employee.specialAllowance || 0,
//         total: allowancesTotal
//       },
//       deductions: {
//         pf: employee.pf || 0,
//         professionalTax: employee.professionalTax || 0,
//         tds: employee.tds || 0,
//         otherDeductions: employee.otherDeductions || 0,
//         total: deductionsTotal
//       },
//       grossSalary,
//       netSalary,
//       workingDays,
//       presentDays,
//       absentDays,
//       leaveDays: attendance.filter(a => a.status === 'leave').length,
//       overtimeHours: attendance.reduce((total, record) => total + (record.overtimeHours || 0), 0),
//       status: 'generated',
//       generatedBy
//     };

//     const salary = new Salary(salaryData);
//     await salary.save();

//     // Generate PDF
//     const pdfBuffer = await generateSalaryPDF(salary);
    
//     // Ensure salary-slips directory exists
//     const slipsDir = path.join(__dirname, '../uploads/salary-slips');
//     if (!fs.existsSync(slipsDir)) {
//       fs.mkdirSync(slipsDir, { recursive: true });
//     }

//     const pdfFilename = `salary-slip-${employee.empId}-${month}-${year}.pdf`;
//     const pdfPath = path.join(slipsDir, pdfFilename);
    
//     fs.writeFileSync(pdfPath, pdfBuffer);
    
//     // Update salary with PDF path
//     salary.pdfPath = `uploads/salary-slips/${pdfFilename}`;
//     await salary.save();

//     console.log(`Salary generated successfully for ${employee.name}`);
    
//     return {
//       success: true,
//       salaryId: salary._id,
//       employeeName: employee.name,
//       netSalary,
//       pdfPath: salary.pdfPath
//     };

//   } catch (error) {
//     console.error(`Error generating salary for employee ${employeeId}:`, error);
//     throw error;
//   }
// }, { connection });

// // Handle worker events
// salaryWorker.on('completed', job => {
//   console.log(`Salary job ${job.id} completed for employee ${job.data.employeeId}`);
// });

// salaryWorker.on('failed', (job, err) => {
//   console.error(`Salary job ${job.id} failed:`, err);
// });