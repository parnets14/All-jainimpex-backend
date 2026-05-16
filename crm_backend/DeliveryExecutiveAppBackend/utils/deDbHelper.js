import { getCompanyConnection, isValidCompany } from '../../config/multiDatabase.js';
import { salesOrderSchema } from '../../models/SalesOrder.js';
import { userSchema } from '../../models/User.js';
import { dealerSchema } from '../../models/Dealer.js';
import { productSchema } from '../../models/Product.js';
import { regionSchema } from '../../models/Region.js';
import { deliveryAssignmentSchema } from '../models/DeliveryAssignment.js';
import { deliveryPaymentSchema } from '../models/DeliveryPayment.js';
import { deliveryRouteSchema } from '../models/DeliveryRoute.js';

/** Resolve company from query/body/token (same as SE/Dealer web modules) */
export function resolveCompanyKey(req) {
  const company =
    req.query?.company ||
    req.body?.company ||
    req.company ||
    req.user?.company ||
    'jain-impex';

  if (!isValidCompany(company)) {
    const err = new Error(
      `Invalid company: ${company}. Valid: jain-impex, ridhi, shree-jain-impex`,
    );
    err.statusCode = 400;
    throw err;
  }
  return company;
}

/** Company-scoped models for Delivery Executive APIs */
export function getDeModels(req) {
  const company = resolveCompanyKey(req);
  const db = getCompanyConnection(company);
  const model = (name, schema) => db.models[name] || db.model(name, schema);

  return {
    company,
    db,
    DeliveryAssignment: model('DeliveryAssignment', deliveryAssignmentSchema),
    DeliveryPayment: model('DeliveryPayment', deliveryPaymentSchema),
    DeliveryRoute: model('DeliveryRoute', deliveryRouteSchema),
    SalesOrder: model('SalesOrder', salesOrderSchema),
    User: model('User', userSchema),
    Dealer: model('Dealer', dealerSchema),
    Product: model('Product', productSchema),
    Region: model('Region', regionSchema),
  };
}
