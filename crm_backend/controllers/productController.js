import { productSchema } from "../models/Product.js";
import { categorySchema } from "../models/Category.js";
import { subcategorySchema } from "../models/Subcategory.js";
import { extendedSubcategorySchema } from "../models/ExtendedSubcategory.js";
import { brandSchema } from "../models/Brand.js";
import { grnSchema } from "../models/GRN.js";
import { stockMovementSchema } from "../models/Stock.js";
import { salesOrderSchema } from "../models/SalesOrder.js";
import { dealerInvoiceSchema } from "../models/DealerInvoice.js";
import { dealerPricingSchema } from "../models/DealerPricing.js";
import { productPriceListHistorySchema } from "../models/ProductPriceListHistory.js";
import { warehouseSchema } from "../models/Warehouse.js";
import StockMovementService from "../services/stockMovementService.js";
import { getLowStockSnapshot } from "../services/dashboardStockService.js";
import mongoose from "mongoose";

// Helper function to get models from company-specific connection
const getModels = (dbConnection) => {
  return {
    Product: dbConnection.models.Product || dbConnection.model('Product', productSchema),
    Category: dbConnection.models.Category || dbConnection.model('Category', categorySchema),
    Subcategory: dbConnection.models.Subcategory || dbConnection.model('Subcategory', subcategorySchema),
    ExtendedSubcategory: dbConnection.models.ExtendedSubcategory || dbConnection.model('ExtendedSubcategory', extendedSubcategorySchema),
    Brand: dbConnection.models.Brand || dbConnection.model('Brand', brandSchema),
    GRN: dbConnection.models.GRN || dbConnection.model('GRN', grnSchema),
    StockMovement: dbConnection.models.StockMovement || dbConnection.model('StockMovement', stockMovementSchema),
    SalesOrder: dbConnection.models.SalesOrder || dbConnection.model('SalesOrder', salesOrderSchema),
    DealerInvoice: dbConnection.models.DealerInvoice || dbConnection.model('DealerInvoice', dealerInvoiceSchema),
    DealerPricing: dbConnection.models.DealerPricing || dbConnection.model('DealerPricing', dealerPricingSchema),
    ProductPriceListHistory: dbConnection.models.ProductPriceListHistory || dbConnection.model('ProductPriceListHistory', productPriceListHistorySchema),
    Warehouse: dbConnection.models.Warehouse || dbConnection.model('Warehouse', warehouseSchema),
  };
};

// @desc    Get all products
// @route   GET /api/products
// @access  Private
export const getProducts = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Product, Category, Subcategory, ExtendedSubcategory, Brand, StockMovement } = getModels(req.dbConnection);
    
    const {
      page = 1,
      limit = 10,
      search,
      category,
      subcategory,
      subcategory1,
      subcategory2,
      subcategory3,
      subcategory4,
      subcategory5,
      brand,
      status,
      salesType,
      productType,
      includeStock = "true",
      compact = "false",
    } = req.query;
    const shouldIncludeStock = includeStock !== "false";
    const compactMode = compact === "true";

    const filter = {};

    // Enhanced search filter - searches across multiple fields
    if (search) {
      // Escape regex special characters to prevent regex errors
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
      
      // First, try to find matching categories, subcategories, and brands by name
      const [
        matchingCategories,
        matchingSubcategories,
        matchingBrands,
        matchingExtended1,
        matchingExtended2,
        matchingExtended3,
        matchingExtended4,
        matchingExtended5,
      ] = await Promise.all([
        Category.find({ name: { $regex: escapedSearch, $options: "i" } }).select("_id"),
        Subcategory.find({ name: { $regex: escapedSearch, $options: "i" } }).select("_id"),
        Brand.find({ name: { $regex: escapedSearch, $options: "i" } }).select("_id"),
        ExtendedSubcategory.find({ name: { $regex: escapedSearch, $options: "i" }, level: 1 }).select("_id"),
        ExtendedSubcategory.find({ name: { $regex: escapedSearch, $options: "i" }, level: 2 }).select("_id"),
        ExtendedSubcategory.find({ name: { $regex: escapedSearch, $options: "i" }, level: 3 }).select("_id"),
        ExtendedSubcategory.find({ name: { $regex: escapedSearch, $options: "i" }, level: 4 }).select("_id"),
        ExtendedSubcategory.find({ name: { $regex: escapedSearch, $options: "i" }, level: 5 }).select("_id"),
      ]);

      const categoryIds = matchingCategories.map((c) => c._id);
      const subcategoryIds = matchingSubcategories.map((s) => s._id);
      const brandIds = matchingBrands.map((b) => b._id);
      const extended1Ids = matchingExtended1.map((e) => e._id);
      const extended2Ids = matchingExtended2.map((e) => e._id);
      const extended3Ids = matchingExtended3.map((e) => e._id);
      const extended4Ids = matchingExtended4.map((e) => e._id);
      const extended5Ids = matchingExtended5.map((e) => e._id);

      filter.$or = [
        { productCode: { $regex: escapedSearch, $options: "i" } },
        { itemName: { $regex: escapedSearch, $options: "i" } },
        { aliasName: { $regex: escapedSearch, $options: "i" } },
        { description: { $regex: escapedSearch, $options: "i" } },
        { HSNCode: { $regex: escapedSearch, $options: "i" } },
        ...(categoryIds.length > 0 ? [{ category: { $in: categoryIds } }] : []),
        ...(subcategoryIds.length > 0
          ? [{ subcategory: { $in: subcategoryIds } }]
          : []),
        ...(brandIds.length > 0 ? [{ brand: { $in: brandIds } }] : []),
        ...(extended1Ids.length > 0
          ? [{ subcategory1: { $in: extended1Ids } }]
          : []),
        ...(extended2Ids.length > 0
          ? [{ subcategory2: { $in: extended2Ids } }]
          : []),
        ...(extended3Ids.length > 0
          ? [{ subcategory3: { $in: extended3Ids } }]
          : []),
        ...(extended4Ids.length > 0
          ? [{ subcategory4: { $in: extended4Ids } }]
          : []),
        ...(extended5Ids.length > 0
          ? [{ subcategory5: { $in: extended5Ids } }]
          : []),
      ];
    }

    // Category filter
    if (category) {
      filter.category = category;
    }

    // Subcategory filter
    if (subcategory) {
      filter.subcategory = subcategory;
    }

    // Extended subcategory filters
    if (subcategory1) {
      filter.subcategory1 = subcategory1;
    }
    if (subcategory2) {
      filter.subcategory2 = subcategory2;
    }
    if (subcategory3) {
      filter.subcategory3 = subcategory3;
    }
    if (subcategory4) {
      filter.subcategory4 = subcategory4;
    }
    if (subcategory5) {
      filter.subcategory5 = subcategory5;
    }

    // Brand filter
    if (brand) {
      filter.brand = brand;
    }

    // Status filter
    if (status) {
      filter.status = status;
    }

    // Sales Type filter
    if (salesType) {
      filter.salesType = salesType;
    }

    // Product Type filter
    if (productType) {
      filter.productType = productType;
    }

    let productsQuery = Product.find(filter);

    if (compactMode) {
      // Order/invoice forms need product identity, hierarchy, units and pricing
      // inputs only. Exclude large descriptions/audit fields from bulk preload.
      productsQuery = productsQuery
        .select("productCode itemName description HSNCode internalRate mrp totalAmount gst unitPrice rateSlabs brand category subcategory subcategory1 subcategory2 subcategory3 subcategory4 subcategory5 status salesType productType unit alternateUnit alternateUnitQuantity minStockLevel")
        .populate("category", "name")
        .populate("subcategory", "name")
        .populate("subcategory1", "name")
        .populate("subcategory2", "name")
        .populate("subcategory3", "name")
        .populate("subcategory4", "name")
        .populate("subcategory5", "name")
        .populate("brand", "name");
    } else {
      productsQuery = productsQuery
        .populate("category", "name")
        .populate("subcategory", "name")
        .populate("subcategory1", "name")
        .populate("subcategory2", "name")
        .populate("subcategory3", "name")
        .populate("subcategory4", "name")
        .populate("subcategory5", "name")
        .populate("brand", "name")
        .populate("createdBy", "name email");
    }

    productsQuery = productsQuery
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const [products, total] = await Promise.all([
      productsQuery,
      Product.countDocuments(filter)
    ]);

    // Order/invoice forms request includeStock=false because they load live
    // warehouse stock separately. Skip the movement scan entirely in that mode.
    const productIds = products.map(p => p._id);
    const allStockMovements = shouldIncludeStock
      ? await StockMovement.find({ productId: { $in: productIds } }).lean()
      : [];
    
    // Group movements by product and warehouse
    const productWarehouseMap = {};
    allStockMovements.forEach(movement => {
      const productId = movement.productId.toString();
      const warehouseId = movement.warehouseId?.toString();
      
      if (!warehouseId) return;
      
      const key = `${productId}-${warehouseId}`;
      if (!productWarehouseMap[key]) {
        productWarehouseMap[key] = [];
      }
      productWarehouseMap[key].push(movement);
    });
    
    // Calculate stock for all products
    const productsWithStock = shouldIncludeStock
      ? await Promise.all(
      products.map(async (product) => {
        try {
          const productId = product._id.toString();
          
          // Get unique warehouses for this product
          const warehouseIds = new Set();
          allStockMovements.forEach(m => {
            if (m.productId.toString() === productId && m.warehouseId) {
              warehouseIds.add(m.warehouseId.toString());
            }
          });
          
          let totalStock = 0;
          let totalDamaged = 0;
          let totalBlocked = 0;
          
          // Calculate stock for each warehouse
          for (const warehouseId of warehouseIds) {
            const key = `${productId}-${warehouseId}`;
            const movements = productWarehouseMap[key] || [];
            
            // Aggregate movement direction/quantity is authoritative. Stored
            // balance is an audit snapshot and may be backdated.
            const currentStock = movements.reduce((balance, movement) => (
              movement.type === 'IN'
                ? balance + Number(movement.quantity || 0)
                : balance - Number(movement.quantity || 0)
            ), 0);
            totalStock += currentStock;
            
            // Calculate blocked stock from movements
            const blockedMovements = movements.filter(m => 
              m.type === 'OUT' && 
              m.referenceType === 'SALE' && 
              m.remarks && 
              m.remarks.includes('Stock Blocked')
            );
            const unblockedMovements = movements.filter(m => 
              m.type === 'IN' && 
              m.referenceType === 'SALE' && 
              m.remarks && 
              m.remarks.includes('Stock Unblocked')
            );
            
            let blockedQty = 0;
            blockedMovements.forEach(m => blockedQty += m.quantity || 0);
            unblockedMovements.forEach(m => blockedQty -= m.quantity || 0);
            totalBlocked += Math.max(0, blockedQty);
            
            // Calculate damaged stock from GRN movements
            const damagedMovements = movements.filter(m => 
              m.referenceType === 'GRN' && 
              m.remarks && 
              m.remarks.toLowerCase().includes('damage')
            );
            damagedMovements.forEach(m => totalDamaged += Math.abs(m.quantity || 0));
          }
          
          // Usable StockMovement quantity already excludes damaged GRN units and
          // includes SALE reservation OUT/IN rows.
          const netStock = totalStock;
          
          return {
            ...product.toObject(),
            stockInfo: {
              totalStock,
              damagedStock: totalDamaged,
              blockedStock: totalBlocked,
              availableStock: Math.max(0, netStock),
              isLowStock: product.minStockLevel && netStock <= product.minStockLevel,
              minStockLevel: product.minStockLevel || 0
            }
          };
        } catch (error) {
          console.error(`Error fetching stock for product ${product._id}:`, error);
          return {
            ...product.toObject(),
            stockInfo: {
              totalStock: 0,
              damagedStock: 0,
              blockedStock: 0,
              availableStock: 0,
              isLowStock: false,
              minStockLevel: product.minStockLevel || 0
            }
          };
        }
      })
    )
      : products.map(product => product.toObject());

    res.json({
      success: true,
      products: productsWithStock,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Get products error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching products",
    });
  }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @desc    Get single product
// @route   GET /api/products/:id
// @access  Private
export const getProduct = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Product } = getModels(req.dbConnection);
    
    const product = await Product.findById(req.params.id)
      .populate("category", "name description")
      .populate("subcategory", "name description")
      .populate("subcategory1", "name description")
      .populate("subcategory2", "name description")
      .populate("subcategory3", "name description")
      .populate("subcategory4", "name description")
      .populate("subcategory5", "name description")
      .populate("brand", "name description")
      .populate("createdBy", "name email");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.json({
      success: true,
      product,
    });
  } catch (error) {
    console.error("Get product error:", error);
    if (error.kind === "ObjectId") {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error while fetching product",
    });
  }
};

const PRODUCT_TEXT_FIELDS = [
  "productCode",
  "HSNCode",
  "itemName",
  "aliasName",
  "description",
  "unit",
  "alternateUnit",
  "internalRate",
];
const PRODUCT_RELATION_FIELDS = [
  "brand",
  "category",
  "subcategory",
  "subcategory1",
  "subcategory2",
  "subcategory3",
  "subcategory4",
  "subcategory5",
];
const PRODUCT_NUMERIC_FIELDS = [
  "alternateUnitQuantity",
  "unitPrice",
  "mrp",
  "gst",
  "minStockLevel",
];
const EXTENDED_SUBCATEGORY_FIELDS = [
  "subcategory1",
  "subcategory2",
  "subcategory3",
  "subcategory4",
  "subcategory5",
];

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const productInputError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const parseFiniteNumber = (value, label, { allowNull = false } = {}) => {
  if (value === "" || value === null || value === undefined) {
    if (allowNull) return null;
    throw productInputError(`${label} is required`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw productInputError(`${label} must be a valid number`);
  }
  return parsed;
};

const normalizeRateSlabs = (rateSlabs, unitPrice) => {
  if (rateSlabs === undefined || rateSlabs === null || rateSlabs.length === 0) {
    return [{ quantity: 1, rate: unitPrice, amount: unitPrice }];
  }
  if (!Array.isArray(rateSlabs)) {
    throw productInputError("Rate slabs must be an array");
  }

  return rateSlabs.map((slab, index) => {
    const quantity = parseFiniteNumber(slab?.quantity, `Rate slab ${index + 1} quantity`);
    const rate = parseFiniteNumber(slab?.rate, `Rate slab ${index + 1} rate`);
    if (quantity <= 0 || rate <= 0) {
      throw productInputError(`Rate slab ${index + 1} quantity and rate must be greater than zero`);
    }
    return { quantity, rate, amount: quantity * rate };
  });
};

const normalizeProductInput = (body, { partial = false, existingProduct = null } = {}) => {
  const normalized = {};

  PRODUCT_TEXT_FIELDS.forEach((field) => {
    if (!partial || hasOwn(body, field)) {
      const value = typeof body[field] === "string" ? body[field].trim() : body[field];
      normalized[field] = value || (field === "aliasName" ? "" : undefined);
    }
  });

  PRODUCT_RELATION_FIELDS.forEach((field) => {
    if (!partial || hasOwn(body, field)) {
      normalized[field] = body[field] || undefined;
    }
  });

  PRODUCT_NUMERIC_FIELDS.forEach((field) => {
    if (!partial || hasOwn(body, field)) {
      normalized[field] = parseFiniteNumber(body[field], field, {
        allowNull: [
          "mrp",
          "unitPrice",
          "alternateUnitQuantity",
          "minStockLevel",
        ].includes(field),
      });
    }
  });

  ["status", "salesType", "productType"].forEach((field) => {
    if (!partial || hasOwn(body, field)) normalized[field] = body[field];
  });
  if (!partial || hasOwn(body, "images")) {
    normalized.images = Array.isArray(body.images) ? body.images : [];
  }

  if (!partial) {
    normalized.status = normalized.status || "active";
    normalized.salesType = normalized.salesType || "Regular Sale";
    normalized.productType = normalized.productType || "Regular Product";
    normalized.minStockLevel ??= 0;
    normalized.gst = parseFiniteNumber(body.gst, "GST");
  }

  const effective = {
    ...(existingProduct ? existingProduct.toObject() : {}),
    ...normalized,
  };

  if (!effective.itemName?.trim()) throw productInputError("Item Name is required");
  if (!effective.unit?.trim()) throw productInputError("Unit is required");
  if (!effective.brand || !effective.category || !effective.subcategory) {
    throw productInputError("Brand, category and subcategory are required");
  }

  const gst = parseFiniteNumber(effective.gst, "GST");
  if (gst < 0 || gst > 100) throw productInputError("GST must be between 0 and 100");
  if (!partial || hasOwn(body, "gst")) normalized.gst = gst;

  const minStockLevel = parseFiniteNumber(effective.minStockLevel ?? 0, "Minimum stock level");
  if (minStockLevel < 0) throw productInputError("Minimum stock level cannot be negative");
  if (!partial || hasOwn(body, "minStockLevel")) normalized.minStockLevel = minStockLevel;

  if (effective.alternateUnit) {
    const alternateQuantity = parseFiniteNumber(
      effective.alternateUnitQuantity,
      "Alternate unit quantity"
    );
    if (alternateQuantity <= 0) {
      throw productInputError("Alternate unit quantity must be greater than zero");
    }
    normalized.alternateUnitQuantity = alternateQuantity;
  } else if (!partial || hasOwn(body, "alternateUnit")) {
    normalized.alternateUnit = undefined;
    normalized.alternateUnitQuantity = undefined;
  }

  const effectiveMrp = effective.mrp === "" || effective.mrp === undefined
    ? null
    : effective.mrp;
  const pricingChanged = !partial || ["mrp", "unitPrice", "gst"].some((field) => hasOwn(body, field));
  let effectiveUnitPrice;
  if (effectiveMrp !== null) {
    const parsedMrp = parseFiniteNumber(effectiveMrp, "MRP");
    if (parsedMrp <= 0) throw productInputError("MRP must be greater than zero");
    effectiveUnitPrice = Number((parsedMrp / (1 + gst / 100)).toFixed(2));
    if (pricingChanged) {
      normalized.mrp = parsedMrp;
      normalized.unitPrice = effectiveUnitPrice;
    }
  } else {
    effectiveUnitPrice = parseFiniteNumber(effective.unitPrice, "Unit price");
    if (effectiveUnitPrice <= 0) throw productInputError("Unit price must be greater than zero");
    if (!partial || hasOwn(body, "unitPrice")) normalized.unitPrice = effectiveUnitPrice;
    if (hasOwn(body, "mrp")) normalized.mrp = null;
  }

  const existingUnitPrice = Number(existingProduct?.unitPrice);
  const unitPriceChanged = partial
    && pricingChanged
    && (!Number.isFinite(existingUnitPrice) || Math.abs(existingUnitPrice - effectiveUnitPrice) > 0.005);

  if (!partial || hasOwn(body, "rateSlabs")) {
    normalized.rateSlabs = normalizeRateSlabs(body.rateSlabs, effectiveUnitPrice);
  } else if (unitPriceChanged) {
    const existingSlabs = Array.isArray(effective.rateSlabs) ? effective.rateSlabs : [];
    const onlySlab = existingSlabs[0];
    const hasDefaultSlab = existingSlabs.length === 1
      && Number(onlySlab?.quantity) === 1
      && Math.abs(Number(onlySlab?.rate) - existingUnitPrice) <= 0.005;

    if (!hasDefaultSlab) {
      throw productInputError(
        "Rate slabs are required when changing the price of a product with custom rate slabs"
      );
    }
    normalized.rateSlabs = normalizeRateSlabs(undefined, effectiveUnitPrice);
  } else if (!Array.isArray(effective.rateSlabs) || effective.rateSlabs.length === 0) {
    normalized.rateSlabs = normalizeRateSlabs(undefined, effectiveUnitPrice);
  }

  return normalized;
};

const validateProductHierarchy = async (models, hierarchy) => {
  const { Category, Subcategory, ExtendedSubcategory, Brand } = models;
  const requiredIds = [hierarchy.brand, hierarchy.category, hierarchy.subcategory];
  const extendedIds = EXTENDED_SUBCATEGORY_FIELDS.map((field) => hierarchy[field]).filter(Boolean);
  const allIds = [...requiredIds, ...extendedIds];
  if (allIds.some((id) => !mongoose.isValidObjectId(id))) {
    throw productInputError("One or more hierarchy selections are invalid");
  }

  const [brandDoc, categoryDoc, subcategoryDoc, extendedDocs] = await Promise.all([
    Brand.findById(hierarchy.brand),
    Category.findById(hierarchy.category),
    Subcategory.findById(hierarchy.subcategory),
    extendedIds.length ? ExtendedSubcategory.find({ _id: { $in: extendedIds } }) : [],
  ]);

  if (!brandDoc) throw productInputError("Brand not found");
  if (!categoryDoc) throw productInputError("Category not found");
  if (!subcategoryDoc) throw productInputError("Subcategory not found");
  if (categoryDoc.brand?.toString() !== hierarchy.brand.toString()) {
    throw productInputError("Category does not belong to the selected brand");
  }
  if (
    subcategoryDoc.brand?.toString() !== hierarchy.brand.toString() ||
    subcategoryDoc.category?.toString() !== hierarchy.category.toString()
  ) {
    throw productInputError("Subcategory does not belong to the selected brand and category");
  }

  const extendedById = new Map(extendedDocs.map((doc) => [doc._id.toString(), doc]));
  let previousId = null;
  let gapFound = false;
  for (let index = 0; index < EXTENDED_SUBCATEGORY_FIELDS.length; index += 1) {
    const field = EXTENDED_SUBCATEGORY_FIELDS[index];
    const selectedId = hierarchy[field];
    if (!selectedId) {
      gapFound = true;
      previousId = null;
      continue;
    }
    if (gapFound) {
      throw productInputError(`Extended subcategory level ${index + 1} requires level ${index}`);
    }

    const doc = extendedById.get(selectedId.toString());
    if (!doc) throw productInputError(`Extended subcategory level ${index + 1} not found`);
    if (doc.level !== index + 1) {
      throw productInputError(`Selected extended subcategory must be level ${index + 1}`);
    }
    if (
      doc.brand?.toString() !== hierarchy.brand.toString() ||
      doc.category?.toString() !== hierarchy.category.toString() ||
      doc.subcategory?.toString() !== hierarchy.subcategory.toString()
    ) {
      throw productInputError(
        `Extended subcategory level ${index + 1} does not belong to the selected hierarchy`
      );
    }

    const parentId = doc.parentExtendedSubcategory?.toString() || null;
    if ((index === 0 && parentId !== null) || (index > 0 && parentId !== previousId)) {
      throw productInputError(`Extended subcategory level ${index + 1} has an invalid parent`);
    }
    previousId = selectedId.toString();
  }
};

const duplicateProductResponse = (res, error) => {
  if (error?.code !== 11000) return false;
  const duplicateField = Object.keys(error.keyPattern || error.keyValue || {})[0] || "product code";
  res.status(409).json({
    success: false,
    message: duplicateField === "productCode"
      ? "Product code already exists"
      : `A product with the same ${duplicateField} already exists`,
  });
  return true;
};

// @desc    Create product
// @route   POST /api/products
// @access  Private
export const createProduct = async (req, res) => {
  try {
    const models = getModels(req.dbConnection);
    const { Product } = models;
    const productData = normalizeProductInput(req.body);

    await validateProductHierarchy(models, productData);

    if (productData.productCode) {
      const existingProduct = await Product.findOne({
        productCode: productData.productCode,
      }).select("_id");
      if (existingProduct) {
        return res.status(409).json({
          success: false,
          message: "Product code already exists",
        });
      }
    }

    const product = new Product({
      ...productData,
      createdBy: req.user._id,
    });
    await product.save();

    await product.populate([
      { path: "category", select: "name" },
      { path: "subcategory", select: "name" },
      { path: "subcategory1", select: "name" },
      { path: "subcategory2", select: "name" },
      { path: "subcategory3", select: "name" },
      { path: "subcategory4", select: "name" },
      { path: "subcategory5", select: "name" },
      { path: "brand", select: "name" },
      { path: "createdBy", select: "name email" },
    ]);

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      product,
    });
  } catch (error) {
    console.error("Create product error:", error);
    if (duplicateProductResponse(res, error)) return;
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((value) => value.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", "),
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error while creating product",
    });
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private
export const updateProduct = async (req, res) => {
  try {
    const models = getModels(req.dbConnection);
    const { Product } = models;
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const updates = normalizeProductInput(req.body, {
      partial: true,
      existingProduct: product,
    });
    const effectiveHierarchy = {};
    PRODUCT_RELATION_FIELDS.forEach((field) => {
      effectiveHierarchy[field] = hasOwn(updates, field) ? updates[field] : product[field];
    });
    await validateProductHierarchy(models, effectiveHierarchy);

    if (updates.productCode && updates.productCode !== product.productCode) {
      const existingProduct = await Product.findOne({
        productCode: updates.productCode,
        _id: { $ne: product._id },
      }).select("_id");
      if (existingProduct) {
        return res.status(409).json({
          success: false,
          message: "Product code already exists",
        });
      }
    }

    Object.entries(updates).forEach(([field, value]) => {
      product[field] = value;
    });
    await product.save();

    await product.populate([
      { path: "category", select: "name" },
      { path: "subcategory", select: "name" },
      { path: "subcategory1", select: "name" },
      { path: "subcategory2", select: "name" },
      { path: "subcategory3", select: "name" },
      { path: "subcategory4", select: "name" },
      { path: "subcategory5", select: "name" },
      { path: "brand", select: "name" },
      { path: "createdBy", select: "name email" },
    ]);

    res.json({
      success: true,
      message: "Product updated successfully",
      product,
    });
  } catch (error) {
    console.error("Update product error:", error);
    if (duplicateProductResponse(res, error)) return;
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((value) => value.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", "),
      });
    }
    if (error.kind === "ObjectId" || error.name === "CastError") {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error while updating product",
    });
  }
};

// @desc    Upload product image
// @route   POST /api/products/upload-image
// @access  Private
export const uploadProductImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided",
      });
    }

    // Return the image URL
    const imageUrl = `/uploads/${req.file.filename}`;

    res.status(200).json({
      success: true,
      message: "Image uploaded successfully",
      url: imageUrl,
      filename: req.file.filename,
    });
  } catch (error) {
    console.error("Upload product image error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while uploading image",
    });
  }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private
export const deleteProduct = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Product, GRN, SalesOrder, DealerInvoice, StockMovement } = getModels(req.dbConnection);
    
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const productId = req.params.id;

    // 1. Check if stock exists for this product (using StockMovement)
    const stockEntry = await StockMovement.findOne({ 
      productId: productId, 
      balance: { $gt: 0 } 
    }).lean();
    if (stockEntry) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete "${product.itemName}" — stock of ${stockEntry.balance} units exists in warehouse. Clear stock before deleting.`,
      });
    }

    // 2. Check if used in any Sales Order
    const salesOrderCount = await SalesOrder.countDocuments({ "products.product": productId });
    if (salesOrderCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete "${product.itemName}" — it is used in ${salesOrderCount} sales order(s). Deletion is not allowed.`,
      });
    }

    // 3. Check if used in any GRN / Purchase Order
    const grnCount = await GRN.countDocuments({ "items.product": productId });
    if (grnCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete "${product.itemName}" — it is used in ${grnCount} GRN/purchase order(s). Deletion is not allowed.`,
      });
    }

    // 4. Check if used in any Dealer Invoice
    const invoiceCount = await DealerInvoice.countDocuments({ "items.product": productId });
    if (invoiceCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete "${product.itemName}" — it is used in ${invoiceCount} invoice(s). Deletion is not allowed.`,
      });
    }

    await Product.findByIdAndDelete(productId);

    res.json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Delete product error:", error);
    if (error.kind === "ObjectId") {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error while deleting product",
    });
  }
};

// @desc    Get product statistics
// @route   GET /api/products/stats
// @access  Private
export const getProductStats = async (req, res) => {
  try {
    const { Product, StockMovement, Warehouse } = getModels(req.dbConnection);

    const [totalProducts, activeProducts, inactiveProducts, lowStockRows] = await Promise.all([
      Product.countDocuments(),
      Product.countDocuments({ status: "active" }),
      Product.countDocuments({ status: "inactive" }),
      getLowStockSnapshot({ Product, StockMovement, Warehouse })
    ]);

    res.json({
      success: true,
      data: {
        totalProducts,
        activeProducts,
        inactiveProducts,
        lowStockItems: lowStockRows.length,
        lowStock: lowStockRows.length,
      },
    });
  } catch (error) {
    console.error("Get product stats error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching product statistics",
    });
  }
};

// @desc    Export products to PDF
// @route   GET /api/products/export/pdf
// @access  Private
export const exportProductsToPDF = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Product } = getModels(req.dbConnection);
    
    const { search, category, subcategory, brand, status } = req.query;

    const filter = {};

    // Apply same filters as getProducts
    if (search) {
      filter.$or = [
        { productCode: { $regex: search, $options: "i" } },
        { itemName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    if (category) filter.category = category;
    if (subcategory) filter.subcategory = subcategory;
    if (brand) filter.brand = brand;
    if (status) filter.status = status;

    const products = await Product.find(filter)
      .populate("category", "name")
      .populate("subcategory", "name")
      .populate("brand", "name")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 });

    // Create PDF content
    const PDFDocument = (await import("pdfkit")).default;
    const doc = new PDFDocument({ margin: 50 });

    // Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=products-${
        new Date().toISOString().split("T")[0]
      }.pdf`
    );

    // Pipe PDF to response
    doc.pipe(res);

    // Add title
    doc.fontSize(20).text("Product Master Report", { align: "center" });
    doc.fontSize(12).text(`Generated on: ${new Date().toLocaleDateString()}`, {
      align: "center",
    });
    doc.moveDown();

    // Add summary
    doc
      .fontSize(14)
      .text(`Total Products: ${products.length}`, { align: "left" });
    doc.moveDown();

    // Add table headers
    const tableTop = doc.y;
    const itemCodeX = 50;
    const itemNameX = 150;
    const categoryX = 300;
    const brandX = 400;
    const unitX = 480;
    const statusX = 520;

    doc
      .fontSize(10)
      .text("Code", itemCodeX, tableTop)
      .text("Name", itemNameX, tableTop)
      .text("Category", categoryX, tableTop)
      .text("Brand", brandX, tableTop)
      .text("Unit", unitX, tableTop)
      .text("Status", statusX, tableTop);

    // Draw header line
    doc
      .moveTo(itemCodeX, tableTop + 15)
      .lineTo(570, tableTop + 15)
      .stroke();

    let currentY = tableTop + 25;

    // Add product rows
    products.forEach((product, index) => {
      if (currentY > 700) {
        // Start new page if needed
        doc.addPage();
        currentY = 50;
      }

      doc
        .fontSize(8)
        .text(product.productCode || "N/A", itemCodeX, currentY)
        .text(
          product.itemName.substring(0, 20) +
            (product.itemName.length > 20 ? "..." : ""),
          itemNameX,
          currentY
        )
        .text(product.category?.name || "N/A", categoryX, currentY)
        .text(product.brand?.name || "N/A", brandX, currentY)
        .text(product.unit || "N/A", unitX, currentY)
        .text(product.status || "N/A", statusX, currentY);

      currentY += 20;
    });

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error("Export PDF error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while exporting PDF",
    });
  }
};

// @desc    Export products to Excel
// @route   GET /api/products/export/excel
// @access  Private
export const exportProductsToExcel = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Product } = getModels(req.dbConnection);
    
    const { search, category, subcategory, brand, status } = req.query;

    const filter = {};

    // Apply same filters as getProducts
    if (search) {
      filter.$or = [
        { productCode: { $regex: search, $options: "i" } },
        { itemName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    if (category) filter.category = category;
    if (subcategory) filter.subcategory = subcategory;
    if (brand) filter.brand = brand;
    if (status) filter.status = status;

    const products = await Product.find(filter)
      .populate("category", "name")
      .populate("subcategory", "name")
      .populate("subcategory1", "name")
      .populate("subcategory2", "name")
      .populate("subcategory3", "name")
      .populate("subcategory4", "name")
      .populate("subcategory5", "name")
      .populate("brand", "name")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 });

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Products");

    // Set column headers
    worksheet.columns = [
      { header: "Product Code", key: "productCode", width: 15 },
      { header: "HSN Code", key: "hsnCode", width: 12 },
      { header: "Item Name", key: "itemName", width: 30 },
      { header: "Description", key: "description", width: 40 },
      { header: "Category", key: "category", width: 20 },
      { header: "Subcategory", key: "subcategory", width: 20 },
      { header: "Extended Level 1", key: "subcategory1", width: 20 },
      { header: "Extended Level 2", key: "subcategory2", width: 20 },
      { header: "Extended Level 3", key: "subcategory3", width: 20 },
      { header: "Brand", key: "brand", width: 20 },
      { header: "Unit", key: "unit", width: 10 },
      { header: "Alternate Unit", key: "alternateUnit", width: 15 },
      { header: "GST (%)", key: "gst", width: 10 },
      { header: "Min Stock Level", key: "minStockLevel", width: 15 },
      { header: "Total Amount", key: "totalAmount", width: 15 },
      { header: "Status", key: "status", width: 10 },
      { header: "Created Date", key: "createdAt", width: 15 },
      { header: "Created By", key: "createdBy", width: 20 },
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE6F3FF" },
    };

    // Add data rows
    products.forEach((product) => {
      worksheet.addRow({
        productCode: product.productCode || "",
        hsnCode: product.HSNCode || "",
        itemName: product.itemName || "",
        description: product.description || "",
        category: product.category?.name || "",
        subcategory: product.subcategory?.name || "",
        subcategory1: product.subcategory1?.name || "",
        subcategory2: product.subcategory2?.name || "",
        subcategory3: product.subcategory3?.name || "",
        brand: product.brand?.name || "",
        unit: product.unit || "",
        alternateUnit: product.alternateUnit || "",
        gst: product.gst || 0,
        minStockLevel: product.minStockLevel || 0,
        totalAmount: product.totalAmount || 0,
        status: product.status || "",
        createdAt: product.createdAt
          ? new Date(product.createdAt).toLocaleDateString()
          : "",
        createdBy: product.createdBy?.name || "",
      });
    });

    // Add summary row
    worksheet.addRow({});
    worksheet.addRow({
      productCode: "SUMMARY",
      itemName: `Total Products: ${products.length}`,
      category: `Generated: ${new Date().toLocaleDateString()}`,
    });

    // Set response headers
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=products-${
        new Date().toISOString().split("T")[0]
      }.xlsx`
    );

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Export Excel error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while exporting Excel",
    });
  }
};

// @desc    Get products by category hierarchy
// @route   GET /api/products/category-hierarchy/:categoryHierarchyId
// @access  Private
export const getProductsByCategoryHierarchy = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Product } = getModels(req.dbConnection);
    
    const products = await Product.find({
      categoryHierarchy: req.params.categoryHierarchyId,
    })
      .populate("categoryHierarchy", "name level")
      .populate("brand", "name")
      .sort({ itemName: 1 });

    res.json({
      success: true,
      products,
    });
  } catch (error) {
    console.error("Get products by category hierarchy error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching products by category hierarchy",
    });
  }
};

// @desc    Get products by brand
// @route   GET /api/products/brand/:brandId
// @access  Private
export const getProductsByBrand = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Product } = getModels(req.dbConnection);
    
    const products = await Product.find({ brand: req.params.brandId })
      .populate("categoryHierarchy", "name level")
      .populate("brand", "name")
      .sort({ itemName: 1 });

    res.json({
      success: true,
      products,
    });
  } catch (error) {
    console.error("Get products by brand error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching products by brand",
    });
  }
};

// @desc    Get price list (productCode, name, internalRate, mrp, direct discount)
// @route   GET /api/products/price-list
// @access  Private
export const getPriceList = async (req, res) => {
  try {
    const { Product, Category, Subcategory, Brand, DealerPricing, StockMovement } = getModels(req.dbConnection);

    const {
      page = 1,
      limit = 50,
      search,
      brand,
      category,
      subcategory,
    } = req.query;

    const filter = {};

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
      const [matchingCategories, matchingSubcategories, matchingBrands] = await Promise.all([
        Category.find({ name: { $regex: escapedSearch, $options: "i" } }).select("_id"),
        Subcategory.find({ name: { $regex: escapedSearch, $options: "i" } }).select("_id"),
        Brand.find({ name: { $regex: escapedSearch, $options: "i" } }).select("_id"),
      ]);
      filter.$or = [
        { productCode: { $regex: escapedSearch, $options: "i" } },
        { itemName: { $regex: escapedSearch, $options: "i" } },
        { aliasName: { $regex: escapedSearch, $options: "i" } },
        ...(matchingCategories.length ? [{ category: { $in: matchingCategories.map(c => c._id) } }] : []),
        ...(matchingSubcategories.length ? [{ subcategory: { $in: matchingSubcategories.map(s => s._id) } }] : []),
        ...(matchingBrands.length ? [{ brand: { $in: matchingBrands.map(b => b._id) } }] : []),
      ];
    }

    if (brand) filter.brand = brand;
    if (category) filter.category = category;
    if (subcategory) filter.subcategory = subcategory;

    const total = await Product.countDocuments(filter);

    const products = await Product.find(filter)
      .select("productCode itemName internalRate mrp gst unitPrice rateSlabs brand category subcategory")
      .populate("brand", "name")
      .populate("category", "name")
      .populate("subcategory", "name")
      .sort({ itemName: 1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();

    // Batch-join the direct discount from DealerPricing (1 query, not N+1)
    const productIds = products.map((p) => p._id);
    const pricingRecords = await DealerPricing.find({
      product: { $in: productIds },
      isActive: true,
    })
      .select("product directDiscountPercentage hasDirectDiscount")
      .lean();
    const discountByProduct = new Map();
    for (const pr of pricingRecords) {
      discountByProduct.set(pr.product.toString(), pr.directDiscountPercentage || 0);
    }

    // Batch the current stock (latest running balance) per product in ONE
    // aggregation — single warehouse per company so we take the latest movement.
    const stockByProduct = new Map();
    const openingByProduct = new Map();
    if (productIds.length > 0) {
      const stockAgg = await StockMovement.aggregate([
        { $match: { productId: { $in: productIds } } },
        { $sort: { date: 1, createdAt: 1 } },
        { $group: { _id: "$productId", balance: { $last: "$balance" } } },
      ]);
      for (const s of stockAgg) {
        stockByProduct.set(s._id.toString(), s.balance || 0);
      }
      // Existing opening-stock movement (qty + cost rate) per product
      const openingAgg = await StockMovement.find({
        productId: { $in: productIds },
        referenceType: "OPENING",
      }).select("productId quantity rate").lean();
      for (const o of openingAgg) {
        openingByProduct.set(o.productId.toString(), { quantity: o.quantity || 0, rate: o.rate ?? null });
      }
    }

    const data = products.map((p) => {
      // MRP fallback: stored mrp, else GST-inclusive from rateSlab/unitPrice
      const mrp =
        p.mrp ||
        (p.rateSlabs?.[0]?.rate || p.unitPrice || 0) * (1 + (p.gst || 0) / 100);
      return {
        _id: p._id,
        productCode: p.productCode || "",
        productName: p.itemName || "",
        internalRate: p.internalRate || "",
        mrp: parseFloat((mrp || 0).toFixed(2)),
        gst: p.gst || 0,
        directDiscount: discountByProduct.get(p._id.toString()) || 0,
        currentStock: stockByProduct.get(p._id.toString()) || 0,
        openingStock: openingByProduct.get(p._id.toString()) || null,
        brandName: p.brand?.name || "",
        categoryName: p.category?.name || "",
        subcategoryName: p.subcategory?.name || "",
      };
    });

    res.json({
      success: true,
      data,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Get price list error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update a price-list field (itemName, internalRate, mrp) with audit history
// @route   PATCH /api/products/price-list/:id
// @access  Private
export const updatePriceListItem = async (req, res) => {
  try {
    const { Product, DealerPricing, ProductPriceListHistory } = getModels(req.dbConnection);
    const { itemName, internalRate, mrp } = req.body;

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const changes = [];
    const historyDocs = [];

    // itemName
    if (itemName !== undefined && itemName !== null) {
      const newName = String(itemName).trim();
      if (!newName) {
        return res.status(400).json({ success: false, message: "Product name cannot be empty" });
      }
      if (newName !== (product.itemName || "")) {
        historyDocs.push({ field: "itemName", oldValue: product.itemName || "", newValue: newName });
        product.itemName = newName;
        changes.push("itemName");
      }
    }

    // internalRate
    if (internalRate !== undefined) {
      const newRate = internalRate === null || internalRate === "" ? null : String(internalRate).trim();
      if ((newRate || "") !== (product.internalRate || "")) {
        historyDocs.push({ field: "internalRate", oldValue: product.internalRate || "", newValue: newRate || "" });
        product.internalRate = newRate;
        changes.push("internalRate");
      }
    }

    // mrp
    let mrpChanged = false;
    if (mrp !== undefined && mrp !== null && mrp !== "") {
      const newMrp = parseFloat(mrp);
      if (isNaN(newMrp) || newMrp < 0) {
        return res.status(400).json({ success: false, message: "MRP must be a valid non-negative number" });
      }
      if (newMrp !== (product.mrp || 0)) {
        historyDocs.push({ field: "mrp", oldValue: product.mrp || 0, newValue: newMrp });
        product.mrp = newMrp;
        changes.push("mrp");
        mrpChanged = true;
      }
    }

    if (changes.length === 0) {
      return res.json({ success: true, message: "No changes detected", product });
    }

    await product.save();

    // Keep DealerPricing in sync when MRP changes (MRP is GST-inclusive →
    // recompute base selling price), mirroring the dealer-pricing screen.
    if (mrpChanged) {
      const pricing = await DealerPricing.findOne({ product: product._id, isActive: true });
      if (pricing) {
        pricing.mrp = product.mrp;
        const gstRate = product.gst || 0;
        pricing.sellingPrice = parseFloat((product.mrp / (1 + gstRate / 100)).toFixed(2));
        await pricing.save();
      }
    }

    // Write audit history (one row per changed field)
    await ProductPriceListHistory.insertMany(
      historyDocs.map((h) => ({
        product: product._id,
        productCode: product.productCode,
        productName: product.itemName,
        field: h.field,
        oldValue: h.oldValue,
        newValue: h.newValue,
        changedBy: req.user?._id,
        changedByName: req.user?.name || "",
        changedAt: new Date(),
      }))
    );

    res.json({
      success: true,
      message: "Price list updated successfully",
      changedFields: changes,
      product: {
        _id: product._id,
        productCode: product.productCode,
        productName: product.itemName,
        internalRate: product.internalRate || "",
        mrp: product.mrp || 0,
      },
    });
  } catch (error) {
    console.error("Update price list item error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get price-list edit history (optionally by product)
// @route   GET /api/products/price-list/history
// @access  Private
export const getPriceListHistory = async (req, res) => {
  try {
    const { ProductPriceListHistory } = getModels(req.dbConnection);
    const { productId, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (productId) filter.product = productId;

    const total = await ProductPriceListHistory.countDocuments(filter);
    const history = await ProductPriceListHistory.find(filter)
      .sort({ changedAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();

    res.json({
      success: true,
      data: history,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
      },
    });
  } catch (error) {
    console.error("Get price list history error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Set the opening stock (qty + cost/valuation rate) for a product.
//          Seeds a single OPENING stock movement into the company's single
//          warehouse, mirroring Tally's "Opening Balance" on a stock item.
// @route   PATCH /api/products/price-list/:id/opening-stock
// @access  Private
export const setOpeningStock = async (req, res) => {
  let stockLease = null;
  try {
    console.log('=== SET OPENING STOCK ===');
    console.log('Product ID:', req.params.id);
    console.log('Body:', JSON.stringify(req.body));
    console.log('User:', req.user?._id);
    const { Product, StockMovement, Warehouse, ProductPriceListHistory } = getModels(req.dbConnection);
    const { quantity, rate, warehouseId } = req.body;

    // Validate quantity
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty < 0) {
      return res.status(400).json({ success: false, message: "Opening quantity must be a valid non-negative number" });
    }

    // Validate optional cost rate
    let costRate = null;
    if (rate !== undefined && rate !== null && rate !== "") {
      costRate = parseFloat(rate);
      if (isNaN(costRate) || costRate < 0) {
        return res.status(400).json({ success: false, message: "Cost rate must be a valid non-negative number" });
      }
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Resolve the warehouse: use the explicitly selected one if provided,
    // otherwise fall back to the company's single (default) warehouse.
    let defaultWarehouse = null;
    if (warehouseId) {
      defaultWarehouse = await Warehouse.findById(warehouseId);
      if (!defaultWarehouse) {
        return res.status(404).json({ success: false, message: "Selected warehouse not found" });
      }
    } else {
      defaultWarehouse =
        (await Warehouse.findOne({ isActive: true, status: "active" }).sort({ createdAt: 1 })) ||
        (await Warehouse.findOne({ isActive: true }).sort({ createdAt: 1 })) ||
        (await Warehouse.findOne({}).sort({ createdAt: 1 }));
    }

    if (!defaultWarehouse) {
      return res.status(400).json({
        success: false,
        message: "No warehouse found. Please create a warehouse before setting opening stock.",
      });
    }

    stockLease = await StockMovementService.acquireStockLeases(
      req.dbConnection,
      [StockMovementService.stockKey(product._id, defaultWarehouse._id)]
    );

    // If an opening balance already exists for this product+warehouse, EDIT it
    // (adjust quantity by the delta so all running balances stay correct, and
    // update the cost rate). Otherwise create a fresh opening movement.
    const existingOpening = await StockMovement.findOne({
      productId: product._id,
      warehouseId: defaultWarehouse._id,
      referenceType: "OPENING",
    });

    let resultingStock;

    if (existingOpening) {
      const oldQty = existingOpening.quantity || 0;
      const delta = qty - oldQty;

      // Shift every balance for this product+warehouse by the quantity delta
      if (delta !== 0) {
        await StockMovement.updateMany(
          { productId: product._id, warehouseId: defaultWarehouse._id, _id: { $ne: existingOpening._id } },
          { $inc: { balance: delta } }
        );
      }
      // Update the opening movement itself (qty, rate, balance) via operators
      await StockMovement.updateOne(
        { _id: existingOpening._id },
        {
          $set: {
            quantity: qty,
            rate: costRate,
            operationKey: `OPENING:${product._id}:${defaultWarehouse._id}`,
            movementRole: 'OPENING',
            remarks: `Opening stock${costRate != null ? ` @ ₹${costRate}/unit` : ""}`,
          },
          $inc: { balance: delta },
        }
      );

      resultingStock = await StockMovementService.getCurrentStock(product._id, defaultWarehouse._id, req.dbConnection);

      await ProductPriceListHistory.create({
        product: product._id,
        productCode: product.productCode,
        productName: product.itemName,
        field: "openingStock",
        oldValue: `${oldQty} @ ₹${existingOpening.rate ?? 0}`,
        newValue: costRate != null ? `${qty} @ ₹${costRate}` : `${qty}`,
        changedBy: req.user?._id,
        changedByName: req.user?.name || "",
        changedAt: new Date(),
      });

      const StockArrivalService = (await import('../services/stockArrivalService.js')).default;
      await StockArrivalService.refreshStockKeys([
        { productId: product._id, warehouseId: defaultWarehouse._id }
      ], req.dbConnection);

      return res.json({
        success: true,
        message: "Opening stock updated successfully",
        data: {
          productId: product._id,
          warehouseId: defaultWarehouse._id,
          warehouseName: defaultWarehouse.name,
          quantity: qty,
          rate: costRate,
          currentStock: resultingStock,
        },
      });
    }

    // Compute running balance and create the IN movement
    const newBalance = await StockMovementService.calculateRunningBalance(
      product._id,
      defaultWarehouse._id,
      qty,
      null,
      req.dbConnection
    );

    await StockMovement.create({
      productId: product._id,
      warehouseId: defaultWarehouse._id,
      type: "IN",
      quantity: qty,
      balance: newBalance,
      rate: costRate,
      referenceNo: `OPENING-${product.productCode || product._id}`,
      referenceType: "OPENING",
      operationKey: `OPENING:${product._id}:${defaultWarehouse._id}`,
      movementRole: 'OPENING',
      date: new Date(),
      remarks: `Opening stock${costRate != null ? ` @ ₹${costRate}/unit` : ""}`,
      createdBy: req.user?._id,
    });

    // Audit log
    await ProductPriceListHistory.create({
      product: product._id,
      productCode: product.productCode,
      productName: product.itemName,
      field: "openingStock",
      oldValue: 0,
      newValue: costRate != null ? `${qty} @ ₹${costRate}` : `${qty}`,
      changedBy: req.user?._id,
      changedByName: req.user?.name || "",
      changedAt: new Date(),
    });

    const StockArrivalService = (await import('../services/stockArrivalService.js')).default;
    await StockArrivalService.refreshStockKeys([
      { productId: product._id, warehouseId: defaultWarehouse._id }
    ], req.dbConnection);

    res.json({
      success: true,
      message: "Opening stock set successfully",
      data: {
        productId: product._id,
        warehouseId: defaultWarehouse._id,
        warehouseName: defaultWarehouse.name,
        quantity: qty,
        rate: costRate,
        currentStock: newBalance,
      },
    });
  } catch (error) {
    console.error("Set opening stock error:", error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (stockLease) {
      try {
        await StockMovementService.releaseStockLeases(req.dbConnection, stockLease);
      } catch (releaseError) {
        console.error('Failed to release opening-stock lease:', releaseError.message);
      }
    }
  }
};
