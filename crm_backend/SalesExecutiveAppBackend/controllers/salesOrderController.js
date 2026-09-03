import mongoose from 'mongoose';
import { getModels } from '../utils/getModels.js';
import { discountMappingSchema } from '../../models/DiscountMapping.js';
import { calculateDiscountLine } from '../../utils/sequentialDiscountPolicy.js';
import { createSingleSalesOrder as createCanonicalSalesOrderRecord } from '../../controllers/salesOrderController.js';
import { notifyNewSEOrder } from '../../services/adminNotificationService.js';

// ── Find applicable discount for a product on the company connection ──────────
export async function findProductDiscount(productId, product, dealerType, conn, seAllowedLevels = []) {
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
        const allowedLevels = allLevels.filter(l => seAllowedLevels.includes(l.levelName));

        return {
          discountMappingId:       d._id,
          discountMappingName:     d.discountName,
          discountType:            d.discountType,
          directDiscountPct:       d.directDiscountPercentage || 0,
          masterDiscountCap:       d.masterDiscountCap ?? null,
          combinedLevelDiscountCap: d.combinedLevelDiscountCap ?? d.maxDiscountPercentage ?? null,
          configuredLevels:        allLevels.map(l => ({
            levelName:          l.levelName,
            discountPercentage: l.discountPercentage,
          })),
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
export function findDealerExtraDiscount(product, dealer) {
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

    // ── Batch-load everything for this page (avoids per-product N+1 queries) ──
    const productIds = products.map(p => p._id);
    const whObjId = warehouseId ? new mongoose.Types.ObjectId(warehouseId) : null;

    // 1) Dealer pricing for all products on this page (one query)
    const pricingDocs = await DealerPricing.find({
      product: { $in: productIds },
      isActive: true,
    }).select('product sellingPrice purchasePrice').lean();
    const pricingMap = {};
    pricingDocs.forEach(p => { pricingMap[p.product.toString()] = p; });

    // 2) Active sales discount mappings (loaded once, resolved in memory)
    const DiscountMapping = req.dbConnection.models.DiscountMapping
      || req.dbConnection.model('DiscountMapping', discountMappingSchema);
    const now = new Date();
    const allMappings = await DiscountMapping.find({
      mappingType: 'sales',
      status:      'Approved',
      isActive:    true,
      validFrom:   { $lte: now },
      validTo:     { $gte: now },
    }).sort({ priority: -1, createdAt: -1 }).lean();

    const seAllowedLevels = req.user?.allowedDiscountLevels || [];
    const dealerType = dealerDoc?.dealerType;
    const matchesDealerType = (m) => {
      if (!dealerType) return true;
      const adt = m.applicableDealerTypes;
      if (!adt || adt.length === 0) return true;
      return adt.some(t => String(t) === String(dealerType));
    };
    // Priority order: product > brand > subcategory > category (mappings pre-sorted by priority)
    const resolveDiscount = (product) => {
      const pick = (predicate) => allMappings.find(m => matchesDealerType(m) && predicate(m));
      let d = pick(m => m.targetType === 'product' && String(m.product) === String(product._id));
      if (!d && product.brand?._id)        d = pick(m => m.targetType === 'brand'       && String(m.brand)       === String(product.brand._id));
      if (!d && product.subcategory?._id)  d = pick(m => m.targetType === 'subcategory' && String(m.subcategory) === String(product.subcategory._id));
      if (!d && product.category?._id)     d = pick(m => m.targetType === 'category'    && String(m.category)    === String(product.category._id));
      if (!d) return null;
      const allLevels = d.levels || [];
      const allowedLevels = allLevels.filter(l => seAllowedLevels.includes(l.levelName));
      return {
        discountMappingId:     d._id,
        discountMappingName:   d.discountName,
        discountType:          d.discountType,
        directDiscountPct:     d.directDiscountPercentage || 0,
        masterDiscountCap:     d.masterDiscountCap ?? null,
        combinedLevelDiscountCap: d.combinedLevelDiscountCap ?? d.maxDiscountPercentage ?? null,
        configuredLevels: allLevels.map(l => ({
          levelName:          l.levelName,
          discountPercentage: l.discountPercentage,
        })),
        availableLevels: allowedLevels.map(l => ({
          levelName:          l.levelName,
          discountPercentage: l.discountPercentage,
          description:        l.description || '',
        })),
        hasOffer: (d.directDiscountPercentage || 0) > 0 || allLevels.length > 0,
      };
    };

    // 3) Stock — batched aggregations across all products on this page
    const stockMatch = { productId: { $in: productIds } };
    if (whObjId) stockMatch.warehouseId = whObjId;

    const [balanceRows, blockedRows, unblockedRows, grnDocs, total] = await Promise.all([
      // Latest balance per (product, warehouse)
      StockMovement.aggregate([
        { $match: stockMatch },
        { $sort: { date: -1, createdAt: -1 } },
        { $group: { _id: { p: '$productId', w: '$warehouseId' }, balance: { $first: '$balance' } } },
      ]),
      // Blocked (OUT / "Stock Blocked")
      StockMovement.aggregate([
        { $match: { ...stockMatch, type: 'OUT', referenceType: 'SALE', remarks: { $regex: 'Stock Blocked' } } },
        { $group: { _id: { p: '$productId', w: '$warehouseId' }, qty: { $sum: '$quantity' } } },
      ]),
      // Unblocked (IN / "Stock Unblocked")
      StockMovement.aggregate([
        { $match: { ...stockMatch, type: 'IN', referenceType: 'SALE', remarks: { $regex: 'Stock Unblocked' } } },
        { $group: { _id: { p: '$productId', w: '$warehouseId' }, qty: { $sum: '$quantity' } } },
      ]),
      // Damaged from GRNs
      GRN.find(
        whObjId
          ? { warehouseId: whObjId, 'items.productId': { $in: productIds } }
          : { 'items.productId': { $in: productIds } }
      ).select('warehouseId items.productId items.damageQuantity').lean(),
      // Total count for pagination (runs in parallel)
      Product.countDocuments(query),
    ]);

    const balByPair   = {};
    const blkByPair   = {};
    const unblkByPair = {};
    const dmgByPair   = {};
    const whIdSet     = new Set();

    balanceRows.forEach(r => {
      const key = `${r._id.p}_${r._id.w}`;
      balByPair[key] = r.balance;
      whIdSet.add(r._id.w.toString());
    });
    blockedRows.forEach(r => { blkByPair[`${r._id.p}_${r._id.w}`] = r.qty; });
    unblockedRows.forEach(r => { unblkByPair[`${r._id.p}_${r._id.w}`] = r.qty; });
    grnDocs.forEach(g => {
      const w = g.warehouseId?.toString();
      if (!w) return;
      (g.items || []).forEach(it => {
        const pid = it.productId?._id ? it.productId._id.toString() : it.productId?.toString();
        if (!pid) return;
        const key = `${pid}_${w}`;
        dmgByPair[key] = (dmgByPair[key] || 0) + (it.damageQuantity || 0);
      });
    });

    if (warehouseId) whIdSet.add(warehouseId);

    // Warehouse names (one query)
    const whDocs = await Warehouse.find({ _id: { $in: [...whIdSet] } }).select('name').lean();
    const whNameMap = {};
    whDocs.forEach(w => { whNameMap[w._id.toString()] = w.name; });

    const buildStock = (product) => {
      const pid = product._id.toString();
      const whIds = warehouseId
        ? [warehouseId]
        : [...whIdSet].filter(w => balByPair[`${pid}_${w}`] !== undefined);

      const warehouseStock = [];
      let totalStock = 0;
      for (const w of whIds) {
        const key = `${pid}_${w}`;
        const currentStock = balByPair[key] ?? 0;
        const damagedQty   = dmgByPair[key] ?? 0;
        let blockedQty     = (blkByPair[key] ?? 0) - (unblkByPair[key] ?? 0);
        blockedQty = Math.max(0, blockedQty);
        const netStock = Math.max(0, currentStock - damagedQty - blockedQty);
        warehouseStock.push({
          warehouseId:   w.toString(),
          warehouseName: whNameMap[w] || '',
          quantity:      currentStock,
          damaged:       damagedQty,
          blocked:       blockedQty,
          net:           netStock,
        });
        totalStock += netStock;
      }
      const availableStock = warehouseId
        ? (warehouseStock.find(x => x.warehouseId === warehouseId)?.net ?? 0)
        : totalStock;
      return { warehouseStock, totalStock, availableStock };
    };

    // 4) Assemble response (all in-memory now — no per-product queries)
    const productsWithDetails = products.map((product) => {
      try {
        const pricing = pricingMap[product._id.toString()] || null;
        const { warehouseStock, totalStock, availableStock } = buildStock(product);
        const isOutOfStock = availableStock <= 0;
        const isLowStock   = !isOutOfStock && product.minStockLevel && availableStock <= product.minStockLevel;

        const discountInfo = resolveDiscount(product);
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
          masterDiscountCap:      discountInfo?.masterDiscountCap ?? null,
          combinedLevelDiscountCap: discountInfo?.combinedLevelDiscountCap ?? null,
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
    });

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

      const directDiscountPct = discountInfo?.directDiscountPct || 0;
      const masterDiscountCap = discountInfo?.masterDiscountCap ?? null;
      const combinedLevelDiscountCap = discountInfo?.combinedLevelDiscountCap ?? null;
      const configuredLevels = discountInfo?.configuredLevels || [];
      const availableLevels = discountInfo?.availableLevels || [];

      // ── 2. Selected manual level discounts ───────────────────────────────
      const manualDiscountLevels = item.manualDiscountLevels || {};
      let levelDiscountPct = 0;
      const appliedLevelDetails = [];
      const stages = [];
      if (directDiscountPct > 0) {
        stages.push({ key: 'direct', kind: 'direct', ratePercentage: directDiscountPct });
      }

      for (const [levelName, rawRate] of Object.entries(manualDiscountLevels)) {
        const enteredPct = Number(rawRate || 0);
        if (enteredPct <= 0) continue;
        const configuredLevel = configuredLevels.find(level => level.levelName === levelName);
        if (!configuredLevel) {
          const error = new Error(`Discount level "${levelName}" is not configured for ${product.itemName}`);
          error.name = 'DiscountPolicyError';
          error.code = 'DISCOUNT_LEVEL_NOT_FOUND';
          throw error;
        }
        if (!seAllowedLevels.includes(levelName)) {
          const error = new Error(`Not allowed to use discount level: ${levelName}`);
          error.name = 'DiscountPolicyError';
          error.code = 'DISCOUNT_LEVEL_NOT_ALLOWED';
          throw error;
        }
        if (!Number.isFinite(enteredPct) || enteredPct > Number(configuredLevel.discountPercentage || 0)) {
          const error = new Error(`Discount level "${levelName}" must be between 0 and ${configuredLevel.discountPercentage}%`);
          error.name = 'DiscountPolicyError';
          error.code = 'DISCOUNT_LEVEL_RATE_EXCEEDED';
          throw error;
        }
        levelDiscountPct += enteredPct;
        appliedLevelDetails.push({ levelName, pct: enteredPct });
        stages.push({ key: `level:${levelName}`, kind: 'level', levelName, ratePercentage: enteredPct });
      }

      // ── 3. Dealer extra discount ─────────────────────────────────────────
      const dealerExtraDiscountPct = dealer ? findDealerExtraDiscount(product, dealer) : 0;
      if (dealerExtraDiscountPct > 0) {
        stages.push({ key: 'dealer-extra', kind: 'dealer_extra', ratePercentage: dealerExtraDiscountPct });
      }
      if (!discountInfo && stages.length > 0) {
        const error = new Error(`No applicable discount mapping exists for ${product.itemName}`);
        error.name = 'DiscountPolicyError';
        error.code = 'DISCOUNT_MAPPING_NOT_FOUND';
        throw error;
      }
      const hasDiscountStages = stages.some(
        (stage) => Number(stage.ratePercentage || 0) > 0
      );
      const hasPositiveLevelStages = stages.some(
        (stage) => stage.kind === 'level' && Number(stage.ratePercentage || 0) > 0
      );
      if (discountInfo && hasDiscountStages && masterDiscountCap === null) {
        const error = new Error(`Master discount cap is not configured for the applicable sales mapping on ${product.itemName}.`);
        error.name = 'DiscountPolicyError';
        error.code = 'MASTER_DISCOUNT_CAP_NOT_CONFIGURED';
        throw error;
      }
      if (hasPositiveLevelStages && combinedLevelDiscountCap === null) {
        const error = new Error(`Combined selected-level discount cap is not configured for the applicable sales mapping on ${product.itemName}.`);
        error.name = 'DiscountPolicyError';
        error.code = 'COMBINED_LEVEL_DISCOUNT_CAP_NOT_CONFIGURED';
        throw error;
      }

      // ── 4. Canonical sequential calculation: direct, levels, dealer extra ──
      const lineSubtotal = Number(item.quantity || 0) * Number(item.unitPrice || 0);
      const calculation = calculateDiscountLine({
        baseAmount: lineSubtotal,
        stages,
        gstPercentage: Number(product.gst || 0),
        masterDiscountCap,
        combinedLevelDiscountCap,
        allowedDiscountLevels: seAllowedLevels,
        enforceLevelPermissions: true,
        bypassLevelPermission: false
      });
      const totalDiscountPct = calculation.effectiveDiscountPercentage;
      const discountAmount = calculation.discountAmount;
      const finalPrice = calculation.finalAmount;
      const gstAmount = calculation.gstAmount;
      const lineTotal = calculation.finalAmount;

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
        levelDiscountPct,
        dealerExtraDiscountPct,
        totalDiscountPct,
        discountAmount,
        finalPrice,
        gstAmount,
        lineTotal,
        masterDiscountCap,
        combinedLevelDiscountCap,
        availableLevels,
        // Points
        pointsEarned,
        pointScheme,
        masterDiscountCapApplied: calculation.masterDiscountCapApplied,
        combinedLevelDiscountCapApplied: calculation.combinedLevelDiscountCapApplied,
        levelDiscountTotalPercentage: calculation.levelDiscountTotalPercentage,
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
    const isPolicyError = error?.name === 'DiscountPolicyError' || error instanceof RangeError;
    res.status(isPolicyError ? 400 : 500).json({
      success: false,
      message: isPolicyError ? error.message : 'Failed to calculate discounts',
      ...(error.code ? { code: error.code } : {}),
      ...(!isPolicyError ? { error: error.message } : {})
    });
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


// Canonical SE creation path. It deliberately delegates pricing, discount,
// overdue and credit-limit enforcement to the same service used by CRM orders.
export const createCanonicalSalesOrder = async (req, res) => {
  try {
    const { Dealer, Product } = getModels(req);
    const { dealerId, products = [], customerNotes, orderDate, deliveryDate } = req.body;

    if (!dealerId || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Dealer and products are required'
      });
    }

    const normalizedRole = String(req.user?.role || '').toLowerCase().replace(/\s+/g, '_');
    let dealerQuery = { _id: dealerId, isActive: true };
    if (normalizedRole === 'sales_executive') {
      const hasDirectAssignments = await Dealer.exists({
        isActive: true,
        salesExecutiveId: req.user._id
      });
      dealerQuery = hasDirectAssignments
        ? { ...dealerQuery, salesExecutiveId: req.user._id }
        : { ...dealerQuery, regionId: { $in: req.user.assignedRegions || [] } };
    }

    const dealer = await Dealer.findOne(dealerQuery);
    if (!dealer) {
      const exists = await Dealer.exists({ _id: dealerId });
      return res.status(exists ? 403 : 404).json({
        success: false,
        message: exists
          ? 'This dealer is not assigned to the logged-in Sales Executive.'
          : 'Dealer not found'
      });
    }

    const classifiedProducts = await Promise.all(products.map(async (item) => {
      const productId = item.productId || item.product;
      const product = await Product.findById(productId)
        .select('salesType itemName rateSlabs gst')
        .lean();
      if (!product) {
        const error = new Error(`Product not found: ${productId}`);
        error.statusCode = 404;
        throw error;
      }
      const warehouse = item.isOutOfStock ? null : (item.warehouseId || item.warehouse || null);
      return {
        product: productId,
        quantity: Number(item.quantity || 0),
        warehouse,
        warehouseName: warehouse ? (item.warehouseName || 'Main Warehouse') : 'No Stock',
        salesType: product.salesType || 'Regular Sale',
        promisedEffectiveDiscountPercentage: null
      };
    }));

    const groups = [
      {
        salesType: 'Regular Sale',
        products: classifiedProducts.filter((item) => item.salesType !== 'CD Sales'),
        creditDays: dealer.creditDaysRegular || dealer.creditDays || 0
      },
      {
        salesType: 'CD Sales',
        products: classifiedProducts.filter((item) => item.salesType === 'CD Sales'),
        creditDays: dealer.creditDaysCD || dealer.creditDays || 0
      }
    ].filter((group) => group.products.length > 0);

    const orderType = dealer.dealerType === 'Wholesale'
      ? 'Wholesale Sales Order'
      : (dealer.dealerType === 'Retail' ? 'Retail Sales Order' : 'Independent Sales Order');
    const createdOrders = [];

    for (const group of groups) {
      const isOutOfStock = group.products.some((item) => !item.warehouse);
      const order = await createCanonicalSalesOrderRecord(req.dbConnection, {
        dealer: dealer._id,
        region: dealer.regionId,
        products: group.products,
        orderDate: orderDate || new Date(),
        deliveryDate,
        creditDays: group.creditDays,
        creditDaysApplied: group.creditDays,
        salesType: group.salesType,
        type: orderType,
        remarks: customerNotes,
        status: 'Pending',
        isOutOfStock,
        stockValidation: []
      }, req.user._id, req.company);
      createdOrders.push(order);
      try {
        await notifyNewSEOrder(
          req.user?.name || 'Sales Executive',
          dealer.name,
          order.orderNumber,
          req.company
        );
      } catch (notificationError) {
        console.error(
          `New SE order notification failed for ${order.orderNumber} (non-fatal):`,
          notificationError.message
        );
      }
    }

    const firstOrder = createdOrders[0];
    return res.status(201).json({
      success: true,
      message: createdOrders.length > 1
        ? 'Sales orders created and split by sales type successfully'
        : 'Sales order created successfully',
      order: {
        _id: firstOrder._id,
        orderNumber: firstOrder.orderNumber,
        status: firstOrder.status,
        totalAmount: firstOrder.totalAmount,
        creditAmount: firstOrder.creditAmount,
        creditOverlimit: firstOrder.creditOverlimit
      },
      orders: createdOrders,
      isSplit: createdOrders.length > 1
    });
  } catch (error) {
    console.error('Canonical SE Sales Order creation error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.statusCode ? error.message : 'Failed to create sales order',
      error: error.statusCode ? undefined : error.message
    });
  }
};
