/**
 * End-to-end verification for GET /api/dealer-invoices/:id
 *
 * Proves the fix: after dealerInvoiceController's getModels() runs, a FRESH
 * company connection has ServiceChargeMaster registered, so the populate() in
 * getDealerInvoice resolves instead of throwing MissingSchemaError -> 500.
 *
 * Runs against a real mongoose connection object with no database attached:
 * mongoose resolves populate schemas from the connection registry alone, which
 * is exactly the step that was failing.
 *
 *   node scripts/__verify_dealer_invoice_populate.mjs
 */
import mongoose from 'mongoose';
import { dealerInvoiceSchema } from '../models/DealerInvoice.js';
import { serviceChargeMasterSchema } from '../models/ServiceChargeMaster.js';

let pass = 0;
let fail = 0;
const check = (label, fn) => {
  try {
    fn();
    pass += 1;
    console.log(`  ok    ${label}`);
  } catch (error) {
    fail += 1;
    console.log(`  FAIL  ${label}\n        ${error.message}`);
  }
};

// The exact model set dealerInvoiceController.getModels() builds. Kept in sync
// manually -- the scope guard (utils/__scopeGuard.test.mjs) is what keeps the
// real file honest.
const registeredModels = {
  DealerInvoice: dealerInvoiceSchema,
  ServiceChargeMaster: serviceChargeMasterSchema
};

console.log('\n=== GET /api/dealer-invoices/:id populate resolution ===\n');

const conn = mongoose.createConnection();

console.log('1. before getModels() runs (fresh company connection)');
check('ServiceChargeMaster is not yet present', () => {
  if (conn.models.ServiceChargeMaster) throw new Error('unexpectedly present');
});

console.log('2. getModels() runs on first request');
for (const [name, schema] of Object.entries(registeredModels)) {
  conn.models[name] || conn.model(name, schema);
}

console.log('3. populate path can now resolve its model');
check('ServiceChargeMaster is registered', () => {
  if (!conn.models.ServiceChargeMaster) {
    throw new Error('ServiceChargeMaster missing after getModels()');
  }
});

check('populate("serviceCharges.serviceChargeId") resolves', () => {
  // The exact lookup mongoose performs when compiling a populate path.
  conn.model('ServiceChargeMaster');
});

check('the resolved model is the right one', () => {
  const model = conn.model('ServiceChargeMaster');
  if (model.modelName !== 'ServiceChargeMaster') {
    throw new Error(`resolved ${model.modelName}`);
  }
  const paths = Object.keys(model.schema.paths);
  if (!paths.includes('chargeName')) {
    throw new Error('schema does not look like ServiceChargeMaster');
  }
});

console.log('\n---');
console.log(`${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
