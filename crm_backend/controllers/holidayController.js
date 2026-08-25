import { holidaySchema } from '../models/Holiday.js';
import { attendanceSchema } from '../models/Attendance.js';
import { salarySlipSchema } from '../models/SalarySlip.js';

const getModels = (conn) => ({
  Holiday: conn.models.Holiday || conn.model('Holiday', holidaySchema),
  Attendance: conn.models.Attendance || conn.model('Attendance', attendanceSchema),
  SalarySlip: conn.models.SalarySlip || conn.model('SalarySlip', salarySlipSchema),
});

// Helper: IST midnight for a given date
const istMidnight = (d) => {
  const ms = new Date(d).getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(ms);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 60 * 60 * 1000);
};

// GET /api/hrms/holidays?year=2026
export const getHolidays = async (req, res) => {
  try {
    const { Holiday } = getModels(req.dbConnection);
    const { year } = req.query;
    const filter = {};
    if (year) filter.year = parseInt(year, 10);
    const holidays = await Holiday.find(filter).sort({ date: 1 }).lean();
    res.json({ success: true, holidays });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /api/hrms/holidays
export const createHoliday = async (req, res) => {
  try {
    const { Holiday } = getModels(req.dbConnection);
    const { date, name, type, departments } = req.body;

    if (!date || !name) {
      return res.status(400).json({ success: false, message: 'date and name are required' });
    }

    const holidayDate = istMidnight(new Date(date));
    const year = new Date(holidayDate.getTime() + 5.5 * 60 * 60 * 1000).getUTCFullYear();

    const holiday = await Holiday.create({
      date: holidayDate,
      name,
      type: type || 'national',
      departments: departments || [],
      year,
      createdBy: req.user?._id,
    });

    res.status(201).json({ success: true, holiday, message: 'Holiday added' });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(400).json({ success: false, message: 'A holiday already exists on this date' });
    }
    res.status(500).json({ success: false, message: e.message });
  }
};

// PUT /api/hrms/holidays/:id
export const updateHoliday = async (req, res) => {
  try {
    const { Holiday } = getModels(req.dbConnection);
    const { date, name, type, departments } = req.body;

    const update = {};
    if (name) update.name = name;
    if (type) update.type = type;
    if (departments !== undefined) update.departments = departments;
    if (date) {
      update.date = istMidnight(new Date(date));
      update.year = new Date(update.date.getTime() + 5.5 * 60 * 60 * 1000).getUTCFullYear();
    }

    const holiday = await Holiday.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!holiday) return res.status(404).json({ success: false, message: 'Holiday not found' });

    res.json({ success: true, holiday, message: 'Holiday updated' });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(400).json({ success: false, message: 'A holiday already exists on this date' });
    }
    res.status(500).json({ success: false, message: e.message });
  }
};

// DELETE /api/hrms/holidays/:id
export const deleteHoliday = async (req, res) => {
  try {
    const { Holiday } = getModels(req.dbConnection);
    const holiday = await Holiday.findByIdAndDelete(req.params.id);
    if (!holiday) return res.status(404).json({ success: false, message: 'Holiday not found' });
    res.json({ success: true, message: 'Holiday deleted' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

/**
 * Utility: get all holiday dates for a given month/year as a Set of ISO date strings.
 * Used by salary engine and attendance finalizer to skip holidays.
 * @param {object} dbConnection - mongoose connection
 * @param {number} year
 * @param {number} month - 1-indexed
 * @returns {Set<string>} - set of 'YYYY-MM-DD' strings in IST
 */
export const getHolidayDatesForMonth = async (dbConnection, year, month, employee = null) => {
  const Holiday = dbConnection.models.Holiday || dbConnection.model('Holiday', holidaySchema);

  // Month boundaries in IST
  const istMid = (d) => {
    const ms = new Date(d).getTime() + 5.5 * 3600000;
    const ist = new Date(ms); ist.setUTCHours(0, 0, 0, 0);
    return new Date(ist.getTime() - 5.5 * 3600000);
  };
  const from = istMid(new Date(year, month - 1, 1));
  const to = new Date(istMid(new Date(year, month, 0)).getTime() + 86400000 - 1);

  const filter = {
    date: { $gte: from, $lte: to },
    $or: [
      { departments: { $exists: false } },
      { departments: { $size: 0 } },
      ...(employee?.department ? [{ departments: employee.department }] : []),
    ],
  };
  const holidays = await Holiday.find(filter).select('date name departments').lean();

  const set = new Set();
  for (const h of holidays) {
    const istDate = new Date(new Date(h.date).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
    set.add(istDate);
  }
  return set;
};

/**
 * Check if a specific date is a holiday.
 * @param {object} dbConnection
 * @param {Date} date
 * @returns {boolean}
 */
export const isHoliday = async (dbConnection, date) => {
  const Holiday = dbConnection.models.Holiday || dbConnection.model('Holiday', holidaySchema);
  const dayStart = istMidnight(date);
  const dayEnd = new Date(dayStart.getTime() + 86400000 - 1);
  const count = await Holiday.countDocuments({ date: { $gte: dayStart, $lte: dayEnd } });
  return count > 0;
};

/**
 * POST /api/hrms/holidays/fix-attendance
 * One-time cleanup: find all attendance records marked "Absent" that fall on a
 * holiday date, and DELETE them. These were incorrectly created by the
 * finalizeDayAttendance cron before the holiday system was integrated.
 *
 * Also optionally deletes salary slips for affected months so they can be
 * regenerated with correct calculations.
 *
 * Request body (optional):
 *   { deleteSalarySlips: true }  — also remove salary slips for affected months
 *
 * Returns: { success, deletedAttendance, affectedMonths, deletedSalarySlips }
 */
export const fixAbsentOnHolidays = async (req, res) => {
  try {
    const { Holiday, Attendance, SalarySlip } = getModels(req.dbConnection);
    const { deleteSalarySlips = false } = req.body || {};

    // Get ALL holidays ever created
    const holidays = await Holiday.find({}).select('date').lean();
    if (holidays.length === 0) {
      return res.json({
        success: true,
        message: 'No holidays configured. Add holidays first, then run this fix.',
        deletedAttendance: 0,
        affectedMonths: [],
        deletedSalarySlips: 0,
      });
    }

    let totalDeleted = 0;
    const affectedMonthSet = new Set(); // 'YYYY-MM' strings

    for (const h of holidays) {
      const dayStart = istMidnight(h.date);
      const dayEnd = new Date(dayStart.getTime() + 86400000 - 1);

      // Find all "Absent" attendance records on this holiday date
      // (records with no punch data — just the auto-generated absent marker)
      const absentRecords = await Attendance.find({
        date: { $gte: dayStart, $lte: dayEnd },
        status: 'Absent',
        $or: [
          { sessions: { $size: 0 } },
          { sessions: { $exists: false } },
        ],
      }).select('_id date employee').lean();

      if (absentRecords.length > 0) {
        // Track affected months for salary regeneration
        for (const rec of absentRecords) {
          const istDate = new Date(new Date(rec.date).getTime() + 5.5 * 3600000);
          const ym = `${istDate.getUTCFullYear()}-${String(istDate.getUTCMonth() + 1).padStart(2, '0')}`;
          affectedMonthSet.add(ym);
        }

        // Delete the incorrect absent records
        const result = await Attendance.deleteMany({
          _id: { $in: absentRecords.map(r => r._id) },
        });
        totalDeleted += result.deletedCount;
      }
    }

    const affectedMonths = [...affectedMonthSet].sort();

    // Optionally delete salary slips for affected months so admin can regenerate them
    let deletedSalarySlips = 0;
    if (deleteSalarySlips && affectedMonths.length > 0) {
      for (const ym of affectedMonths) {
        const [year, month] = ym.split('-');
        const result = await SalarySlip.deleteMany({
          year: parseInt(year, 10),
          month: month, // stored as string in the model
        });
        deletedSalarySlips += result.deletedCount;
        // Also try with month as number (in case it was stored differently)
        if (result.deletedCount === 0) {
          const r2 = await SalarySlip.deleteMany({
            year: parseInt(year, 10),
            month: parseInt(month, 10),
          });
          deletedSalarySlips += r2.deletedCount;
        }
      }
    }

    res.json({
      success: true,
      message: `Fixed! Deleted ${totalDeleted} incorrect absent record(s) on holidays.${deleteSalarySlips ? ` Removed ${deletedSalarySlips} salary slip(s) for affected months — regenerate them from the salary page.` : ''}`,
      deletedAttendance: totalDeleted,
      affectedMonths,
      deletedSalarySlips,
    });
  } catch (e) {
    console.error('fixAbsentOnHolidays error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
