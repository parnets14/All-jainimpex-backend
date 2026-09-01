/**
 * Dealer Product Permission Utility
 * 
 * Implements smart hierarchical product permission logic:
 * - If only brands selected → all products from those brands
 * - If brand + categories selected → only those category products
 * - If brand + subcategories selected → only those subcategory products
 * - Mixed selections work independently per brand
 */

import mongoose from 'mongoose';

const getScopedModel = (dbConnection, name) => (
  dbConnection?.models?.[name] || mongoose.model(name)
);

/**
 * Calculate accessible products based on hierarchical permissions
 * 
 * @param {Object} dealer - Dealer document with populated permissions
 * @returns {Object} MongoDB query filter for products
 */
export async function calculateProductFilter(dealer, dbConnection = null) {
  // If no brands selected, allow all products (default behavior)
  if (!dealer.allowedBrands || dealer.allowedBrands.length === 0) {
    console.log('📊 No brand restrictions - allowing all products');
    return { status: 'active' };
  }

  const getPermissionId = (value) => value?._id || value;
  const brandIds = dealer.allowedBrands.map(getPermissionId);
  const categoryIds = (dealer.allowedCategories || []).map(getPermissionId);
  const subcategoryIds = (dealer.allowedSubcategories || []).map(getPermissionId);
  const extendedIds = (dealer.allowedExtendedSubcategories || []).map(getPermissionId);

  console.log('📊 Permission counts:', {
    brands: brandIds.length,
    categories: categoryIds.length,
    subcategories: subcategoryIds.length,
    extended: extendedIds.length
  });

  // SCENARIO 1: Only brands selected (no categories/subcategories/extended)
  if (categoryIds.length === 0 && subcategoryIds.length === 0 && extendedIds.length === 0) {
    console.log('✅ Scenario 1: Brand-only selection - all products from selected brands');
    return {
      status: 'active',
      brand: { $in: brandIds }
    };
  }

  // SCENARIO 2: Brands + some hierarchy selections
  // Need to build per-brand logic
  const orConditions = await Promise.all(brandIds.map(async (brandId) => {
    const brandIdStr = brandId.toString();
    const [brandCategories, brandSubcategories, brandExtended] = await Promise.all([
      categoryIds.length > 0
        ? getCategoriesForBrand(brandIdStr, categoryIds, dbConnection)
        : [],
      subcategoryIds.length > 0
        ? getSubcategoriesForBrand(brandIdStr, subcategoryIds, dbConnection)
        : [],
      extendedIds.length > 0
        ? getExtendedForBrand(brandIdStr, extendedIds, dbConnection)
        : []
    ]);

    // If no specific selections exist for this brand, all active products from
    // that brand remain accessible, matching the existing permission rule.
    if (brandCategories.length === 0 && brandSubcategories.length === 0 && brandExtended.length === 0) {
      return { brand: brandId, status: 'active' };
    }

    const brandCondition = { brand: brandId, status: 'active' };
    if (brandExtended.length > 0) {
      brandCondition.subcategory1 = { $in: brandExtended };
    } else if (brandSubcategories.length > 0) {
      brandCondition.subcategory = { $in: brandSubcategories };
    } else if (brandCategories.length > 0) {
      brandCondition.category = { $in: brandCategories };
    }
    return brandCondition;
  }));

  if (orConditions.length === 0) {
    // Fallback: no products accessible
    return { _id: null };
  }

  if (orConditions.length === 1) {
    return orConditions[0];
  }

  return {
    $or: orConditions
  };
}

/**
 * Get categories that belong to a specific brand
 */
async function getCategoriesForBrand(brandId, categoryIds, dbConnection) {
  const Category = getScopedModel(dbConnection, 'Category');
  const categories = await Category.find({
    _id: { $in: categoryIds },
    brand: brandId
  }).select('_id');
  
  return categories.map(c => c._id);
}

/**
 * Get subcategories that belong to a specific brand (through category)
 */
async function getSubcategoriesForBrand(brandId, subcategoryIds, dbConnection) {
  const Subcategory = getScopedModel(dbConnection, 'Subcategory');
  const Category = getScopedModel(dbConnection, 'Category');
  
  // First get categories for this brand
  const brandCategories = await Category.find({ brand: brandId }).select('_id');
  const brandCategoryIds = brandCategories.map(c => c._id);
  
  // Then get subcategories that belong to those categories
  const subcategories = await Subcategory.find({
    _id: { $in: subcategoryIds },
    category: { $in: brandCategoryIds }
  }).select('_id');
  
  return subcategories.map(s => s._id);
}

/**
 * Get extended subcategories that belong to a specific brand (through subcategory → category)
 */
async function getExtendedForBrand(brandId, extendedIds, dbConnection) {
  const ExtendedSubcategory = getScopedModel(dbConnection, 'ExtendedSubcategory');
  const Subcategory = getScopedModel(dbConnection, 'Subcategory');
  const Category = getScopedModel(dbConnection, 'Category');
  
  // Get categories for this brand
  const brandCategories = await Category.find({ brand: brandId }).select('_id');
  const brandCategoryIds = brandCategories.map(c => c._id);
  
  // Get subcategories for those categories
  const brandSubcategories = await Subcategory.find({
    category: { $in: brandCategoryIds }
  }).select('_id');
  const brandSubcategoryIds = brandSubcategories.map(s => s._id);
  
  // Get extended subcategories for those subcategories
  const extended = await ExtendedSubcategory.find({
    _id: { $in: extendedIds },
    subcategory: { $in: brandSubcategoryIds }
  }).select('_id');
  
  return extended.map(e => e._id);
}

/**
 * Get summary of what products are accessible
 */
export async function getAccessibleProductsSummary(dealer) {
  const filter = await calculateProductFilter(dealer);
  const Product = mongoose.model('Product');
  
  const totalCount = await Product.countDocuments(filter);
  
  return {
    totalProducts: totalCount,
    filter: filter,
    logic: describeFilterLogic(dealer)
  };
}

/**
 * Describe the filter logic in human-readable format
 */
function describeFilterLogic(dealer) {
  const brandCount = dealer.allowedBrands?.length || 0;
  const categoryCount = dealer.allowedCategories?.length || 0;
  const subcategoryCount = dealer.allowedSubcategories?.length || 0;
  const extendedCount = dealer.allowedExtendedSubcategories?.length || 0;

  if (brandCount === 0) {
    return 'All products accessible (no restrictions)';
  }

  if (categoryCount === 0 && subcategoryCount === 0 && extendedCount === 0) {
    return `All products from ${brandCount} selected brand(s)`;
  }

  return `Smart hierarchical filtering: ${brandCount} brand(s) with mixed category/subcategory/extended selections`;
}

export default {
  calculateProductFilter,
  getAccessibleProductsSummary
};
