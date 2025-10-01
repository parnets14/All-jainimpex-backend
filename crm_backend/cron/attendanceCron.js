import cron from 'node-cron';
import Attendance from '../models/Attendance.js';
import Employee from '../models/Employee.js';
import Leave from '../models/Leave.js';

// Run every day at 11:59 PM to mark absent for employees who didn't punch in
cron.schedule('59 23 * * *', async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeEmployees = await Employee.find({ status: 'Active' }).select('_id');
    const presentEmployees = await Attendance.find({ 
      date: today,
      'punchIn.time': { $exists: true }
    }).select('employee');

    const presentEmployeeIds = presentEmployees.map(att => att.employee.toString());
    
    // Find employees who didn't punch in today
    const absentEmployees = activeEmployees.filter(
      emp => !presentEmployeeIds.includes(emp._id.toString())
    );

    // Check for approved leaves
    const approvedLeaves = await Leave.find({
      startDate: { $lte: today },
      endDate: { $gte: today },
      status: 'Approved'
    }).populate('employee');

    const leaveEmployeeIds = approvedLeaves.map(leave => leave.employee._id.toString());

    // Create absent records
    for (const employee of absentEmployees) {
      const isOnLeave = leaveEmployeeIds.includes(employee._id.toString());
      
      await Attendance.findOneAndUpdate(
        {
          employee: employee._id,
          date: today
        },
        {
          employee: employee._id,
          date: today,
          status: isOnLeave ? 'Leave' : 'Absent',
          leaveType: isOnLeave ? approvedLeaves.find(
            leave => leave.employee._id.toString() === employee._id.toString()
          )?.leaveType : null,
          reason: isOnLeave ? 'Approved leave' : 'Not punched in'
        },
        { upsert: true, new: true }
      );
    }

    console.log(`Auto-marked absent for ${absentEmployees.length} employees`);
  } catch (error) {
    console.error('Auto mark absent error:', error);
  }
});