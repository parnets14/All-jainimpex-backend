import { getModels } from '../utils/getModels.js';
import { discountMappingSchema } from '../../models/DiscountMapping.js';

// ── Find applicable discount for a product on the company connection ──────────
async function findProductDiscount(productId, product, dealerType, conn, seAllowedLevels = []) {
  try {
    const DiscountMapping = conn.models.DiscountMapping || conn.model('DiscountMapping', discountMappingSchema);
    const now = new Date();

    const baseQuery = {
      mappingType: 'sales',
      status:      'Approved',
      isActive:    true,
      validFrom:   { $lte: now },
      validTo:     { $gte: now },
    };

    // Dealer type filter
    if (dealerType) {
      baseQuery.$or = [
        { applicableDealerTypes: { $size: 0 } },
        { applicableDealerTypes: { $exists: false } },
        { applicableDealerTypes: dealerType },
      ];
    }

    // Priority order: product > brand > subcategory > category
    const priorityQueries = [
      { ...baseQuery, targetType: 'product',     product:     productId },
      ...(product.brand?._id      ? [{ ...baseQuery, targetType: 'brand',       brand:       product.brand._id      }] : []),
      ...(product.subcategory?._id ? [{ ...baseQuery, targetType: 'subcategory', subcategory: product.subcategory._id }] : []),
      ...(product.category?._id   ? [{ ...baseQuery, targetType: 'category',    category:    product.category._id   }] : []),
    ];

    for (const q of priorityQueries) {
      const discounts = await DiscountMapping.find(q)
        .sort({ priority: -1, createdAt: -1 })
        .limit(1)
        .lean();

      if (discounts.length > 0) {
        const d = discounts[0];

        // Filter levels to only those the SE is allowed to apply
        const allLevels = d.levels || [];
        const allowedLevels = seAllowedLevels.length > 0
          ? allLevels.filter(l => seAllowedLevels.includes(l.levelName))
          : allLevels;

        return {
          discountMappingId:       d._id,
          discountMappingName:     d.discountName,
          discountType:            d.discountType,
          directDiscountPct:       d.directDiscountPercentage || 0,
          maxDiscountPercentage:   d.maxDiscountPercentage || 0,
          availableLevels:         allowedLevels.map(l => ({
            levelName:          l.levelName,
            discountPercentage: l.discountPercentage,
            description:        l.description || '',
          })),
          hasOffer: (d.directDiscountPercentage || 0) > 0 || allLevels.length > 0,
        };
      }
    }

    return null; // no applicable discount
  } catch (e) {
    console.error('findProductDiscount error:', e.message);
    return null;
  }
}

// ── Find dealer extra discount for a product ──────────────────────────────────
function findDealerExtraDiscount(product, dealer) {
  if (!dealer?.extraDiscounts?.length) return 0;
  const active = dealer.extraDiscounts.filter(d => d.isActive);

  // Priority: product > brand > subcategory > category
  const checks = [
    { type: 'product',     id: product._id?.toString()              },
    { type: 'brand',       id: product.brand?._id?.toString()       },
    { type: 'subcategory', id: product.subcategory?._id?.toString() },
    { type: 'category',    id: product.category?._id?.toString()    },
  ];

  for (const { type, id } of checks) {
    if (!id) continue;
    const match = active.find(d => d.targetType === type && d.targetId?.toString() === id);
    if (match) return match.discountPercentage || 0;
  }
  return 0;
}

// Get dealers assigned to sales executive
export const getDealers = async (req, res) => {
  try {
    const user = req.user;
    const { Dealer, DealerInvoice } = getModels(req);

    console.log('📋 Fetching dealers for sales executive:', {
      name: user.name,
      role: user.role,
      assignedRegions: user.assignedRegions,
    });

    // Build query — show only dealers directly assigned to this sales executive
    let query = { isActive: true };
    
    // Primary filter: dealers assigned to this SE via salesExecutiveId
    query.salesExecutiveId = user._id;
    
    // If no dealers are directly assigned, fall back to region-based (backward compat)
    const directCount = await Dealer.countDocuments(query);
    if (directCount === 0 && user.assignedRegions && user.assignedRegions.length > 0) {
      query = { isActive: true, regionId: { $in: user.assignedRegions } };
    }

    // Fetch dealers with credit information
    const dealers = await Dealer.find(query)
      .select('name code contactPerson phone email address dealerType regionId creditLimit creditDays')
      .sort({ name: 1 })
      .lean();

    // Calculate outstanding amount for each dealer
    const dealersWithOutstanding = await Promise.all(
      dealers.map(async (dealer) => {
        try {
          // Get unpaid invoices
          const invoices = await DealerInvoice.find({
            dealer: dealer._id,
            paymentStatus: { $ne: 'Paid' }
          }).select('totalAmount paidAmount');

          const outstandingAmount = invoices.reduce((sum, inv) => {
            return sum + (inv.totalAmount - (inv.paidAmount || 0));
          }, 0);

          const availableCredit = dealer.creditLimit - outstandingAmount;

          return {
            ...dealer,
            outstandingAmount: Math.max(0, outstandingAmount),
            availableCredit: Math.max(0, availableCredit),
            creditStatus: outstandingAmount > dealer.creditLimit ? 'exceeded' : 'available'
          };
        } catch (error) {
          console.error(`Error calculating outstanding for dealer ${dealer._id}:`, error);
          return {
            ...dealer,
            outstandingAmount: 0,
            availableCredit: dealer.creditLimit,
            creditStatus: 'available'
          };
        }
      })
    );

    console.log(`✅ Found ${dealersWithOutstanding.length} dealers`);

    res.json({
      success: true,
      dealers: dealersWithOutstanding,
      count: dealersWithOutstanding.length,
    });
  } catch (error) {
    console.error('Get dealers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dealers',
      error: error.message,
    });
  }
};

// ── Permission filter (mirrors dealer app productController logic) ─────────────
async function buildPermissionFilter(dealer, Category, Subcategory) {
  const brandIds = (dealer.allowedBrands || []).map(b =>
    typeof b === 'object' ? b._id : b
  );

  // No brand restrictions → all active products
  if (brandIds.length === 0) {
    return { status: 'active' };
  }

  const categoryIds = (dealer.allowedCategories || []).map(c =>
    typeof c === 'object' ? c._id : c
  );
  const subcategoryIds = (dealer.allowedSubcategories || []).map(s =>
    typeof s === 'object' ? s._id : s
  );

  // Brand-only restriction (no category/subcategory limits)
  if (categoryIds.length === 0 && subcategoryIds.length === 0) {
    return { status: 'active', brand: { $in: brandIds } };
  }

  // Hierarchical: build per-brand OR conditions
  const orConditions = [];

  for (const brandId of brandIds) {
    // Categories belonging to this brand that the dealer is allowed
    const brandCats = categoryIds.length > 0
      ? (await Category.find({ _id: { $in: categoryIds }, brand: brandId }).select('_id')).map(c => c._id)
      : [];

    // Subcategories belonging to this brand's categories that the dealer is allowed
    let brandSubs = [];
    if (subcategoryIds.length > 0) {
      const allBrandCats = await Category.find({ brand: brandId }).select('_id');
      brandSubs = (await Subcategory.find({
        _id: { $in: subcategoryIds },
        category: { $in: allBrandCats.map(c => c._id) }
      }).select('_id')).map(s => s._id);
    }

    if (brandSubs.length > 0) {
      orConditions.push({ status: 'active', brand: brandId, subcategory: { $in: brandSubs } });
    } else if (brandCats.length > 0) {
      orConditions.push({ status: 'active', brand: brandId, category: { $in: brandCats } });
    } else {
      // Brand selected but no matching cats/subs in this brand → all products from brand
      orConditions.push({ status: 'active', brand: brandId });
    }
  }

  if (orConditions.length === 0) return { _id: null }; // no access
  if (orConditions.length === 1) return orConditions[0];
  return { $or: orConditions };
}

// Get products with pricing and stock
export const getProducts = async (req, res) => {
  try {
    const { dealerId, search, category, brand, warehouseId, page = 1, limit = 100 } = req.query;
    const { Dealer, Product, DealerPricing, StockMovement, Warehouse, GRN,
            Category, Subcategory } = getModels(req);

    console.log('� Fetching products:', { dealerId, search, category, brand, warehouseId });

    // ── Build permission-aware base filter ──────────────────────────────────
    let baseFilter = { status: 'active' };
    let dealerDoc = null;  // keep reference for extra discount lookup

    if (dealerId) {
      dealerDoc = await Dealer.findById(dealerId)
        .populate('allowedBrands', '_id')
        .populate('allowedCategories', '_id')
        .populate('allowedSubcategories', '_id');

      if (!dealerDoc) {
        return res.json({
          success: true, products: [],
          pagination: { page: parseInt(page), limit: parseInt(limit), total: 0, totalPages: 0 }
        });
      }

      console.log('📊 Dealer permissions:', {
        brands: dealerDoc.allowedBrands?.length || 0,
        categories: dealerDoc.allowedCategories?.length || 0,
        subcategories: dealerDoc.allowedSubcategories?.length || 0,
      });

      baseFilter = await buildPermissionFilter(dealerDoc, Category, Subcategory);
    }

    // ── Merge user-supplied filters ─────────────────────────────────────────
    let query = { ...baseFilter };

    if (search) {
      const searchOr = [
        { itemName:    { $regex: search, $options: 'i' } },
        { productCode: { $regex: search, $options: 'i' } },
      ];
      if (query.$or) {
        // Combine existing $or (from permission filter) with search $or via $and
        query = {
          $and: [
            { $or: query.$or },
            { $or: searchOr },
            ...Object.keys(query).filter(k => k !== '$or').map(k => ({ [k]: query[k] })),
          ],
        };
      } else {
        query.$or = searchOr;
      }
    }

    if (category) query.category    = category;
    if (brand)    query.brand       = brand;

    console.log('🔍 Final product query:', JSON.stringify(query, null, 2));

    // ── Fetch products ──────────────────────────────────────────────────────
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const products = await Product.find(query)
      .populate('brand',       'name')
      .populate('category',    'name')
      .populate('subcategory', 'name')
      .select('productCode itemName HSNCode description unit gst brand category subcategory minStockLevel rateSlabs images')
      .sort({ itemName: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    console.log(`✅ Found ${products.length} products matching dealer permissions`);

    // Get pricing and stock for each product
    const productsWithDetails = await Promise.all(
      products.map(async (product) => {
        try {
          // Get dealer pricing
          const pricing = await DealerPricing.findOne({
            product: product._id,
            isActive: true
          }).select('sellingPrice purchasePrice');

          // ── Stock calculation ───────────────────────────────────────────
          // Get all warehouses that have had any stock movement for this product
          const allWarehouseIds = await StockMovement.find({
            productId: product._id
          }).distinct('warehouseId');

          // If a specific warehouse is requested, only look at that one;
          // otherwise look at all warehouses that have movements
          const warehouseIdsToCheck = warehouseId
            ? allWarehouseIds.filter(id => id.toString() === warehouseId)
            : allWarehouseIds;

          // Also check the selected warehouse even if it has no movements yet
          if (warehouseId && warehouseIdsToCheck.length === 0) {
            warehouseIdsToCheck.push(warehouseId);
          }

          const warehouseStock = [];
          let totalStock = 0;

          for (const whId of warehouseIdsToCheck) {
            const warehouse = await Warehouse.findById(whId).select('name');
            if (!warehouse) continue;

            // Get current stock from latest balance in StockMovement
            const latestMovement = await StockMovement.findOne({
              productId: product._id,
              warehouseId: whId,
            }).sort({ date: -1, createdAt: -1 });

            const currentStock = latestMovement?.balance ?? 0;

            // Calculate damaged stock from GRN items
            const grns = await GRN.find({
              'items.productId': product._id,
              warehouseId: whId
            });

            let damagedQty = 0;
            grns.forEach(grn => {
              if (grn.items && Array.isArray(grn.items)) {
                grn.items.forEach(item => {
                  const itemProductId = item.productId?._id
                    ? item.productId._id.toString()
                    : item.productId?.toString();
                  if (itemProductId === product._id.toString()) {
                    damagedQty += item.damageQuantity || 0;
                  }
                });
              }
            });

            // Calculate blocked stock (OUT with "Stock Blocked" minus IN with "Stock Unblocked")
            const [blockedMovements, unblockedMovements] = await Promise.all([
              StockMovement.find({
                productId: product._id,
                warehouseId: whId,
                type: 'OUT',
                referenceType: 'SALE',
                remarks: { $regex: /Stock Blocked/ }
              }),
              StockMovement.find({
                productId: product._id,
                warehouseId: whId,
                type: 'IN',
                referenceType: 'SALE',
                remarks: { $regex: /Stock Unblocked/ }
              }),
            ]);

            let blockedQty = 0;
            blockedMovements.forEach(m => { blockedQty += m.quantity || 0; });
            unblockedMovements.forEach(m => { blockedQty -= m.quantity || 0; });
            blockedQty = Math.max(0, blockedQty);

            const netStock = Math.max(0, currentStock - damagedQty - blockedQty);

            // Always include the warehouse entry so the frontend knows about it
            warehouseStock.push({
              warehouseId:   whId.toString(),
              warehouseName: warehouse.name,
              quantity:      currentStock,
              damaged:       damagedQty,
              blocked:       blockedQty,
              net:           netStock,
            });

            totalStock += netStock;
          }

          // availableStock = net stock in the requested warehouse, or total across all
          const availableStock = warehouseId
            ? (warehouseStock.find(w => w.warehouseId === warehouseId)?.net ?? 0)
            : totalStock;

          const isOutOfStock = availableStock <= 0;
          const isLowStock   = !isOutOfStock && product.minStockLevel && availableStock <= product.minStockLevel;

          // ── Discount data for this product ──────────────────────────────
          const seAllowedLevels = req.user?.allowedDiscountLevels || [];
          const discountInfo = await findProductDiscount(
            product._id, product, dealerDoc?.dealerType, req.dbConnection, seAllowedLevels
          );
          const dealerExtraDiscountPct = dealerDoc ? findDealerExtraDiscount(product, dealerDoc) : 0;

          return {
            _id: product._id,
            productCode: product.productCode,
            itemName: product.itemName,
            HSNCode: product.HSNCode,
            description: product.description,
            unit: product.unit,
            gst: product.gst,
            brandName: product.brand?.name || 'N/A',
            brandId: product.brand?._id,
            categoryName: product.category?.name || 'N/A',
            categoryId: product.category?._id,
            subcategoryName: product.subcategory?.name || 'N/A',
            subcategoryId: product.subcategory?._id,
            dealerPrice: product.mrp || product.totalAmount || ((pricing?.sellingPrice || (product.rateSlabs?.[0]?.rate || 0)) * (1 + (product.gst || 0) / 100)),
            basePrice: pricing?.sellingPrice || product.rateSlabs?.[0]?.rate || 0,
            images: product.images || [],
            availableStock,
            warehouseStock,
            totalStock,
            isOutOfStock,
            isLowStock,
            minStockLevel: product.minStockLevel,
            // Discount info
            discountMappingId:      discountInfo?.discountMappingId || null,
            discountMappingName:    discountInfo?.discountMappingName || '',
            discountType:           discountInfo?.discountType || null,
            directDiscountPct:      discountInfo?.directDiscountPct || 0,
            maxDiscountPercentage:  discountInfo?.maxDiscountPercentage || 0,
            availableLevels:        discountInfo?.availableLevels || [],
            hasOffer:               discountInfo?.hasOffer || false,
            dealerExtraDiscountPct,
          };
        } catch (error) {
          console.error(`Error getting details for product ${product._id}:`, error);
          return {
            _id: product._id,
            productCode: product.productCode,
            itemName: product.itemName,
            HSNCode: product.HSNCode,
            brandName: product.brand?.name || 'N/A',
            categoryName: product.category?.name || 'N/A',
            subcategoryName: product.subcategory?.name || 'N/A',
            dealerPrice: product.mrp || product.totalAmount || ((product.rateSlabs?.[0]?.rate || 0) * (1 + (product.gst || 0) / 100)),
            basePrice: product.rateSlabs?.[0]?.rate || 0,
            images: product.images || [],
            availableStock: 0,
            warehouseStock: [],
            totalStock: 0,
            isOutOfStock: true,
            isLowStock: false
          };
        }
      })
    );

    const total = await Product.countDocuments(query);

    console.log(`✅ Found ${productsWithDetails.length} products`);

    res.json({
      success: true,
      products: productsWithDetails,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message,
    });
  }
};

// Create sales order
export const createSalesOrder = async (req, res) => {
  try {
    const user = req.user;
    const { dealerId, products, customerNotes, orderDate, deliveryDate } = req.body;
    const { Dealer, Product, DealerPricing, SalesOrder, StockMovement, GRN } = getModels(req);

    console.log('📝 Creating sales order:', {
      dealerId,
      productsCount: products?.length,
      salesExecutive: user.name
    });

    if (!dealerId || !products || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Dealer and products are required'
      });
    }

    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }

    // Validate stock availability — skip check for items explicitly marked as out-of-stock orders
    for (const item of products) {
      // If the SE explicitly flagged this as an out-of-stock order item, skip validation
      if (item.isOutOfStock) continue;

      const latestMovement = await StockMovement.findOne({
        productId: item.productId,
        warehouseId: item.warehouseId,
      }).sort({ date: -1, createdAt: -1 });

      const currentStock = latestMovement?.balance ?? 0;

      const grns = await GRN.find({
        'items.productId': item.productId,
        warehouseId: item.warehouseId
      });

      let damagedQty = 0;
      grns.forEach(grn => {
        if (grn.items && Array.isArray(grn.items)) {
          grn.items.forEach(grnItem => {
            const itemProductId = grnItem.productId?._id ? grnItem.productId._id.toString() : grnItem.productId?.toString();
            if (itemProductId === item.productId.toString()) {
              damagedQty += grnItem.damageQuantity || 0;
            }
          });
        }
      });

      const [blockedMovements, unblockedMovements] = await Promise.all([
        StockMovement.find({
          productId: item.productId,
          warehouseId: item.warehouseId,
          type: 'OUT',
          referenceType: 'SALE',
          remarks: { $regex: /Stock Blocked/ }
        }),
        StockMovement.find({
          productId: item.productId,
          warehouseId: item.warehouseId,
          type: 'IN',
          referenceType: 'SALE',
          remarks: { $regex: /Stock Unblocked/ }
        }),
      ]);

      let blockedQty = 0;
      blockedMovements.forEach(m => { blockedQty += m.quantity || 0; });
      unblockedMovements.forEach(m => { blockedQty -= m.quantity || 0; });
      blockedQty = Math.max(0, blockedQty);

      const netStock = Math.max(0, currentStock - damagedQty - blockedQty);

      if (item.quantity > netStock) {
        const product = await Product.findById(item.productId).select('itemName');
        // Warn but don't block — SE can still place the order, it will be flagged as out-of-stock
        console.warn(`⚠️ Low stock for ${product?.itemName}: requested ${item.quantity}, available ${netStock}`);
      }
    }

    // Prepare order products with pricing and calculate totals
    let grossAmount = 0;
    let totalGst = 0;

    const orderProducts = await Promise.all(
      products.map(async (item) => {
        const product = await Product.findById(item.productId)
          .populate('brand category subcategory')
          .lean();

        const pricing = await DealerPricing.findOne({
          product: item.productId,
          isActive: true
        });

        const unitPrice = pricing?.sellingPrice || product.rateSlabs?.[0]?.rate || 0;
        const itemTotal = item.quantity * unitPrice;
        const gstAmount = (itemTotal * product.gst) / 100;
        const totalPrice = itemTotal + gstAmount;

        grossAmount += itemTotal;
        totalGst += gstAmount;

        return {
          product: item.productId,
          productCode: product.productCode,
          productName: product.itemName,
          HSNCode: product.HSNCode,
          quantity: item.quantity,
          unitPrice,
          gst: product.gst,
          gstAmount,
          totalPrice,
          warehouse: item.warehouseId,
          warehouseName: item.warehouseName || 'Main Warehouse'
        };
      })
    );

    const totalAmount = grossAmount + totalGst;

    // Generate order number
    const generateOrderNumber = async () => {
      const currentYear = new Date().getFullYear();
      const prefix = `SO-${currentYear}-`;
      
      const lastOrder = await SalesOrder.findOne({
        orderNumber: { $regex: `^${prefix}` }
      }).sort({ orderNumber: -1 });
      
      let nextNumber = 1;
      if (lastOrder) {
        const lastNumber = parseInt(lastOrder.orderNumber.split('-')[2]);
        nextNumber = lastNumber + 1;
      }
      
      return `${prefix}${nextNumber.toString().padStart(4, '0')}`;
    };

    const orderNumber = await generateOrderNumber();

    let orderType = 'Independent Sales Order';
    if (dealer.dealerType === 'Wholesale') {
      orderType = 'Wholesale Sales Order';
    } else if (dealer.dealerType === 'Retail') {
      orderType = 'Retail Sales Order';
    }

    const dueDate = new Date(orderDate || new Date());
    dueDate.setDate(dueDate.getDate() + (dealer.creditDays || 30));

    const salesOrder = new SalesOrder({
      orderNumber,
      dealer: dealerId,
      dealerName: dealer.name,
      dealerCode: dealer.code,
      dealerType: dealer.dealerType,
      region: dealer.regionId,
      products: orderProducts,
      orderDate: orderDate || new Date(),
      deliveryDate,
      creditDays: dealer.creditDays || 30,
      dueDate,
      grossAmount,
      totalGst,
      discountAmount: 0,
      totalAmount,
      status: 'Pending',
      type: orderType,
      remarks: customerNotes,
      createdBy: user._id
    });

    await salesOrder.save();

    console.log(`✅ Sales order created: ${salesOrder.orderNumber}`);

    // Notify admin (non-blocking)
    try {
      const { notifyNewSalesOrder } = await import('../../services/adminNotificationService.js');
      const company = req.company || 'jain-impex';
      notifyNewSalesOrder(company, {
        salesExecutive: req.user?.name || 'SE',
        dealerName: salesOrder.dealerName || '',
        orderNumber: salesOrder.orderNumber,
        amount: salesOrder.totalAmount,
      });
    } catch (e) { /* non-blocking */ }

    res.status(201).json({
      success: true,
      message: 'Sales order created successfully',
      order: {
        _id: salesOrder._id,
        orderNumber: salesOrder.orderNumber,
        status: salesOrder.status,
        totalAmount: salesOrder.totalAmount
      }
    });
  } catch (error) {
    console.error('Create sales order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create sales order',
      error: error.message,
    });
  }
};

// Get my sales orders
export const getMySalesOrders = async (req, res) => {
  try {
    const user = req.user;
    const { status, page = 1, limit = 20 } = req.query;
    const { SalesOrder } = getModels(req);

    console.log('📋 Fetching orders for sales executive:', user.name);

    let query = { createdBy: user._id };
    
    if (status && status !== 'all') {
      query.status = status;
    }

    const skip = (page - 1) * limit;
    const orders = await SalesOrder.find(query)
      .populate('dealer', 'name code')
      .select('orderNumber dealer orderDate totalAmount status type')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await SalesOrder.countDocuments(query);

    console.log(`✅ Found ${orders.length} orders`);

    res.json({
      success: true,
      orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get my orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message,
    });
  }
};

// Get sales order by ID
export const getSalesOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const { SalesOrder } = getModels(req);

    console.log('📄 Fetching order details:', id);

    const order = await SalesOrder.findById(id)
      .populate('dealer', 'name code contactPerson phone email address creditLimit creditDays')
      .populate('products.product', 'itemName productCode HSNCode')
      .populate('products.warehouse', 'name')
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.createdBy._id.toString() !== user._id.toString() && user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this order'
      });
    }

    console.log(`✅ Order found: ${order.orderNumber}`);

    res.json({
      success: true,
      order
    });
  } catch (error) {
    console.error('Get order by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order details',
      error: error.message,
    });
  }
};

// Calculate discounts for cart items — full discount logic
// Body: { dealerId, products: [{ productId, quantity, unitPrice, gst, selectedLevels: [levelName] }] }
export const calculateOrderDiscounts = async (req, res) => {
  try {
    const { dealerId, products } = req.body;
    const { Product, Dealer, Points } = getModels(req);
    const seAllowedLevels = req.user?.allowedDiscountLevels || [];

    if (!products || !Array.isArray(products)) {
      return res.status(400).json({ success: false, message: 'Products array is required' });
    }

    // Fetch dealer for extra discounts
    const dealer = dealerId ? await Dealer.findById(dealerId).lean() : null;

    const processedItems = [];
    let totalDiscount = 0;
    let totalPoints   = 0;

    for (const item of products) {
      const product = await Product.findById(item.productId)
        .populate('brand', 'name')
        .populate('category', 'name')
        .populate('subcategory', 'name')
        .lean();

      if (!product) continue;

      // ── 1. Find applicable discount mapping ──────────────────────────────
      const discountInfo = await findProductDiscount(
        product._id, product, dealer?.dealerType, req.dbConnection, seAllowedLevels
      );

      const directDiscountPct     = discountInfo?.directDiscountPct || 0;
      const maxDiscountPercentage = discountInfo?.maxDiscountPercentage || 0;
      const availableLevels       = discountInfo?.availableLevels || [];

      // ── 2. Manual level discounts (SE-entered values, each capped at level's max) ──
      const manualDiscountLevels = item.manualDiscountLevels || {};
      let levelDiscountPct = 0;
      const appliedLevelDetails = [];

      availableLevels.forEach((level) => {
        const enteredPct = parseFloat(manualDiscountLevels[level.levelName] || 0);
        if (enteredPct > 0) {
          // Cap at the level's defined max
          const cappedPct = Math.min(enteredPct, level.discountPercentage);
          levelDiscountPct += cappedPct;
          appliedLevelDetails.push({ levelName: level.levelName, pct: cappedPct });
        }
      });

      // ── 3. Dealer extra discount ─────────────────────────────────────────
      const dealerExtraDiscountPct = dealer ? findDealerExtraDiscount(product, dealer) : 0;

      // ── 4. Validate: level + extra must not exceed maxDiscountPercentage ──
      // Direct discount is NOT counted against the max (new logic)
      const combinedLevelExtra = levelDiscountPct + dealerExtraDiscountPct;
      const cappedLevelExtra   = maxDiscountPercentage > 0
        ? Math.min(combinedLevelExtra, maxDiscountPercentage)
        : combinedLevelExtra;

      // Recalculate level pct if capped
      let finalLevelPct = levelDiscountPct;
      let finalExtraPct = dealerExtraDiscountPct;
      if (combinedLevelExtra > 0 && cappedLevelExtra < combinedLevelExtra) {
        const ratio = cappedLevelExtra / combinedLevelExtra;
        finalLevelPct = Math.round(levelDiscountPct * ratio * 100) / 100;
        finalExtraPct = Math.round(dealerExtraDiscountPct * ratio * 100) / 100;
      }

      const totalDiscountPct = directDiscountPct + finalLevelPct + finalExtraPct;

      // ── 5. Calculate amounts ─────────────────────────────────────────────
      const lineSubtotal   = item.quantity * item.unitPrice;
      const discountAmount = Math.round((lineSubtotal * totalDiscountPct / 100) * 100) / 100;
      const finalPrice     = lineSubtotal - discountAmount;
      const gstAmount      = Math.round((finalPrice * (product.gst || 0) / 100) * 100) / 100;
      const lineTotal      = finalPrice + gstAmount;

      // ── 6. Points ────────────────────────────────────────────────────────
      let pointsEarned = 0;
      let pointScheme  = null;
      try {
        const { Points: PointsModel } = getModels(req);
        const schemes = await PointsModel.find({
          type: 'sale',
          validFrom: { $lte: new Date() },
          validTo:   { $gte: new Date() },
          $or: [
            { brand:       product.brand?._id       },
            { category:    product.category?._id    },
            { subcategory: product.subcategory?._id },
          ],
        }).limit(1).lean();

        if (schemes.length > 0) {
          const s = schemes[0];
          if (s.calculationType === 'amount' && s.inputValue > 0)
            pointsEarned = Math.floor(finalPrice / s.inputValue) * s.points;
          else if (s.calculationType === 'units' && s.inputValue > 0)
            pointsEarned = Math.floor(item.quantity / s.inputValue) * s.points;

          if (pointsEarned > 0) {
            pointScheme = {
              type: s.calculationType, threshold: s.inputValue,
              pointsPerThreshold: s.points,
              description: s.description || `Earn ${s.points} pts per ${s.inputValue} ${s.calculationType === 'amount' ? '₹' : 'units'}`,
            };
          }
        }
      } catch {}

      totalDiscount += discountAmount;
      totalPoints   += pointsEarned;

      processedItems.push({
        productId:              item.productId,
        productName:            product.itemName,
        productCode:            product.productCode,
        quantity:               item.quantity,
        unitPrice:              item.unitPrice,
        gst:                    product.gst || 0,
        // Discount breakdown
        discountMappingId:      discountInfo?.discountMappingId || null,
        discountMappingName:    discountInfo?.discountMappingName || '',
        discountType:           discountInfo?.discountType || null,
        directDiscountPct,
        manualDiscountLevels,
        appliedLevelDetails,
        levelDiscountPct:       finalLevelPct,
        dealerExtraDiscountPct: finalExtraPct,
        totalDiscountPct,
        discountAmount,
        finalPrice,
        gstAmount,
        lineTotal,
        maxDiscountPercentage,
        availableLevels,
        // Points
        pointsEarned,
        pointScheme,
        // Validation info
        wasLevelCapped: combinedLevelExtra > cappedLevelExtra,
      });
    }

    const subtotal    = processedItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const totalGst    = processedItems.reduce((s, i) => s + i.gstAmount, 0);
    const grandTotal  = processedItems.reduce((s, i) => s + i.lineTotal, 0);

    res.json({
      success: true,
      items: processedItems,
      summary: {
        subtotal,
        totalDiscount,
        totalGst,
        grandTotal,
        totalPoints,
      },
    });
  } catch (error) {
    console.error('Calculate discounts error:', error);
    res.status(500).json({ success: false, message: 'Failed to calculate discounts', error: error.message });
  }
};

// Get product filters (brands, categories, subcategories) for the dealer
export const getProductFilters = async (req, res) => {
  try {
    const { dealerId } = req.query;
    const { Dealer, Product, Category, Subcategory } = getModels(req);

    let baseFilter = { status: 'active' };

    if (dealerId) {
      const dealer = await Dealer.findById(dealerId)
        .populate('allowedBrands', '_id')
        .populate('allowedCategories', '_id')
        .populate('allowedSubcategories', '_id');

      if (dealer) {
        baseFilter = await buildPermissionFilter(dealer, Category, Subcategory);
      }
    }

    // Get distinct brand, category, subcategory IDs from matching products
    const products = await Product.find(baseFilter)
      .select('brand category subcategory')
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .lean();

    // Deduplicate
    const brandMap = {}, categoryMap = {}, subcategoryMap = {};
    products.forEach(p => {
      if (p.brand?._id) brandMap[p.brand._id] = { _id: p.brand._id, name: p.brand.name };
      if (p.category?._id) categoryMap[p.category._id] = { _id: p.category._id, name: p.category.name };
      if (p.subcategory?._id) subcategoryMap[p.subcategory._id] = { _id: p.subcategory._id, name: p.subcategory.name };
    });

    res.json({
      success: true,
      brands:       Object.values(brandMap).sort((a, b) => a.name.localeCompare(b.name)),
      categories:   Object.values(categoryMap).sort((a, b) => a.name.localeCompare(b.name)),
      subcategories: Object.values(subcategoryMap).sort((a, b) => a.name.localeCompare(b.name)),
    });
  } catch (error) {
    console.error('getProductFilters error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get warehouses
export const getWarehouses = async (req, res) => {  try {
    const user = req.user;
    const { StockMovement, Warehouse } = getModels(req);

    console.log('🏭 Fetching warehouses for sales executive:', user.name);

    let query = {};
    
    if (user.assignedRegions && user.assignedRegions.length > 0) {
      query.region = { $in: user.assignedRegions };
    }

    // Get warehouses that have stock movements
    const warehousesWithStock = await StockMovement.distinct('warehouseId');
    
    query._id = { $in: warehousesWithStock };

    const warehouses = await Warehouse.find(query)
      .select('code name address.city address.state isActive status')
      .sort({ name: 1 })
      .lean();

    console.log(`✅ Found ${warehouses.length} warehouses`);

    res.json({
      success: true,
      warehouses,
      count: warehouses.length
    });
  } catch (error) {
    console.error('Get warehouses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch warehouses',
      error: error.message,
    });
  }
};
