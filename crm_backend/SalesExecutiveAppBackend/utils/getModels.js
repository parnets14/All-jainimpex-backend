/**
 * getModels — returns company-specific Mongoose models from req.dbConnection
 * This ensures all SE controllers query the correct company database.
 *
 * Usage in a controller:
 *   const { Dealer, Product, SalesOrder } = getModels(req);
 */

import { dealerSchema }                from '../../models/Dealer.js';
import { productSchema }               from '../../models/Product.js';
import { salesOrderSchema }            from '../../models/SalesOrder.js';
import { dealerInvoiceSchema }         from '../../models/DealerInvoice.js';
import { dealerLedgerSchema }          from '../../models/DealerLedger.js';
import { dealerPaymentSchema }         from '../../models/DealerPayment.js';
import { creditNoteSchema }            from '../../models/CreditNote.js';
import { dealerPricingSchema }         from '../../models/DealerPricing.js';
import { claimSchema }                 from '../../models/Claim.js';
import { claimTypeSchema }             from '../../models/ClaimType.js';
import { userSchema }                  from '../../models/User.js';
import { stockMovementSchema }         from '../../models/Stock.js';
import { warehouseSchema }             from '../../models/Warehouse.js';
import { grnSchema }                   from '../../models/GRN.js';
import { discountMappingSchema }       from '../../models/DiscountMapping.js';
import { pointsSchema }                from '../../models/Points.js';
import { brandSchema }                 from '../../models/Brand.js';
import { categorySchema }              from '../../models/Category.js';
import { subcategorySchema }           from '../../models/Subcategory.js';
import { extendedSubcategorySchema }   from '../../models/ExtendedSubcategory.js';
import { routeSchema }                 from '../../models/Route.js';
import { regionSchema }                from '../../models/Region.js';
import { employeeSchema }              from '../../models/Employee.js';
import { attendanceSchema as hrmsAttendanceSchema } from '../../models/Attendance.js';
import { getCompanyConnection }        from '../../config/multiDatabase.js';

// SE-specific model schemas
import { attendanceSchema }          from '../models/Attendance.js';
import { collectionSchema }          from '../models/Collection.js';
import { routePlanSchema }           from '../models/RoutePlan.js';
import { targetSchema }              from '../models/Target.js';
import { seNotificationSchema }      from '../models/SENotification.js';
import { dealerVisitSchema }         from '../models/DealerVisit.js';

const getOrCreate = (conn, name, schema) => {
  return conn.models[name] || conn.model(name, schema);
};

// Master company for SE Attendance — all companies share one attendance record
const ATTENDANCE_MASTER_COMPANY = 'jain-impex';

export const getModels = (req) => {
  const conn = req.dbConnection;
  if (!conn) throw new Error('req.dbConnection not set — protect middleware missing?');

  // SE Attendance is ALWAYS stored in the master company (jain-impex) DB
  // so that check-in from any company is visible across all companies.
  const masterConn = getCompanyConnection(ATTENDANCE_MASTER_COMPANY);

  return {
    // Shared CRM models (per-company)
    Dealer:               getOrCreate(conn, 'Dealer',               dealerSchema),
    Product:              getOrCreate(conn, 'Product',               productSchema),
    SalesOrder:           getOrCreate(conn, 'SalesOrder',            salesOrderSchema),
    DealerInvoice:        getOrCreate(conn, 'DealerInvoice',         dealerInvoiceSchema),
    DealerLedger:         getOrCreate(conn, 'DealerLedger',          dealerLedgerSchema),
    DealerPayment:        getOrCreate(conn, 'DealerPayment',         dealerPaymentSchema),
    CreditNote:           getOrCreate(conn, 'CreditNote',            creditNoteSchema),
    DealerPricing:        getOrCreate(conn, 'DealerPricing',         dealerPricingSchema),
    Claim:                getOrCreate(conn, 'Claim',                 claimSchema),
    ClaimType:            getOrCreate(conn, 'ClaimType',             claimTypeSchema),
    User:                 getOrCreate(conn, 'User',                  userSchema),
    StockMovement:        getOrCreate(conn, 'StockMovement',         stockMovementSchema),
    Warehouse:            getOrCreate(conn, 'Warehouse',             warehouseSchema),
    GRN:                  getOrCreate(conn, 'GRN',                   grnSchema),
    DiscountMapping:      getOrCreate(conn, 'DiscountMapping',       discountMappingSchema),
    Points:               getOrCreate(conn, 'Points',                pointsSchema),
    Brand:                getOrCreate(conn, 'Brand',                 brandSchema),
    Category:             getOrCreate(conn, 'Category',              categorySchema),
    Subcategory:          getOrCreate(conn, 'Subcategory',           subcategorySchema),
    ExtendedSubcategory:  getOrCreate(conn, 'ExtendedSubcategory',   extendedSubcategorySchema),
    Route:                getOrCreate(conn, 'Route',                 routeSchema),
    Region:               getOrCreate(conn, 'Region',                regionSchema),
    Employee:             getOrCreate(conn, 'Employee',              employeeSchema),
    Attendance:           getOrCreate(conn, 'Attendance',            hrmsAttendanceSchema),

    // SE Attendance — uses master (jain-impex) DB so check-in is shared across all companies
    SEAttendance:    getOrCreate(masterConn, 'SEAttendance',    attendanceSchema),

    // SE-specific models (per-company)
    Collection:      getOrCreate(conn, 'Collection',      collectionSchema),
    RoutePlan:       getOrCreate(conn, 'RoutePlan',       routePlanSchema),
    Target:          getOrCreate(conn, 'Target',          targetSchema),
    SENotification:  getOrCreate(conn, 'SENotification',  seNotificationSchema),
    DealerVisit:     getOrCreate(conn, 'DealerVisit',     dealerVisitSchema),
  };
};

export default getModels;
