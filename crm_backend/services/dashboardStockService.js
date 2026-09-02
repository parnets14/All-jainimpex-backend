const objectIdString = (value) => value?._id?.toString?.() || value?.toString?.() || '';

/**
 * Build one canonical low-stock row per active product.
 * Product thresholds are company-wide, so current stock is the sum of the
 * latest StockMovement balance from each warehouse.
 */
export const getLowStockSnapshot = async ({ Product, StockMovement, Warehouse }) => {
  const products = await Product.find(
    { status: 'active', minStockLevel: { $gt: 0 } },
    { _id: 1, itemName: 1, productCode: 1, minStockLevel: 1 }
  ).lean();

  if (products.length === 0) return [];

  const productIds = products.map((product) => product._id);
  const latestWarehouseBalances = await StockMovement.aggregate([
    { $match: { productId: { $in: productIds } } },
    {
      $sort: {
        productId: 1,
        warehouseId: 1,
        date: -1,
        createdAt: -1,
        _id: -1
      }
    },
    {
      $group: {
        _id: { productId: '$productId', warehouseId: '$warehouseId' },
        currentStock: { $first: '$balance' }
      }
    }
  ]);

  const warehouseIds = [...new Set(
    latestWarehouseBalances
      .map((entry) => objectIdString(entry._id?.warehouseId))
      .filter(Boolean)
  )];
  const warehouses = warehouseIds.length > 0
    ? await Warehouse.find(
      { _id: { $in: warehouseIds } },
      { _id: 1, name: 1, code: 1, status: 1 }
    ).lean()
    : [];
  const warehousesById = new Map(
    warehouses.map((warehouse) => [objectIdString(warehouse._id), warehouse])
  );

  const balancesByProduct = new Map();
  latestWarehouseBalances.forEach((entry) => {
    const productId = objectIdString(entry._id?.productId);
    const warehouseId = objectIdString(entry._id?.warehouseId);
    if (!productId) return;

    const warehouse = warehousesById.get(warehouseId);
    const productBalances = balancesByProduct.get(productId) || [];
    productBalances.push({
      warehouseId: warehouseId || null,
      warehouseName: warehouse?.name || `Unknown warehouse${warehouseId ? ` (${warehouseId})` : ''}`,
      warehouseCode: warehouse?.code || null,
      warehouseStatus: warehouse?.status || null,
      currentStock: Number(entry.currentStock || 0)
    });
    balancesByProduct.set(productId, productBalances);
  });

  return products
    .map((product) => {
      const productId = objectIdString(product._id);
      const warehouseRows = (balancesByProduct.get(productId) || [])
        .sort((left, right) => left.warehouseName.localeCompare(right.warehouseName));
      const currentStock = warehouseRows.reduce(
        (sum, warehouse) => sum + Number(warehouse.currentStock || 0),
        0
      );
      const minStockLevel = Number(product.minStockLevel || 0);

      return {
        productId: product._id,
        productCode: product.productCode || null,
        itemName: product.itemName || null,
        productName: product.itemName || null,
        currentStock,
        minStockLevel,
        shortage: Math.max(0, minStockLevel - currentStock),
        warehouseName: warehouseRows.length > 0
          ? warehouseRows.map((warehouse) => warehouse.warehouseName).join(', ')
          : 'No stock movement',
        warehouses: warehouseRows
      };
    })
    .filter((item) => item.currentStock <= item.minStockLevel)
    .sort((left, right) => (
      right.shortage - left.shortage
      || String(left.itemName || left.productCode || '').localeCompare(
        String(right.itemName || right.productCode || '')
      )
      || objectIdString(left.productId).localeCompare(objectIdString(right.productId))
    ));
};

export default getLowStockSnapshot;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Build an as-of inventory risk snapshot from canonical stock movements.
 * Movement aging is policy-based: 90+ days is non-moving and 180+ days is dead.
 * SALE/INVOICE OUT movements are used as the demand proxy; quantities are never
 * reconstructed from GRNs because StockMovement.balance is authoritative.
 */
export const getInventoryRiskSnapshot = async ({
  Product,
  StockMovement,
  GRN,
  asOfDate = new Date(),
  nonMovingDays = 90,
  deadStockDays = 180,
  limit = 8
}) => {
  const products = await Product.find(
    { status: 'active' },
    { _id: 1, itemName: 1, productCode: 1, minStockLevel: 1, unit: 1 }
  ).lean();

  if (products.length === 0) {
    return {
      asOfDate,
      policy: { nonMovingDays, deadStockDays },
      summary: {
        activeProducts: 0,
        totalNetQuantity: 0,
        valuationQuantity: 0,
        totalStockValue: 0,
        outOfStockCount: 0,
        lowStockCount: 0,
        nonMovingCount: 0,
        nonMovingValue: 0,
        deadStockCount: 0,
        deadStockValue: 0,
        negativeBalanceCount: 0
      },
      agingBuckets: [],
      topRiskItems: []
    };
  }

  const productIds = products.map((product) => product._id);
  const movementMatch = { productId: { $in: productIds }, date: { $lte: asOfDate } };

  const [latestBalances, movementActivity, inwardActivity, demandActivity, grnCosts, openingCosts] = await Promise.all([
    StockMovement.aggregate([
      { $match: movementMatch },
      { $sort: { productId: 1, warehouseId: 1, date: -1, createdAt: -1, _id: -1 } },
      {
        $group: {
          _id: { productId: '$productId', warehouseId: '$warehouseId' },
          currentStock: { $first: '$balance' }
        }
      }
    ]),
    StockMovement.aggregate([
      { $match: movementMatch },
      { $group: { _id: '$productId', lastMovementAt: { $max: '$date' } } }
    ]),
    StockMovement.aggregate([
      { $match: { ...movementMatch, type: 'IN' } },
      {
        $group: {
          _id: '$productId',
          firstInwardAt: { $min: '$date' },
          lastInwardAt: { $max: '$date' }
        }
      }
    ]),
    StockMovement.aggregate([
      {
        $match: {
          ...movementMatch,
          type: 'OUT',
          referenceType: { $in: ['SALE', 'INVOICE'] }
        }
      },
      { $group: { _id: '$productId', lastDemandAt: { $max: '$date' } } }
    ]),
    GRN.aggregate([
      { $match: { grnDate: { $lte: asOfDate }, status: { $in: ['Received', 'Partially Received', 'Completed'] } } },
      { $unwind: '$items' },
      { $match: { 'items.productId': { $in: productIds } } },
      {
        $project: {
          productId: '$items.productId',
          quantity: {
            $cond: [
              { $gt: [{ $ifNull: ['$items.companyBillQuantity', 0] }, 0] },
              '$items.companyBillQuantity',
              { $ifNull: ['$items.acceptedQuantity', 0] }
            ]
          },
          unitCost: {
            $cond: [
              { $gt: [{ $ifNull: ['$items.supplierCostPerUnit', 0] }, 0] },
              '$items.supplierCostPerUnit',
              { $ifNull: ['$items.unitPrice', 0] }
            ]
          }
        }
      },
      {
        $group: {
          _id: '$productId',
          totalQuantity: { $sum: '$quantity' },
          totalCost: { $sum: { $multiply: ['$quantity', '$unitCost'] } }
        }
      }
    ]),
    StockMovement.aggregate([
      {
        $match: {
          ...movementMatch,
          referenceType: 'OPENING',
          rate: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$productId',
          totalQuantity: { $sum: '$quantity' },
          totalCost: { $sum: { $multiply: ['$quantity', '$rate'] } }
        }
      }
    ])
  ]);

  const activityByProduct = new Map(movementActivity.map((row) => [objectIdString(row._id), row]));
  const inwardByProduct = new Map(inwardActivity.map((row) => [objectIdString(row._id), row]));
  const demandByProduct = new Map(demandActivity.map((row) => [objectIdString(row._id), row]));
  const costByProduct = new Map();

  const addCostRows = (rows) => {
    rows.forEach((row) => {
      const productId = objectIdString(row._id);
      const current = costByProduct.get(productId) || { totalQuantity: 0, totalCost: 0 };
      current.totalQuantity += Number(row.totalQuantity || 0);
      current.totalCost += Number(row.totalCost || 0);
      costByProduct.set(productId, current);
    });
  };
  addCostRows(grnCosts);
  addCostRows(openingCosts);

  const balancesByProduct = new Map();
  latestBalances.forEach((row) => {
    const productId = objectIdString(row._id?.productId);
    const balances = balancesByProduct.get(productId) || [];
    balances.push(Number(row.currentStock || 0));
    balancesByProduct.set(productId, balances);
  });

  const rows = products.map((product) => {
    const productId = objectIdString(product._id);
    const warehouseBalances = balancesByProduct.get(productId) || [];
    const companyNetStock = warehouseBalances.reduce((sum, balance) => sum + balance, 0);
    const valuationQuantity = warehouseBalances.reduce(
      (sum, balance) => sum + Math.max(0, balance),
      0
    );
    const cost = costByProduct.get(productId) || { totalQuantity: 0, totalCost: 0 };
    const averageCost = cost.totalQuantity > 0 ? cost.totalCost / cost.totalQuantity : 0;
    const stockValue = valuationQuantity * averageCost;
    const activity = activityByProduct.get(productId) || {};
    const inward = inwardByProduct.get(productId) || {};
    const demand = demandByProduct.get(productId) || {};
    const agingReference = demand.lastDemandAt || inward.firstInwardAt || activity.lastMovementAt || null;
    const daysSinceDemand = agingReference
      ? Math.max(0, Math.floor((asOfDate.getTime() - new Date(agingReference).getTime()) / DAY_MS))
      : null;
    const minStockLevel = Number(product.minStockLevel || 0);
    const isOutOfStock = companyNetStock <= 0;
    const isLowStock = !isOutOfStock && minStockLevel > 0 && companyNetStock <= minStockLevel;
    let movementStatus = 'NO_STOCK';
    if (!isOutOfStock) {
      if (daysSinceDemand != null && daysSinceDemand >= deadStockDays) movementStatus = 'DEAD';
      else if (daysSinceDemand != null && daysSinceDemand >= nonMovingDays) movementStatus = 'NON_MOVING';
      else movementStatus = 'MOVING';
    }

    return {
      productId: product._id,
      productCode: product.productCode || null,
      itemName: product.itemName || product.productCode || 'Unnamed product',
      unit: product.unit || null,
      companyNetStock,
      valuationQuantity,
      minStockLevel,
      averageCost,
      stockValue,
      isOutOfStock,
      isLowStock,
      hasNegativeWarehouseBalance: warehouseBalances.some((balance) => balance < 0),
      lastMovementAt: activity.lastMovementAt || null,
      firstInwardAt: inward.firstInwardAt || null,
      lastInwardAt: inward.lastInwardAt || null,
      lastDemandAt: demand.lastDemandAt || null,
      daysSinceDemand,
      movementStatus
    };
  });

  const sum = (items, field) => items.reduce((total, item) => total + Number(item[field] || 0), 0);
  const nonMovingRows = rows.filter((row) => row.movementStatus === 'NON_MOVING');
  const deadRows = rows.filter((row) => row.movementStatus === 'DEAD');
  const movingRows = rows.filter((row) => row.movementStatus === 'MOVING');
  const noStockRows = rows.filter((row) => row.movementStatus === 'NO_STOCK');
  const priority = { DEAD: 0, NON_MOVING: 1, NO_STOCK: 2, MOVING: 3 };
  const topRiskItems = rows
    .filter((row) => row.movementStatus !== 'MOVING' || row.isLowStock || row.hasNegativeWarehouseBalance)
    .sort((left, right) => (
      priority[left.movementStatus] - priority[right.movementStatus]
      || Number(right.hasNegativeWarehouseBalance) - Number(left.hasNegativeWarehouseBalance)
      || right.stockValue - left.stockValue
      || String(left.itemName).localeCompare(String(right.itemName))
    ))
    .slice(0, limit);

  return {
    asOfDate,
    policy: { nonMovingDays, deadStockDays },
    summary: {
      activeProducts: rows.length,
      totalNetQuantity: sum(rows, 'companyNetStock'),
      valuationQuantity: sum(rows, 'valuationQuantity'),
      totalStockValue: sum(rows, 'stockValue'),
      outOfStockCount: rows.filter((row) => row.isOutOfStock).length,
      lowStockCount: rows.filter((row) => row.isLowStock).length,
      nonMovingCount: nonMovingRows.length,
      nonMovingValue: sum(nonMovingRows, 'stockValue'),
      deadStockCount: deadRows.length,
      deadStockValue: sum(deadRows, 'stockValue'),
      negativeBalanceCount: rows.filter((row) => row.hasNegativeWarehouseBalance).length
    },
    agingBuckets: [
      { key: 'MOVING', label: `Moving (<${nonMovingDays} days)`, count: movingRows.length, value: sum(movingRows, 'stockValue') },
      { key: 'NON_MOVING', label: `Non-moving (${nonMovingDays}-${deadStockDays - 1} days)`, count: nonMovingRows.length, value: sum(nonMovingRows, 'stockValue') },
      { key: 'DEAD', label: `Dead stock (${deadStockDays}+ days)`, count: deadRows.length, value: sum(deadRows, 'stockValue') },
      { key: 'NO_STOCK', label: 'Out of stock', count: noStockRows.length, value: sum(noStockRows, 'stockValue') }
    ],
    topRiskItems
  };
};