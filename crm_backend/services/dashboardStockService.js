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
