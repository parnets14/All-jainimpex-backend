/**
 * seedController.js
 * Seeds standard Claim Types and Expense Types into ALL company databases.
 * POST /api/admin/seed-types  (super_admin only)
 *
 * Safe to run multiple times — uses upsert so existing records are not duplicated.
 */

import { getCompanyConnection, getValidCompanies } from '../config/multiDatabase.js';
import { claimTypeSchema }   from '../models/ClaimType.js';
import { expenseTypeSchema } from '../models/ExpenseType.js';

// ── Standard types to seed ────────────────────────────────────────────────────
const STANDARD_CLAIM_TYPES = [
  { name: 'Travel Expense',       description: 'Fuel, cab, bus, train, flight costs',  maxAmount: 5000  },
  { name: 'Food & Meals',         description: 'Meals during field visits',             maxAmount: 1000  },
  { name: 'Accommodation',        description: 'Hotel / lodging during outstation',     maxAmount: 3000  },
  { name: 'Communication',        description: 'Mobile recharge, internet, calls',      maxAmount: 500   },
  { name: 'Stationery & Printing',description: 'Office supplies, printing costs',       maxAmount: 500   },
  { name: 'Client Entertainment', description: 'Dealer meetings, gifts, hospitality',   maxAmount: 2000  },
  { name: 'Medical',              description: 'Medical expenses during field duty',     maxAmount: 2000  },
  { name: 'Miscellaneous',        description: 'Other approved expenses',               maxAmount: 1000  },
];

const STANDARD_EXPENSE_TYPES = [
  { name: 'Office Supplies',      description: 'Stationery, printer ink, etc.'          },
  { name: 'Travel',               description: 'Business travel expenses'               },
  { name: 'Utilities',            description: 'Electricity, water, internet bills'     },
  { name: 'Rent',                 description: 'Office / warehouse rent'                },
  { name: 'Salaries',             description: 'Employee salary payments'               },
  { name: 'Marketing',            description: 'Advertising and promotional expenses'   },
  { name: 'Maintenance',          description: 'Equipment and facility maintenance'     },
  { name: 'Miscellaneous',        description: 'Other business expenses'                },
];

// ── Helper: upsert one document ───────────────────────────────────────────────
const upsertByName = async (Model, data, createdById) => {
  const existing = await Model.findOne({ name: data.name });
  if (existing) return { action: 'skipped', name: data.name };
  await Model.create({ ...data, createdBy: createdById });
  return { action: 'created', name: data.name };
};

// ── Controller ────────────────────────────────────────────────────────────────
export const seedTypesForAllCompanies = async (req, res) => {
  // Only super_admin can run this
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ success: false, message: 'Super admin only' });
  }

  const companies = getValidCompanies(); // ['jain-impex', 'ridhi', 'shree-jain-impex']
  const report    = {};

  for (const company of companies) {
    try {
      const conn = getCompanyConnection(company);

      // Get or create models on this connection
      const ClaimType   = conn.models.ClaimType   || conn.model('ClaimType',   claimTypeSchema);
      const ExpenseType = conn.models.ExpenseType || conn.model('ExpenseType', expenseTypeSchema);

      // Use the requesting user's _id as createdBy (super_admin)
      const createdBy = req.user._id;

      // Seed claim types
      const claimResults = await Promise.all(
        STANDARD_CLAIM_TYPES.map(ct => upsertByName(ClaimType, ct, createdBy))
      );

      // Seed expense types
      const expenseResults = await Promise.all(
        STANDARD_EXPENSE_TYPES.map(et => upsertByName(ExpenseType, et, createdBy))
      );

      report[company] = {
        success: true,
        claimTypes: {
          created: claimResults.filter(r => r.action === 'created').map(r => r.name),
          skipped: claimResults.filter(r => r.action === 'skipped').map(r => r.name),
        },
        expenseTypes: {
          created: expenseResults.filter(r => r.action === 'created').map(r => r.name),
          skipped: expenseResults.filter(r => r.action === 'skipped').map(r => r.name),
        },
      };

      console.log(`✅ Seeded types for ${company}:`, {
        claimCreated:   report[company].claimTypes.created.length,
        expenseCreated: report[company].expenseTypes.created.length,
      });

    } catch (err) {
      console.error(`❌ Seed failed for ${company}:`, err.message);
      report[company] = { success: false, error: err.message };
    }
  }

  const allOk = Object.values(report).every(r => r.success);

  return res.status(allOk ? 200 : 207).json({
    success: allOk,
    message: allOk
      ? 'Standard types seeded successfully across all companies'
      : 'Seeding completed with some errors',
    report,
  });
};
