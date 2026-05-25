import { productSchema } from '../../models/Product.js';
import { dealerSchema } from '../../models/Dealer.js';
import { discountMappingSchema } from '../../models/DiscountMapping.js';
import { dealerPricingSchema } from '../../models/DealerPricing.js';
import { stockMovementSchema } from '../../models/Stock.js';
import { grnSchema } from '../../models/GRN.js';
import { categorySchema } from '../../models/Category.js';
import { subcategorySchema } from '../../models/Subcategory.js';
import { extendedSubcategorySchema } from '../../models/ExtendedSubcategory.js';
import { brandSchema } from '../../models/Brand.js';

// ── Model helper (company-specific connection) ────────────────────────────────
const getModels = (db) => ({
  Product:        db.models.Product        || db.model('Product',        productSchema),
  Dealer:         db.models.Dealer         || db.model('Dealer',         dealerSchema),
  DiscountMapping:db.models.DiscountMapping|| db.model('DiscountMapping',discountMappingSchema),
  DealerPricing:  db.models.DealerPricing  || db.model('DealerPricing',  dealerPricingSchema),
  StockMovement:  db.models.StockMovement  || db.model('StockMovement',  stockMovementSchema),
  GRN:            db.models.GRN            || db.model('GRN',            grnSchema),
  Category:       db.models.Category       || db.model('Category',       categorySchema),
  Subcategory:    db.models.Subcategory    || db.model('Subcategory',    subcategorySchema),
  ExtendedSubcategory: db.models.ExtendedSubcategory || db.model('ExtendedSubcategory', extendedSubcategorySchema),
  Brand:          db.models.Brand          || db.model('Brand',          brandSchema),
});

// ── Permission filter builder ─────────────────────────────────────────────────
/**
 * Build a MongoDB filter that respects the dealer's allowed brands/categories/subcategories.
 * Logic:
 *   - No allowedBrands → all active products
 *   - allowedBrands only → all active products from those brands
 *   - allowedBrands + allowedCategories/Subcategories → hierarchical filter per brand
 */
async function buildPermissionFilter(dealer, models) {
  const { Category, Subcategory } = models;

  const brandIds = (dealer.allowedBrands || []).map(b =>
    typeof b === 'object' ? b._id : b
  );

  // No restrictions → all active products
  if (brandIds.length === 0) {
    return { status: 'active' };
  }

  const categoryIds = (dealer.allowedCategories || []).map(c =>
    typeof c === 'object' ? c._id : c
  );
  const subcategoryIds = (dealer.allowedSubcategories || []).map(s =>
    typeof s === 'object' ? s._id : s
  );

  // Brand-only restriction
  if (categoryIds.length === 0 && subcategoryIds.length === 0) {
    return { status: 'active', brand: { $in: brandIds } };
  }

  // Hierarchical: build per-brand OR conditions
  const orConditions = [];

  for (const brandId of brandIds) {
    const brandIdStr = brandId.toString();

    // Categories belonging to this brand
    const brandCats = categoryIds.length > 0
      ? (await Category.find({ _id: { $in: categoryIds }, brand: brandId }).select('_id')).map(c => c._id)
      : [];

    // Subcategories belonging to this brand's categories
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
      // Brand selected but no matching categories/subcategories → all products from brand
      orConditions.push({ status: 'active', brand: brandId });
    }
  }

  if (orConditions.length === 0) return { _id: null }; // no access
  if (orConditions.length === 1) return orConditions[0];
  return { $or: orConditions };
}

// ── Stock calculator (reused for list + detail) ───────────────────────────────
async function calcAvailableStock(productId, models) {
  const { GRN, StockMovement } = models;
  try {
    const grns = await GRN.find({ 'items.productId': productId }).select('warehouseId items').lean();

    const warehouseStock = {};
    grns.forEach(grn => {
      if (!grn.warehouseId) return;
      const wId = grn.warehouseId.toString();
      if (!warehouseStock[wId]) warehouseStock[wId] = { total: 0, damaged: 0 };
      grn.items.forEach(item => {
        const itemPid = item.productId?._id ? item.productId._id.toString() : item.productId?.toString();
        if (itemPid === productId.toString()) {
          warehouseStock[wId].total   += item.acceptedQuantity || 0;
          warehouseStock[wId].damaged += item.damageQuantity   || 0;
        }
      });
    });

    const warehouseIds = Object.keys(warehouseStock);
    if (warehouseIds.length === 0) return 0;

    const allMovements = await StockMovement.find({
      productId,
      warehouseId: { $in: warehouseIds }
    }).lean();

    const byWarehouse = {};
    allMovements.forEach(m => {
      const wId = m.warehouseId.toString();
      if (!byWarehouse[wId]) byWarehouse[wId] = [];
      byWarehouse[wId].push(m);
    });

    let total = 0;
    for (const wId of warehouseIds) {
      const movements = byWarehouse[wId] || [];
      let currentStock = warehouseStock[wId].total;

      if (movements.length > 0) {
        const sorted = movements.sort((a, b) =>
          new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)
        );
        currentStock = sorted[0]?.balance || 0;
      }

      // Blocked stock
      let blocked = 0;
      movements.forEach(m => {
        if (m.type === 'OUT' && m.referenceType === 'SALE' && m.remarks?.includes('Stock Blocked'))
          blocked += m.quantity || 0;
        if (m.type === 'IN'  && m.referenceType === 'SALE' && m.remarks?.includes('Stock Unblocked'))
          blocked -= m.quantity || 0;
      });
      blocked = Math.max(0, blocked);

      const net = currentStock - warehouseStock[wId].damaged - blocked;
      if (net > 0) total += net;
    }
    return Math.max(0, Math.round(total));
  } catch {
    return 0;
  }
}

// ── Pricing helper ────────────────────────────────────────────────────────────
async function getPricingForProduct(product, models, dealerType = null) {
  const { DealerPricing, DiscountMapping } = models;

  const dealerPricing = await DealerPricing.findOne({ product: product._id, isActive: true });

  let mrp = 0;
  let dealerPrice = 0;

  if (dealerPricing) {
    // Use product.mrp (set in Product Master) as the authoritative MRP
    // Fall back to dealerPricing.mrp, then product.totalAmount
    mrp         = product.mrp || dealerPricing.mrp || product.totalAmount || (dealerPricing.sellingPrice * (1 + (product.gst || 0) / 100));
    dealerPrice = mrp; // Start with MRP (GST inclusive) — discount will be applied on MRP
    console.log(`📊 MRP for ${product.itemName}: product.mrp=${product.mrp}, dealerPricing.mrp=${dealerPricing.mrp}, totalAmount=${product.totalAmount}, sellingPrice=${dealerPricing.sellingPrice}, FINAL mrp=${mrp}`);
  } else {
    // No DealerPricing record — use product.mrp or product.totalAmount
    mrp         = product.mrp || product.totalAmount || (product.rateSlabs?.length > 0 ? product.rateSlabs[0].rate * (1 + (product.gst || 0) / 100) : 0);
    dealerPrice = mrp;
    console.log(`📊 MRP for ${product.itemName} (no pricing): product.mrp=${product.mrp}, totalAmount=${product.totalAmount}, FINAL mrp=${mrp}`);
  }

  // Build discount query — match by product hierarchy (only include non-null refs)
  const orConditions = [];
  if (product.brand?._id || product.brand)
    orConditions.push({ targetType: 'brand',       brand:       product.brand?._id       || product.brand       });
  if (product.category?._id || product.category)
    orConditions.push({ targetType: 'category',    category:    product.category?._id    || product.category    });
  if (product.subcategory?._id || product.subcategory)
    orConditions.push({ targetType: 'subcategory', subcategory: product.subcategory?._id || product.subcategory });
  orConditions.push({ targetType: 'product', product: product._id });

  const discountQuery = {
    mappingType: 'sales',
    status: 'Approved',
    isActive: true,
    validFrom: { $lte: new Date() },
    validTo:   { $gte: new Date() },
    $or: orConditions,
  };

  // Filter by dealer type — empty array means applies to all
  if (dealerType) {
    discountQuery.$and = [{
      $or: [
        { applicableDealerTypes: { $size: 0 } },
        { applicableDealerTypes: { $exists: false } },
        { applicableDealerTypes: dealerType },
      ]
    }];
  }

  const discountMappings = await DiscountMapping.find(discountQuery);
  console.log(`🏷️ Discounts for ${product.itemName}: found ${discountMappings.length}, dealerType: ${dealerType}`);

  let maxDiscount = 0;
  let directDiscountPct = 0;
  let appliedDiscount = null;

  discountMappings.forEach(d => {
    // Check directDiscountPercentage first
    if ((d.discountType === 'direct' || d.discountType === 'both') && d.directDiscountPercentage > 0) {
      if (d.directDiscountPercentage > directDiscountPct) {
        directDiscountPct = d.directDiscountPercentage;
        appliedDiscount = {
          discountId:         d._id,
          discountPercentage: d.directDiscountPercentage,
          level:              'Direct',
          validFrom:          d.validFrom,
          validTo:            d.validTo,
        };
      }
    }
    // Also check level-based discounts
    if (d.discountType === 'level_based' || d.discountType === 'both') {
      d.levels.forEach(level => {
        if (level.discountPercentage > maxDiscount) {
          maxDiscount = level.discountPercentage;
        }
      });
    }
  });

  // For dealer app: only apply DIRECT discount automatically
  // Level-based discounts are selected manually during invoice/order creation
  if (directDiscountPct > 0) {
    console.log(`💰 Applying ${directDiscountPct}% direct discount to ${product.itemName}: ${dealerPrice} → ${dealerPrice * (1 - directDiscountPct / 100)}`);
    dealerPrice = dealerPrice * (1 - directDiscountPct / 100);
  }

  return {
    mrp:                  Math.round(mrp * 100) / 100,
    dealerPrice:          Math.round(dealerPrice * 100) / 100,
    originalDealerPrice:  Math.round(mrp * 100) / 100, // MRP before discount (GST inclusive)
    purchasePrice:        dealerPricing?.purchasePrice || 0,
    hasOffer:             directDiscountPct > 0,
    discountPercentage:   directDiscountPct,
    directDiscountPercentage: directDiscountPct,
    discount:             appliedDiscount,
  };
}

// ── GET /api/app/products ─────────────────────────────────────────────────────
export const getProductsForDealer = async (req, res) => {
  try {
    const models = getModels(req.dbConnection);
    const { Product, Dealer } = models;

    console.log(`🏢 getProductsForDealer - company: ${req.company}, db: ${req.dbConnection.name}`);

    const {
      page = 1,
      limit = 20,
      search,
      category,
      subcategory,
      brand,
    } = req.query;

    // Identify dealer by username (dealer code)
    const dealer = await Dealer.findOne({ code: req.user.username })
      .populate('allowedBrands',       '_id name')
      .populate('allowedCategories',    '_id name')
      .populate('allowedSubcategories', '_id name');

    if (!dealer) {
      console.log(`❌ Dealer not found - username: ${req.user.username}, company: ${req.company}`);
      return res.status(404).json({ success: false, message: 'Dealer not found' });
    }

    console.log(`✅ Dealer found: ${dealer.name} (${dealer.code}) in ${req.company}`);

    // Build permission-aware base filter
    const permFilter = await buildPermissionFilter(dealer, models);

    // Merge with user-supplied filters
    const filter = { ...permFilter };

    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      const searchOr = [
        { productCode: searchRegex },
        { itemName:    searchRegex },
        { description: searchRegex },
      ];
      // Merge with existing $or if present
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
        delete filter.$or;
      } else {
        filter.$or = searchOr;
      }
    }

    // Additional user-supplied filters (only if within allowed scope)
    if (category)    filter.category    = category;
    if (subcategory) filter.subcategory = subcategory;
    if (brand)       filter.brand       = brand;

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate('category',    'name')
        .populate('subcategory', 'name')
        .populate('brand',       'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Product.countDocuments(filter),
    ]);

    console.log(`📦 Products query - company: ${req.company}, found: ${products.length}, total: ${total}, db: ${req.dbConnection.name}`);

    // Enrich with pricing + stock
    const enriched = await Promise.all(
      products.map(async (product) => {
        const [pricing, availableStock] = await Promise.all([
          getPricingForProduct(product, models, dealer.dealerType),
          calcAvailableStock(product._id, models),
        ]);
        return {
          ...product,
          ...pricing,
          availableStock,
          isOutOfStock: availableStock <= 0,
        };
      })
    );

    res.json({
      success: true,
      products: enriched,
      pagination: {
        currentPage:  pageNum,
        totalPages:   Math.ceil(total / limitNum),
        totalProducts: total,
        hasNext:      skip + products.length < total,
        hasPrev:      pageNum > 1,
      },
    });
  } catch (error) {
    console.error('Error getting products for dealer:', error);
    res.status(500).json({ success: false, message: 'Error fetching products', error: error.message });
  }
};

// ── GET /api/app/products/:id ─────────────────────────────────────────────────
export const getProductDetailsForDealer = async (req, res) => {
  try {
    const models = getModels(req.dbConnection);
    const { Product, Dealer } = models;

    const product = await Product.findById(req.params.id)
      .populate('category',    'name')
      .populate('subcategory', 'name')
      .populate('brand',       'name')
      .lean();

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const dealer = await Dealer.findOne({ code: req.user.username })
      .populate('allowedBrands',       '_id')
      .populate('allowedCategories',    '_id')
      .populate('allowedSubcategories', '_id');

    if (!dealer) {
      return res.status(404).json({ success: false, message: 'Dealer not found' });
    }

    // Verify dealer has access to this product
    const permFilter = await buildPermissionFilter(dealer, models);
    const hasAccess = await Product.countDocuments({ _id: product._id, ...permFilter });
    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'Access denied to this product' });
    }

    const [pricing, availableStock] = await Promise.all([
      getPricingForProduct(product, models, dealer.dealerType),
      calcAvailableStock(product._id, models),
    ]);

    res.json({
      success: true,
      product: {
        ...product,
        ...pricing,
        availableStock,
        isOutOfStock: availableStock <= 0,
      },
    });
  } catch (error) {
    console.error('Error getting product details:', error);
    res.status(500).json({ success: false, message: 'Error fetching product details', error: error.message });
  }
};

// ── GET /api/app/products/category/:categoryId ────────────────────────────────
export const getProductsByCategoryForDealer = async (req, res) => {
  try {
    const models = getModels(req.dbConnection);
    const { Product, Dealer } = models;
    const { categoryId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const dealer = await Dealer.findOne({ code: req.user.username })
      .populate('allowedBrands', '_id')
      .populate('allowedCategories', '_id')
      .populate('allowedSubcategories', '_id');

    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const permFilter = await buildPermissionFilter(dealer, models);
    const filter = { ...permFilter, category: categoryId };

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [products, total] = await Promise.all([
      Product.find(filter).populate('category', 'name').populate('brand', 'name')
        .sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Product.countDocuments(filter),
    ]);

    res.json({
      success: true,
      products,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalProducts: total,
        hasNext: skip + products.length < total,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error('Error getting products by category:', error);
    res.status(500).json({ success: false, message: 'Error fetching products', error: error.message });
  }
};

// ── GET /api/app/products/brand/:brandId ──────────────────────────────────────
export const getProductsByBrandForDealer = async (req, res) => {
  try {
    const models = getModels(req.dbConnection);
    const { Product, Dealer } = models;
    const { brandId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const dealer = await Dealer.findOne({ code: req.user.username })
      .populate('allowedBrands', '_id')
      .populate('allowedCategories', '_id')
      .populate('allowedSubcategories', '_id');

    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const permFilter = await buildPermissionFilter(dealer, models);
    const filter = { ...permFilter, brand: brandId };

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [products, total] = await Promise.all([
      Product.find(filter).populate('category', 'name').populate('brand', 'name')
        .sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Product.countDocuments(filter),
    ]);

    res.json({
      success: true,
      products,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalProducts: total,
        hasNext: skip + products.length < total,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error('Error getting products by brand:', error);
    res.status(500).json({ success: false, message: 'Error fetching products', error: error.message });
  }
};
