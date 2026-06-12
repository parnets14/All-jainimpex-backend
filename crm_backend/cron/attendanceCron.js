import cron from "node-cron";
import { attendanceSchema } from "../models/Attendance.js";
import { employeeSchema } from "../models/Employee.js";
import { leaveSchema } from "../models/Leave.js";
import {
  getCompanyConnection,
  getValidCompanies,
} from "../config/multiDatabase.js";

// Resolve company-scoped models from a database connection
const getModels = (dbConnection) => {
  return {
    Attendance:
      dbConnection.models.Attendance ||
      dbConnection.model("Attendance", attendanceSchema),
    Employee:
      dbConnection.models.Employee ||
      dbConnection.model("Employee", employeeSchema),
    Leave:
      dbConnection.models.Leave || dbConnection.model("Leave", leaveSchema),
  };
};

// Mark absent for employees of a single company who didn't punch in today
const markAbsentForCompany = async (company) => {
  try {
    const dbConnection = getCompanyConnection(company);
    const { Attendance, Employee, Leave } = getModels(dbConnection);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeEmployees = await Employee.find({ status: "Active" }).select(
      "_id"
    );
    const presentEmployees = await Attendance.find({
      date: today,
      "punchIn.time": { $exists: true },
    }).select("employee");

    const presentEmployeeIds = presentEmployees.map((att) =>
      att.employee.toString()
    );

    // Employees who didn't punch in today
    const absentEmployees = activeEmployees.filter(
      (emp) => !presentEmployeeIds.includes(emp._id.toString())
    );

    // Approved leaves covering today
    const approvedLeaves = await Leave.find({
      startDate: { $lte: today },
      endDate: { $gte: today },
      status: "Approved",
    }).populate("employee");

    const leaveEmployeeIds = approvedLeaves
      .filter((leave) => leave.employee)
      .map((leave) => leave.employee._id.toString());

    for (const employee of absentEmployees) {
      const isOnLeave = leaveEmployeeIds.includes(employee._id.toString());

      await Attendance.findOneAndUpdate(
        { employee: employee._id, date: today },
        {
          employee: employee._id,
          date: today,
          status: isOnLeave ? "Leave" : "Absent",
          leaveType: isOnLeave
            ? approvedLeaves.find(
                (leave) =>
                  leave.employee &&
                  leave.employee._id.toString() === employee._id.toString()
              )?.leaveType
            : null,
          reason: isOnLeave ? "Approved leave" : "Not punched in",
        },
        { upsert: true, new: true }
      );
    }

    console.log(
      `[${company}] Auto-marked absent for ${absentEmployees.length} employees`
    );
  } catch (error) {
    console.error(`[${company}] Auto mark absent error:`, error.message);
  }
};

// Run every day at 11:59 PM to mark absent across all companies
cron.schedule("59 23 * * *", async () => {
  const companies = getValidCompanies();
  for (const company of companies) {
    await markAbsentForCompany(company);
  }
});
