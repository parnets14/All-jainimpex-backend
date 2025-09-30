// testEmployee.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Employee from '../models/Employee.js';

dotenv.config();

const testEmployeeCreation = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Test data
    const testEmployee = {
      name: 'Test Employee',
      empId: 'TEST-001',
      designation: 'Software Developer',
      department: 'IT',
      dateOfJoining: new Date(),
      bankName: 'Test Bank',
      accountNumber: '1234567890',
      ifscCode: 'TEST0000001',
      branch: 'Test Branch',
      basicSalary: 50000,
      salaryType: 'fixed',
      hra: 20000,
      conveyance: 2000,
      medicalAllowance: 3000,
      specialAllowance: 10000,
      pf: 3000,
      professionalTax: 200,
      tds: 4000,
      otherDeductions: 500
    };

    console.log('Creating test employee...');
    const employee = await Employee.create(testEmployee);
    
    console.log('✅ Employee created successfully!');
    console.log('Gross Salary:', employee.grossSalary);
    console.log('Net Salary:', employee.netSalary);
    
    // Clean up
    await Employee.findByIdAndDelete(employee._id);
    console.log('✅ Test employee deleted');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
};

testEmployeeCreation();