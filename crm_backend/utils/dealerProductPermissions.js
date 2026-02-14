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

/**
 * Calculate accessible products based on hierarchical permissions
 * 
 * @param {Object} dealer - Dealer document with populated permissions
 * @returns {Object} MongoDB query filter for products
 */
export async function calculateProductFilter(dealer) {
  const Product = mongoose.model('Product');
  
  // If no brands selected, allow all products (default behavior)
  if (!dealer.allowedBrands || dealer.allowedBrands.length === 0) {
    console.log('📊 No brand restrictions - allowing all products');
    return { status: 'active' };
  }

  const brandIds = dealer.allowedBrands.map(b => 
    typeof b === 'object' ? b._id : b
  );
  
  const categoryIds = (dealer.allowedCategories || []).map(c => 
    typeof c === 'object' ? c._id : c
  );
  
  const subcategoryIds = (dealer.allowedSubcategories || []).map(s => 
    typeof s === 'object' ? s._id : s
  );
  
  const extendedIds = (dealer.allowedExtendedSubcategories || []).map(e => 
    typeof e === 'object' ? e._id : e
  );

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
  const orConditions = [];

  for (const brandId of brandIds) {
    const brandIdStr = brandId.toString();
    
    // Get categories for this brand
    const brandCategories = categoryIds.length > 0 
      ? await getCategoriesForBrand(brandIdStr, categoryIds)
      : [];
    
    // Get subcategories for this brand
    const brandSubcategories = subcategoryIds.length > 0
      ? await getSubcategoriesForBrand(brandIdStr, subcategoryIds)
      : [];
    
    // Get extended for this brand
    const brandExtended = extendedIds.length > 0
      ? await getExtendedForBrand(brandIdStr, extendedIds)
      : [];

    console.log(`📊 Brand ${brandIdStr}:`, {
      categories: brandCategories.length,
      subcategories: brandSubcategories.length,
      extended: brandExtended.length
    });

    // If no specific selections for this brand, include ALL products from this brand
    if (brandCategories.length === 0 && brandSubcategories.length === 0 && brandExtended.length === 0) {
      console.log(`✅ Brand ${brandIdStr}: No specific selections - including all products`);
      orConditions.push({
        brand: brandId,
        status: 'active'
      });
      continue;
    }

    // Build condition for this brand based on most specific selection
    const brandCondition = {
      brand: brandId,
      status: 'active'
    };

    // Priority: Extended > Subcategory > Category
    if (brandExtended.length > 0) {
      console.log(`✅ Brand ${brandIdStr}: Extended level selection`);
      brandCondition.subcategory1 = { $in: brandExtended };
    } else if (brandSubcategories.length > 0) {
      console.log(`✅ Brand ${brandIdStr}: Subcategory level selection`);
      brandCondition.subcategory = { $in: brandSubcategories };
    } else if (brandCategories.length > 0) {
      console.log(`✅ Brand ${brandIdStr}: Category level selection`);
      brandCondition.category = { $in: brandCategories };
    }

    orConditions.push(brandCondition);
  }

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
async function getCategoriesForBrand(brandId, categoryIds) {
  const Category = mongoose.model('Category');
  const categories = await Category.find({
    _id: { $in: categoryIds },
    brand: brandId
  }).select('_id');
  
  return categories.map(c => c._id);
}

/**
 * Get subcategories that belong to a specific brand (through category)
 */
async function getSubcategoriesForBrand(brandId, subcategoryIds) {
  const Subcategory = mongoose.model('Subcategory');
  const Category = mongoose.model('Category');
  
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
async function getExtendedForBrand(brandId, extendedIds) {
  const ExtendedSubcategory = mongoose.model('ExtendedSubcategory');
  const Subcategory = mongoose.model('Subcategory');
  const Category = mongoose.model('Category');
  
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
