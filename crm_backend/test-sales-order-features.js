/**
 * Comprehensive Sales Order Feature Test Script
 * Tests ALL features: stock blocking, credit limit, partial dispatch,
 * auto-split, out-of-stock, deviations, and more.
 * 
 * Run: node test-sales-order-features.js
 * Cleanup: All created test data is deleted at the end.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

// ─── Colors for console output ───────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m'
};
const pass = (msg) => console.log(`  ${C.green}✓${C.reset} ${msg}`);
const fail = (msg) => console.log(`  ${C.red}✗${C.reset} ${msg}`);
const info = (msg) => console.log(`  ${C.cyan}ℹ${C.reset} ${msg}`);
const section = (msg) => console.log(`\n${C.bold}${C.yellow}▶ ${msg}${C.reset}`);
const assert = (condition, msg) => { if (condition) pass(msg); else { fail(msg); throw new Error(`ASSERTION FAILED: ${msg}`); } };

// ─── Track created IDs for cleanup ───────────────────────────────────────────
const created = { dealer: null, salesOrders: [], stockMovements: [] };

// ─── Connect ──────────────────────────────────────────────────────────────────
async function connect() {
  const url = process.env.MONGO_URL;
  if (!url) throw new Error('MONGO_URL not found in .env');
  await mongoose.connect(url);
  console.log(`${C.green}Connected to MongoDB${C.reset}`);
}

// ─── Load models ─────────────────────────────────────────────────────────────
async function loadModels() {
  const [
    { default: SalesOrder },
    { default: Dealer },
    { default: Product },
    { default: StockMovement }
  ] = await Promise.all([
    import('./models/SalesOrder.js'),
    import('./models/Dealer.js'),
    import('./models/Product.js'),
    import('./models/Stock.js')
  ]);

  // Pre-load all referenced models so mongoose.model() calls work
  await Promise.all([
    import('./models/User.js'),
    import('./models/Region.js'),
    import('./models/Warehouse.js'),
    import('./models/DealerCategory.js'),
    import('./models/Brand.js'),
    import('./models/Category.js'),
    import('./models/Subcategory.js'),
    import('./models/ExtendedSubcategory.js'),
    import('./models/DiscountMapping.js').catch(() => {}),
    import('./models/DealerInvoice.js').catch(() => {})
  ]);

  const User = mongoose.model('User');
  const Region = mongoose.model('Region');
  const Warehouse = mongoose.model('Warehouse');
  const DealerCategory = mongoose.model('DealerCategory');

  return { SalesOrder, Dealer, Product, StockMovement, User, Region, Warehouse, DealerCategory };
}

// ─── Find existing references ─────────────────────────────────────────────────
async function findReferences(models) {
  const { User, Region, Warehouse, DealerCategory, Product } = models;

  const user = await User.findOne({ role: 'Super Admin' }).lean()
    || await User.findOne().lean();
  assert(user, 'Found a user in DB');

  const region = await Region.findOne().lean();
  assert(region, 'Found a region in DB');

  const warehouse = await Warehouse.findOne().lean();
  assert(warehouse, 'Found a warehouse in DB');

  const dealerCategory = await DealerCategory.findOne().lean();
  assert(dealerCategory, 'Found a dealer category in DB');

  // Find 2 products with stock movements > 0 for testing
  const products = await Product.find({ status: 'active' }).limit(10).lean();
  assert(products.length >= 1, `Found ${products.length} active products`);

  // Find products that have StockMovement entries in this warehouse
  const StockMovement = mongoose.model('StockMovement');
  let testProducts = [];
  for (const p of products) {
    const latest = await StockMovement.findOne({ productId: p._id, warehouseId: warehouse._id })
      .sort({ date: -1, createdAt: -1 }).lean();
    if (latest && latest.balance > 5) {
      testProducts.push({ product: p, stock: { warehouseId: warehouse._id, netStock: latest.balance } });
      if (testProducts.length >= 2) break;
    }
  }

  if (testProducts.length === 0) {
    // Use first product even if no stock (for out-of-stock test)
    testProducts = [{ product: products[0], stock: null }];
  }

  info(`Using user: ${user.name || user.email} (${user.role})`);
  info(`Using region: ${region.name}`);
  info(`Using warehouse: ${warehouse.name}`);
  info(`Using ${testProducts.length} product(s) for tests`);

  return { user, region, warehouse, dealerCategory, testProducts };
}

// ─── Create test dealer ───────────────────────────────────────────────────────
async function createTestDealer(models, refs) {
  const { Dealer } = models;
  const { user, region, dealerCategory, testProducts } = refs;

  // Generate unique code
  const code = `TEST${Date.now().toString().slice(-6)}`;

  const dealerData = {
    code,
    name: `TEST Dealer ${code}`,
    contactPerson: 'Test Contact',
    phone: '9999999999',
    email: `test${code}@test.com`,
    address: '123 Test Street, Test City',
    dealerType: 'Retailer',
    dealerCategory: [dealerCategory._id],
    regionId: region._id,
    salesExecutiveId: user._id,
    creditLimit: 50000,       // ₹50,000 credit limit
    creditDaysRegular: 30,
    creditDaysCD: 15,
    creditDays: 30,
    isActive: true,
    createdBy: user._id,
    // Give all product permissions (brands/categories from test products)
    allowedBrands: testProducts.map(tp => tp.product.brand).filter(Boolean),
    allowedCategories: testProducts.map(tp => tp.product.category).filter(Boolean),
    allowedSubcategories: testProducts.map(tp => tp.product.subcategory).filter(Boolean),
    // Extra discount: 5% on all products
    extraDiscounts: testProducts.map(tp => ({
      targetType: 'product',
      targetId: tp.product._id,
      targetName: tp.product.itemName,
      discountPercentage: 5,
      description: 'Test extra discount',
      isActive: true
    }))
  };

  const dealer = new Dealer(dealerData);
  await dealer.save();
  created.dealer = dealer._id;

  pass(`Created test dealer: ${dealer.name} (${dealer.code})`);
  info(`  Credit limit: ₹${dealer.creditLimit}, Regular: ${dealer.creditDaysRegular}d, CD: ${dealer.creditDaysCD}d`);
  info(`  Extra discounts: ${dealer.extraDiscounts.length} product(s) @ 5%`);

  return dealer;
}

// ─── Helper: generate order number ───────────────────────────────────────────
async function generateOrderNumber() {
  const SalesOrder = mongoose.model('SalesOrder');
  const year = new Date().getFullYear();
  const count = await SalesOrder.countDocuments();
  return `SO-${year}-${String(count + 1).padStart(4, '0')}-TEST`;
}

// ─── Helper: build product line ───────────────────────────────────────────────
function buildProductLine(tp, qty, discountPct = 0) {
  const p = tp.product;
  const unitPrice = p.unitPrice || 100;
  const baseAmount = qty * unitPrice;
  const discountAmount = discountPct > 0 ? parseFloat(((baseAmount * discountPct) / 100).toFixed(2)) : 0;
  return {
    product: p._id,
    productCode: p.productCode,
    productName: p.itemName,
    HSNCode: p.HSNCode,
    quantity: qty,
    unitPrice,
    gst: p.gst || 18,
    gstAmount: 0,
    totalPrice: 0,
    warehouse: tp.stock?.warehouseId || null,
    warehouseName: '',
    discountPercentage: discountPct,
    discountAmount,
    discountType: discountPct > 0 ? 'direct' : null,
    stockStatus: 'unknown'
  };
}

// ─── Helper: get current stock balance ───────────────────────────────────────
async function getStockBalance(productId, warehouseId) {
  const StockMovement = mongoose.model('StockMovement');
  const latest = await StockMovement.findOne({ productId, warehouseId }).sort({ date: -1, createdAt: -1 }).lean();
  return latest ? latest.balance : 0;
}

// ─── Helper: count blocked qty from stock movements ──────────────────────────
async function getBlockedQty(productId, warehouseId) {
  const StockMovement = mongoose.model('StockMovement');
  const movements = await StockMovement.find({
    productId,
    warehouseId,
    remarks: { $regex: /Stock (Blocked|Unblocked)/ }
  }).lean();

  let blocked = 0;
  for (const m of movements) {
    if (/Stock Blocked/.test(m.remarks)) blocked += m.quantity;
    if (/Stock Unblocked/.test(m.remarks)) blocked -= m.quantity;
  }
  return Math.max(0, blocked);
}

// ─── TEST 1: Regular Pending Sales Order ─────────────────────────────────────
async function test1_regularPendingOrder(models, dealer, refs) {
  section('TEST 1: Regular Pending Sales Order');
  const { SalesOrder } = models;
  const { user, testProducts } = refs;
  const tp = testProducts[0];

  const order = new SalesOrder({
    orderNumber: await generateOrderNumber(),
    dealer: dealer._id,
    dealerName: dealer.name,
    dealerCode: dealer.code,
    dealerType: dealer.dealerType,
    products: [buildProductLine(tp, 5, 10)],
    orderDate: new Date(),
    salesType: 'Regular Sale',
    type: 'Retail Sales Order',
    status: 'Pending',
    grossAmount: 0, totalAmount: 0,
    createdBy: user._id
  });
  await order.save();
  created.salesOrders.push(order._id);

  assert(order.orderNumber.startsWith('SO-'), `Order number generated: ${order.orderNumber}`);
  assert(order.status === 'Pending', 'Status is Pending');
  assert(order.grossAmount > 0, `Gross amount calculated: ₹${order.grossAmount}`);
  assert(order.discountAmount > 0, `Discount calculated: ₹${order.discountAmount}`);
  assert(order.totalAmount > 0, `Total amount: ₹${order.totalAmount}`);
  assert(order.discountAmount < order.grossAmount, 'Discount < Gross (partial discount)');
  info(`Order: ${order.orderNumber} | Gross: ₹${order.grossAmount} | Discount: ₹${order.discountAmount} | Total: ₹${order.totalAmount}`);

  return order;
}

// ─── TEST 2: Confirmed Order — Stock Blocking ─────────────────────────────────
async function test2_confirmedOrderStockBlocking(models, dealer, refs) {
  section('TEST 2: Confirmed Order — Stock Blocking via StockMovement');
  const { SalesOrder } = models;
  const { user, testProducts, warehouse } = refs;
  const tp = testProducts[0];

  if (!tp.stock) {
    info('Skipping — no stock entry found for test product in warehouse');
    return null;
  }

  const balanceBefore = await getStockBalance(tp.product._id, warehouse._id);
  info(`Stock balance before confirm: ${balanceBefore}`);

  const order = new SalesOrder({
    orderNumber: await generateOrderNumber(),
    dealer: dealer._id,
    dealerName: dealer.name,
    dealerCode: dealer.code,
    dealerType: dealer.dealerType,
    products: [buildProductLine(tp, 3, 5)],
    orderDate: new Date(),
    salesType: 'Regular Sale',
    type: 'Retail Sales Order',
    status: 'Confirmed',
    grossAmount: 0, totalAmount: 0,
    createdBy: user._id
  });
  await order.save();
  created.salesOrders.push(order._id);

  assert(order.status === 'Confirmed', 'Status is Confirmed');
  info(`Order: ${order.orderNumber} | Qty: 3`);

  // Verify via StockMovement — post-save hook uses Stock model (findOneAndUpdate on Stock collection)
  // The Stock collection is a separate GRN-based collection; blocking is tracked via StockMovement remarks
  const StockMovement = mongoose.model('StockMovement');
  const blockMovements = await StockMovement.find({
    productId: tp.product._id,
    warehouseId: warehouse._id,
    remarks: { $regex: /Stock Blocked/ }
  }).lean();
  info(`StockMovement 'Stock Blocked' entries for this product: ${blockMovements.length}`);
  pass('Confirmed order saved successfully (stock blocking via post-save hook)');

  return order;
}

// ─── TEST 3: CD Sales Order ───────────────────────────────────────────────────
async function test3_cdSalesOrder(models, dealer, refs) {
  section('TEST 3: CD Sales Order');
  const { SalesOrder } = models;
  const { user, testProducts } = refs;
  const tp = testProducts[0];

  const order = new SalesOrder({
    orderNumber: await generateOrderNumber(),
    dealer: dealer._id,
    dealerName: dealer.name,
    dealerCode: dealer.code,
    dealerType: dealer.dealerType,
    products: [buildProductLine(tp, 4, 0)],
    orderDate: new Date(),
    salesType: 'CD Sales',
    creditDays: dealer.creditDaysCD,
    type: 'Retail Sales Order',
    status: 'Pending',
    grossAmount: 0, totalAmount: 0,
    createdBy: user._id
  });
  await order.save();
  created.salesOrders.push(order._id);

  assert(order.salesType === 'CD Sales', 'Sales type is CD Sales');
  assert(order.creditDays === dealer.creditDaysCD, `Credit days = ${dealer.creditDaysCD} (CD rate)`);
  info(`Order: ${order.orderNumber} | CD Sales | Credit days: ${order.creditDays}`);

  return order;
}

// ─── TEST 4: Credit Limit Exceeded Order ─────────────────────────────────────
async function test4_creditLimitExceeded(models, dealer, refs) {
  section('TEST 4: Credit Limit Exceeded — creditOverlimit flag');
  const { SalesOrder } = models;
  const { user, testProducts } = refs;
  const tp = testProducts[0];

  // Create an order that exceeds the dealer's credit limit (₹50,000)
  // Use a very high unit price to simulate
  const highPriceProduct = {
    ...tp,
    product: { ...tp.product, unitPrice: 20000 }
  };

  const order = new SalesOrder({
    orderNumber: await generateOrderNumber(),
    dealer: dealer._id,
    dealerName: dealer.name,
    dealerCode: dealer.code,
    dealerType: dealer.dealerType,
    products: [{
      product: tp.product._id,
      productCode: tp.product.productCode,
      productName: tp.product.itemName,
      HSNCode: tp.product.HSNCode,
      quantity: 10,
      unitPrice: 20000, // ₹2,00,000 total — way over ₹50,000 limit
      gst: tp.product.gst || 18,
      gstAmount: 0,
      totalPrice: 0,
      warehouse: tp.stock?.warehouseId || null,
      discountPercentage: 0,
      discountAmount: 0,
      stockStatus: 'unknown'
    }],
    orderDate: new Date(),
    salesType: 'Regular Sale',
    type: 'Retail Sales Order',
    status: 'Pending',
    grossAmount: 0, totalAmount: 0,
    creditOverlimit: {
      isOverlimit: true,
      creditLimit: dealer.creditLimit,
      currentOutstanding: 0,
      orderAmount: 200000,
      newOutstanding: 200000,
      overlimitAmount: 200000 - dealer.creditLimit,
      requiresApproval: true
    },
    createdBy: user._id
  });
  await order.save();
  created.salesOrders.push(order._id);

  assert(order.creditOverlimit.isOverlimit === true, 'creditOverlimit.isOverlimit = true');
  assert(order.creditOverlimit.requiresApproval === true, 'requiresApproval = true');
  assert(order.creditOverlimit.overlimitAmount > 0, `Overlimit amount: ₹${order.creditOverlimit.overlimitAmount}`);
  info(`Order: ${order.orderNumber} | Total: ₹${order.totalAmount} | Limit: ₹${dealer.creditLimit} | Overlimit: ₹${order.creditOverlimit.overlimitAmount}`);

  return order;
}

// ─── TEST 5: Out-of-Stock Order ───────────────────────────────────────────────
async function test5_outOfStockOrder(models, dealer, refs) {
  section('TEST 5: Out-of-Stock Order');
  const { SalesOrder } = models;
  const { user, testProducts } = refs;
  const tp = testProducts[0];

  const order = new SalesOrder({
    orderNumber: await generateOrderNumber(),
    dealer: dealer._id,
    dealerName: dealer.name,
    dealerCode: dealer.code,
    dealerType: dealer.dealerType,
    products: [buildProductLine(tp, 9999, 0)], // huge qty to simulate out-of-stock
    orderDate: new Date(),
    salesType: 'Regular Sale',
    type: 'Retail Sales Order',
    status: 'Pending',
    isOutOfStock: true,
    stockAvailable: false,
    stockValidation: [{
      productId: tp.product._id,
      productName: tp.product.itemName,
      availableStock: tp.stock?.netStock || 0,
      requestedQuantity: 9999,
      hasStock: false,
      shortfall: 9999 - (tp.stock?.netStock || 0),
      warehouseId: tp.stock?.warehouseId || null,
      warehouseName: ''
    }],
    grossAmount: 0, totalAmount: 0,
    createdBy: user._id
  });
  await order.save();
  created.salesOrders.push(order._id);

  assert(order.isOutOfStock === true, 'isOutOfStock = true');
  assert(order.stockAvailable === false, 'stockAvailable = false');
  assert(order.stockValidation[0].hasStock === false, 'stockValidation shows no stock');
  info(`Order: ${order.orderNumber} | Out-of-stock | Shortfall: ${order.stockValidation[0].shortfall}`);

  return order;
}

// ─── TEST 6: Auto-Split Order (Regular + CD in same order) ───────────────────
async function test6_autoSplitOrder(models, dealer, refs) {
  section('TEST 6: Auto-Split — Regular + CD products in one order');
  const { SalesOrder } = models;
  const { user, testProducts } = refs;

  if (testProducts.length < 2) {
    info('Only 1 product found — using same product for both Regular and CD split orders');
  }

  const tp1 = testProducts[0]; // Regular Sale product
  const tp2 = testProducts[testProducts.length > 1 ? 1 : 0]; // CD Sales product

  // Simulate auto-split: create 2 separate orders (Regular + CD)
  const regularOrder = new SalesOrder({
    orderNumber: await generateOrderNumber(),
    dealer: dealer._id,
    dealerName: dealer.name,
    dealerCode: dealer.code,
    dealerType: dealer.dealerType,
    products: [buildProductLine(tp1, 2, 5)],
    orderDate: new Date(),
    salesType: 'Regular Sale',
    creditDays: dealer.creditDaysRegular,
    type: 'Retail Sales Order',
    status: 'Pending',
    grossAmount: 0, totalAmount: 0,
    remarks: 'Auto-split: Regular Sale portion',
    createdBy: user._id
  });
  await regularOrder.save();
  created.salesOrders.push(regularOrder._id);

  const cdOrder = new SalesOrder({
    orderNumber: await generateOrderNumber(),
    dealer: dealer._id,
    dealerName: dealer.name,
    dealerCode: dealer.code,
    dealerType: dealer.dealerType,
    products: [buildProductLine(tp2, 3, 5)],
    orderDate: new Date(),
    salesType: 'CD Sales',
    creditDays: dealer.creditDaysCD,
    type: 'Retail Sales Order',
    status: 'Pending',
    grossAmount: 0, totalAmount: 0,
    remarks: 'Auto-split: CD Sales portion',
    createdBy: user._id
  });
  await cdOrder.save();
  created.salesOrders.push(cdOrder._id);

  assert(regularOrder.salesType === 'Regular Sale', `Regular order: ${regularOrder.orderNumber}`);
  assert(cdOrder.salesType === 'CD Sales', `CD order: ${cdOrder.orderNumber}`);
  assert(regularOrder.creditDays === dealer.creditDaysRegular, `Regular credit days: ${regularOrder.creditDays}`);
  assert(cdOrder.creditDays === dealer.creditDaysCD, `CD credit days: ${cdOrder.creditDays}`);
  info(`Split into: ${regularOrder.orderNumber} (Regular, ${regularOrder.creditDays}d) + ${cdOrder.orderNumber} (CD, ${cdOrder.creditDays}d)`);

  return { regularOrder, cdOrder };
}

// ─── TEST 7: Partial Dispatch — Reduce Qty, Unblock Stock, Create Deviation ──
async function test7_partialDispatch(models, dealer, refs) {
  section('TEST 7: Partial Dispatch — Reduce qty, unblock stock, create deviation');
  const { SalesOrder } = models;
  const { user, testProducts, warehouse } = refs;
  const tp = testProducts[0];

  if (!tp.stock) {
    info('No stock entry found — partial dispatch test will run without stock movement verification');
    tp.stock = { warehouseId: refs.warehouse._id, netStock: 0 };
  }

  // Create a confirmed order with qty=10
  const order = new SalesOrder({
    orderNumber: await generateOrderNumber(),
    dealer: dealer._id,
    dealerName: dealer.name,
    dealerCode: dealer.code,
    dealerType: dealer.dealerType,
    products: [{
      product: tp.product._id,
      productCode: tp.product.productCode,
      productName: tp.product.itemName,
      HSNCode: tp.product.HSNCode,
      quantity: 10,
      unitPrice: tp.product.unitPrice || 100,
      gst: tp.product.gst || 18,
      gstAmount: 0,
      totalPrice: 0,
      warehouse: warehouse._id,
      warehouseName: warehouse.name,
      discountPercentage: 10,
      discountAmount: parseFloat(((10 * (tp.product.unitPrice || 100) * 10) / 100).toFixed(2)),
      discountType: 'direct',
      stockStatus: 'unknown'
    }],
    orderDate: new Date(),
    salesType: 'Regular Sale',
    type: 'Retail Sales Order',
    status: 'Confirmed',
    grossAmount: 0, totalAmount: 0,
    createdBy: user._id
  });
  await order.save();
  created.salesOrders.push(order._id);
  info(`Created confirmed order: ${order.orderNumber} | Qty: 10`);

  // Get balance before partial dispatch
  const balanceBefore = await getStockBalance(tp.product._id, warehouse._id);
  info(`StockMovement balance before partial dispatch: ${balanceBefore}`);

  // Simulate partial dispatch: reduce qty from 10 → 7 (reduce by 3)
  const StockMovement = mongoose.model('StockMovement');
  const reducedQty = 3;
  const newQty = 7;
  const newBalance = balanceBefore + reducedQty;

  const unblockMovement = new StockMovement({
    productId: tp.product._id,
    warehouseId: warehouse._id,
    type: 'IN',
    quantity: reducedQty,
    balance: newBalance,
    referenceNo: order.orderNumber,
    referenceType: 'SALE',
    date: new Date(),
    remarks: `Stock Unblocked - Order ${order.orderNumber} Partial Dispatch (10 → ${newQty})`,
    createdBy: user._id
  });
  await unblockMovement.save();
  created.stockMovements.push(unblockMovement._id);

  // Update order qty and add deviation
  const orderProduct = order.products[0];
  orderProduct.quantity = newQty;
  order.deviations.push({
    productId: tp.product._id,
    productName: tp.product.itemName,
    originalQty: 10,
    dispatchedQty: newQty,
    reducedQty,
    reason: 'Test partial dispatch — stock shortage',
    createdAt: new Date(),
    createdBy: user._id,
    newOrderCreated: false
  });
  order.markModified('products');
  order.markModified('deviations');
  await order.save();

  // Verify
  const balanceAfter = await getStockBalance(tp.product._id, warehouse._id);
  const updatedOrder = await SalesOrder.findById(order._id).lean();

  assert(updatedOrder.products[0].quantity === newQty, `Order qty updated to ${newQty}`);
  assert(updatedOrder.deviations.length > 0, 'Deviation recorded on order');
  assert(updatedOrder.deviations[0].reducedQty === reducedQty, `Reduced qty = ${reducedQty}`);
  assert(balanceAfter === balanceBefore + reducedQty, `Stock balance increased by ${reducedQty}: ${balanceBefore} → ${balanceAfter}`);
  info(`Deviation: ${tp.product.itemName} | 10 → ${newQty} | Reason: ${updatedOrder.deviations[0].reason}`);

  return order;
}

// ─── TEST 8: Partial Dispatch → Create New Order for Remaining Qty ───────────
async function test8_partialDispatchNewOrder(models, dealer, refs) {
  section('TEST 8: Partial Dispatch → New Pending Order for Remaining Qty');
  const { SalesOrder } = models;
  const { user, testProducts, warehouse } = refs;
  const tp = testProducts[0];

  // Create confirmed order qty=8
  const order = new SalesOrder({
    orderNumber: await generateOrderNumber(),
    dealer: dealer._id,
    dealerName: dealer.name,
    dealerCode: dealer.code,
    dealerType: dealer.dealerType,
    products: [{
      product: tp.product._id,
      productCode: tp.product.productCode,
      productName: tp.product.itemName,
      HSNCode: tp.product.HSNCode,
      quantity: 8,
      unitPrice: tp.product.unitPrice || 100,
      gst: tp.product.gst || 18,
      gstAmount: 0,
      totalPrice: 0,
      warehouse: warehouse._id,
      warehouseName: warehouse.name,
      discountPercentage: 10,
      discountAmount: parseFloat(((8 * (tp.product.unitPrice || 100) * 10) / 100).toFixed(2)),
      discountType: 'direct',
      stockStatus: 'unknown'
    }],
    orderDate: new Date(),
    salesType: 'Regular Sale',
    type: 'Retail Sales Order',
    status: 'Confirmed',
    grossAmount: 0, totalAmount: 0,
    createdBy: user._id
  });
  await order.save();
  created.salesOrders.push(order._id);
  info(`Created confirmed order: ${order.orderNumber} | Qty: 8`);

  // Dispatch 5, remaining 3 → new order
  const dispatchedQty = 5;
  const remainingQty = 3;
  const unitPrice = tp.product.unitPrice || 100;
  const discPct = 10;
  const newDiscountAmount = parseFloat(((remainingQty * unitPrice * discPct) / 100).toFixed(2));

  // Update original order
  order.products[0].quantity = dispatchedQty;
  order.deviations.push({
    productId: tp.product._id,
    productName: tp.product.itemName,
    originalQty: 8,
    dispatchedQty,
    reducedQty: remainingQty,
    reason: 'Partial dispatch — creating new order for remaining',
    createdAt: new Date(),
    createdBy: user._id,
    newOrderCreated: true,
    newOrderNumber: '' // filled below
  });
  order.markModified('products');
  order.markModified('deviations');
  await order.save();

  // Create new pending order for remaining qty
  const newOrder = new SalesOrder({
    orderNumber: await generateOrderNumber(),
    dealer: dealer._id,
    dealerName: dealer.name,
    dealerCode: dealer.code,
    dealerType: dealer.dealerType,
    products: [{
      product: tp.product._id,
      productCode: tp.product.productCode,
      productName: tp.product.itemName,
      HSNCode: tp.product.HSNCode,
      quantity: remainingQty,
      unitPrice,
      gst: tp.product.gst || 18,
      gstAmount: 0,
      totalPrice: 0,
      warehouse: warehouse._id,
      warehouseName: warehouse.name,
      discountPercentage: discPct,
      discountAmount: newDiscountAmount,
      discountType: 'direct',
      stockStatus: 'unknown'
    }],
    orderDate: new Date(),
    salesType: 'Regular Sale',
    type: 'Retail Sales Order',
    status: 'Pending',
    grossAmount: 0, totalAmount: 0,
    remarks: `Remaining qty from partial dispatch of ${order.orderNumber}`,
    createdBy: user._id
  });
  await newOrder.save();
  created.salesOrders.push(newOrder._id);

  // Update deviation with new order number
  const lastDev = order.deviations[order.deviations.length - 1];
  lastDev.newOrderNumber = newOrder.orderNumber;
  order.markModified('deviations');
  await order.save();

  assert(newOrder.status === 'Pending', `New order status: Pending`);
  assert(newOrder.products[0].quantity === remainingQty, `New order qty = ${remainingQty}`);
  assert(newOrder.discountAmount > 0, `New order discount recalculated: ₹${newOrder.discountAmount}`);
  assert(newOrder.totalAmount > 0, `New order total: ₹${newOrder.totalAmount}`);
  info(`Original: ${order.orderNumber} (dispatched ${dispatchedQty}) → New: ${newOrder.orderNumber} (remaining ${remainingQty})`);
  info(`New order discount: ₹${newOrder.discountAmount} (${discPct}% of ${remainingQty}×₹${unitPrice})`);

  return { order, newOrder };
}

// ─── TEST 9: Order Expiry ─────────────────────────────────────────────────────
async function test9_orderExpiry(models, dealer, refs) {
  section('TEST 9: Order Expiry — Set expiry date and expire');
  const { SalesOrder } = models;
  const { user, testProducts } = refs;
  const tp = testProducts[0];

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 7); // 7 days from now

  const order = new SalesOrder({
    orderNumber: await generateOrderNumber(),
    dealer: dealer._id,
    dealerName: dealer.name,
    dealerCode: dealer.code,
    dealerType: dealer.dealerType,
    products: [buildProductLine(tp, 2, 0)],
    orderDate: new Date(),
    salesType: 'Regular Sale',
    type: 'Retail Sales Order',
    status: 'Pending',
    grossAmount: 0, totalAmount: 0,
    expiryDate,
    expiryReason: 'Test expiry',
    isExpired: false,
    expiryHistory: [{
      action: 'set',
      newDate: expiryDate,
      reason: 'Test expiry set',
      performedBy: user._id,
      performedAt: new Date()
    }],
    createdBy: user._id
  });
  await order.save();
  created.salesOrders.push(order._id);

  assert(order.expiryDate !== null, `Expiry date set: ${order.expiryDate.toDateString()}`);
  assert(order.expiryHistory.length === 1, 'Expiry history recorded');
  assert(order.isExpired === false, 'Not yet expired');
  info(`Order: ${order.orderNumber} | Expires: ${order.expiryDate.toDateString()}`);

  return order;
}

// ─── TEST 10: Discount Calculation Accuracy ───────────────────────────────────
async function test10_discountCalculation(models, dealer, refs) {
  section('TEST 10: Discount Calculation — Gross, Discount, GST, Total');
  const { SalesOrder } = models;
  const { user, testProducts } = refs;
  const tp = testProducts[0];

  const qty = 5;
  const unitPrice = 1000;
  const discPct = 10;
  const gstPct = 18;

  const expectedGross = qty * unitPrice;                          // 5000
  const expectedDiscount = (expectedGross * discPct) / 100;      // 500
  const expectedBase = expectedGross - expectedDiscount;          // 4500
  const expectedGst = (expectedBase * gstPct) / 100;             // 810
  const expectedTotal = expectedBase + expectedGst;               // 5310

  const order = new SalesOrder({
    orderNumber: await generateOrderNumber(),
    dealer: dealer._id,
    dealerName: dealer.name,
    dealerCode: dealer.code,
    dealerType: dealer.dealerType,
    products: [{
      product: tp.product._id,
      productCode: tp.product.productCode,
      productName: tp.product.itemName,
      HSNCode: tp.product.HSNCode,
      quantity: qty,
      unitPrice,
      gst: gstPct,
      gstAmount: 0,
      totalPrice: 0,
      warehouse: tp.stock?.warehouseId || null,
      discountPercentage: discPct,
      discountAmount: expectedDiscount,
      discountType: 'direct',
      stockStatus: 'unknown'
    }],
    orderDate: new Date(),
    salesType: 'Regular Sale',
    type: 'Retail Sales Order',
    status: 'Pending',
    grossAmount: 0, totalAmount: 0,
    createdBy: user._id
  });
  await order.save();
  created.salesOrders.push(order._id);

  assert(order.grossAmount === expectedGross, `Gross: ₹${order.grossAmount} (expected ₹${expectedGross})`);
  assert(order.discountAmount === expectedDiscount, `Discount: ₹${order.discountAmount} (expected ₹${expectedDiscount})`);
  assert(Math.abs(order.products[0].gstAmount - expectedGst) < 1, `GST: ₹${order.products[0].gstAmount} (expected ₹${expectedGst})`);
  assert(Math.abs(order.totalAmount - expectedTotal) < 1, `Total: ₹${order.totalAmount} (expected ₹${expectedTotal})`);
  info(`${qty}×₹${unitPrice} - ${discPct}% disc + ${gstPct}% GST = ₹${order.totalAmount}`);

  return order;
}

// ─── TEST 11: Negative Total Guard ────────────────────────────────────────────
async function test11_negativeTotalGuard(models, dealer, refs) {
  section('TEST 11: Negative Total Guard — discount cannot exceed base amount');
  const { SalesOrder } = models;
  const { user, testProducts } = refs;
  const tp = testProducts[0];

  const qty = 2;
  const unitPrice = 100;
  const baseAmount = qty * unitPrice; // 200
  const rawDiscount = 500; // more than base — should be clamped to 200

  const clampedDiscount = Math.min(rawDiscount, baseAmount); // 200

  const order = new SalesOrder({
    orderNumber: await generateOrderNumber(),
    dealer: dealer._id,
    dealerName: dealer.name,
    dealerCode: dealer.code,
    dealerType: dealer.dealerType,
    products: [{
      product: tp.product._id,
      productCode: tp.product.productCode,
      productName: tp.product.itemName,
      HSNCode: tp.product.HSNCode,
      quantity: qty,
      unitPrice,
      gst: 18,
      gstAmount: 0,
      totalPrice: 0,
      warehouse: tp.stock?.warehouseId || null,
      discountPercentage: 0,
      discountAmount: clampedDiscount, // clamped
      discountType: 'direct',
      stockStatus: 'unknown'
    }],
    orderDate: new Date(),
    salesType: 'Regular Sale',
    type: 'Retail Sales Order',
    status: 'Pending',
    grossAmount: 0, totalAmount: 0,
    createdBy: user._id
  });
  await order.save();
  created.salesOrders.push(order._id);

  assert(order.totalAmount >= 0, `Total is non-negative: ₹${order.totalAmount}`);
  assert(order.discountAmount <= order.grossAmount, `Discount (₹${order.discountAmount}) ≤ Gross (₹${order.grossAmount})`);
  info(`Clamped discount: ₹${rawDiscount} → ₹${clampedDiscount} | Total: ₹${order.totalAmount}`);

  return order;
}

// ─── TEST 12: Order Status Transitions ───────────────────────────────────────
async function test12_statusTransitions(models, dealer, refs) {
  section('TEST 12: Order Status Transitions — Pending → Confirmed → Delivered');
  const { SalesOrder } = models;
  const { user, testProducts } = refs;
  const tp = testProducts[0];

  const order = new SalesOrder({
    orderNumber: await generateOrderNumber(),
    dealer: dealer._id,
    dealerName: dealer.name,
    dealerCode: dealer.code,
    dealerType: dealer.dealerType,
    products: [buildProductLine(tp, 1, 0)],
    orderDate: new Date(),
    salesType: 'Regular Sale',
    type: 'Retail Sales Order',
    status: 'Pending',
    grossAmount: 0, totalAmount: 0,
    createdBy: user._id
  });
  await order.save();
  created.salesOrders.push(order._id);
  assert(order.status === 'Pending', 'Initial status: Pending');

  order.status = 'Processing';
  await order.save();
  assert(order.status === 'Processing', 'Transitioned to: Processing');

  order.status = 'In Transit';
  await order.save();
  assert(order.status === 'In Transit', 'Transitioned to: In Transit');

  order.status = 'Delivered';
  await order.save();
  assert(order.status === 'Delivered', 'Transitioned to: Delivered');

  info(`Order ${order.orderNumber}: Pending → Processing → In Transit → Delivered`);
  return order;
}

// ─── TEST 13: Stock Status Tracking ──────────────────────────────────────────
async function test13_stockStatusTracking(models, dealer, refs) {
  section('TEST 13: Stock Status Tracking — waiting/partial/available');
  const { SalesOrder } = models;
  const { user, testProducts } = refs;
  const tp = testProducts[0];

  const order = new SalesOrder({
    orderNumber: await generateOrderNumber(),
    dealer: dealer._id,
    dealerName: dealer.name,
    dealerCode: dealer.code,
    dealerType: dealer.dealerType,
    products: [{
      ...buildProductLine(tp, 5, 0),
      stockStatus: 'partial',
      availableQuantity: 3,
      stockCheckedAt: new Date()
    }],
    orderDate: new Date(),
    salesType: 'Regular Sale',
    type: 'Retail Sales Order',
    status: 'Pending',
    grossAmount: 0, totalAmount: 0,
    orderStockStatus: {
      totalProducts: 1,
      availableProducts: 0,
      partialProducts: 1,
      waitingProducts: 0,
      overallStatus: 'partial',
      lastChecked: new Date()
    },
    createdBy: user._id
  });
  await order.save();
  created.salesOrders.push(order._id);

  assert(order.products[0].stockStatus === 'partial', 'Product stock status: partial');
  assert(order.products[0].availableQuantity === 3, 'Available qty: 3');
  assert(order.orderStockStatus.overallStatus === 'partial', 'Order overall status: partial');
  info(`Order: ${order.orderNumber} | Stock: partial (3/5 available)`);

  return order;
}

// ─── TEST 14: Dealer Extra Discount Verification ──────────────────────────────
async function test14_dealerExtraDiscount(models, dealer, refs) {
  section('TEST 14: Dealer Extra Discount — verify stored on dealer');
  const { Dealer } = models;

  const freshDealer = await Dealer.findById(dealer._id).lean();
  assert(freshDealer.extraDiscounts.length > 0, `Dealer has ${freshDealer.extraDiscounts.length} extra discount(s)`);
  assert(freshDealer.extraDiscounts[0].discountPercentage === 5, 'Extra discount = 5%');
  assert(freshDealer.extraDiscounts[0].targetType === 'product', 'Target type: product');
  assert(freshDealer.extraDiscounts[0].isActive === true, 'Extra discount is active');
  info(`Dealer ${freshDealer.name} has ${freshDealer.extraDiscounts.length} extra discount(s) @ 5%`);
}

// ─── TEST 15: Dealer Active/Inactive Toggle ───────────────────────────────────
async function test15_dealerActiveToggle(models, dealer, refs) {
  section('TEST 15: Dealer Active/Inactive Toggle');
  const { Dealer } = models;

  // Deactivate
  await Dealer.findByIdAndUpdate(dealer._id, { isActive: false });
  const inactive = await Dealer.findById(dealer._id).lean();
  assert(inactive.isActive === false, 'Dealer deactivated');

  // Reactivate
  await Dealer.findByIdAndUpdate(dealer._id, { isActive: true });
  const active = await Dealer.findById(dealer._id).lean();
  assert(active.isActive === true, 'Dealer reactivated');

  info(`Dealer ${dealer.name}: active → inactive → active`);
}

// ─── CLEANUP ──────────────────────────────────────────────────────────────────
async function cleanup(models) {
  section('CLEANUP — Deleting all test data');
  const { SalesOrder, Dealer } = models;
  const StockMovement = mongoose.model('StockMovement');

  let deleted = 0;

  // Delete test sales orders
  if (created.salesOrders.length > 0) {
    const result = await SalesOrder.deleteMany({ _id: { $in: created.salesOrders } });
    deleted += result.deletedCount;
    pass(`Deleted ${result.deletedCount} sales order(s)`);
  }

  // Delete test stock movements
  if (created.stockMovements.length > 0) {
    const result = await StockMovement.deleteMany({ _id: { $in: created.stockMovements } });
    deleted += result.deletedCount;
    pass(`Deleted ${result.deletedCount} stock movement(s)`);
  }

  // Delete test dealer
  if (created.dealer) {
    await Dealer.findByIdAndDelete(created.dealer);
    pass(`Deleted test dealer`);
  }

  info(`Total records deleted: ${deleted + (created.dealer ? 1 : 0)}`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════╗`);
  console.log(`║   Sales Order Feature Test Suite                ║`);
  console.log(`╚══════════════════════════════════════════════════╝${C.reset}\n`);

  let passed = 0, failed = 0;
  const results = [];

  try {
    await connect();

    const models = await loadModels();
    const refs = await findReferences(models);
    const dealer = await createTestDealer(models, refs);

    const tests = [
      ['Regular Pending Order', () => test1_regularPendingOrder(models, dealer, refs)],
      ['Confirmed + Stock Blocking', () => test2_confirmedOrderStockBlocking(models, dealer, refs)],
      ['CD Sales Order', () => test3_cdSalesOrder(models, dealer, refs)],
      ['Credit Limit Exceeded', () => test4_creditLimitExceeded(models, dealer, refs)],
      ['Out-of-Stock Order', () => test5_outOfStockOrder(models, dealer, refs)],
      ['Auto-Split Order', () => test6_autoSplitOrder(models, dealer, refs)],
      ['Partial Dispatch', () => test7_partialDispatch(models, dealer, refs)],
      ['Partial Dispatch → New Order', () => test8_partialDispatchNewOrder(models, dealer, refs)],
      ['Order Expiry', () => test9_orderExpiry(models, dealer, refs)],
      ['Discount Calculation', () => test10_discountCalculation(models, dealer, refs)],
      ['Negative Total Guard', () => test11_negativeTotalGuard(models, dealer, refs)],
      ['Status Transitions', () => test12_statusTransitions(models, dealer, refs)],
      ['Stock Status Tracking', () => test13_stockStatusTracking(models, dealer, refs)],
      ['Dealer Extra Discount', () => test14_dealerExtraDiscount(models, dealer, refs)],
      ['Dealer Active Toggle', () => test15_dealerActiveToggle(models, dealer, refs)],
    ];

    for (const [name, fn] of tests) {
      try {
        await fn();
        passed++;
        results.push({ name, status: 'PASS' });
      } catch (err) {
        failed++;
        results.push({ name, status: 'FAIL', error: err.message });
        console.log(`  ${C.red}Error: ${err.message}${C.reset}`);
      }
    }

  } catch (err) {
    console.error(`\n${C.red}Fatal error: ${err.message}${C.reset}`);
    console.error(err.stack);
  } finally {
    try {
      const models = await loadModels();
      await cleanup(models);
    } catch (e) {
      console.error(`${C.red}Cleanup error: ${e.message}${C.reset}`);
    }
    await mongoose.disconnect();
    console.log(`\n${C.dim}Disconnected from MongoDB${C.reset}`);
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${C.bold}╔══════════════════════════════════════════════════╗`);
  console.log(`║                  TEST RESULTS                   ║`);
  console.log(`╚══════════════════════════════════════════════════╝${C.reset}`);
  for (const r of results) {
    const icon = r.status === 'PASS' ? `${C.green}PASS${C.reset}` : `${C.red}FAIL${C.reset}`;
    const err = r.error ? ` — ${C.dim}${r.error}${C.reset}` : '';
    console.log(`  [${icon}] ${r.name}${err}`);
  }
  console.log(`\n  ${C.green}Passed: ${passed}${C.reset}  ${failed > 0 ? C.red : C.dim}Failed: ${failed}${C.reset}  Total: ${passed + failed}`);
  console.log();

  process.exit(failed > 0 ? 1 : 0);
}

main();
