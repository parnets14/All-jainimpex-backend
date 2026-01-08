# Discount Management Form - Target Type Implementation Fix

## Problem
Current DealerDiscountManagement.jsx requires ALL three fields (category, subcategory, brand).
This is INCORRECT per client requirements.

## Client Requirement
User should select ONLY ONE target type:
- Category ONLY → discount applies to all products under that category
- Subcategory ONLY → discount applies to all products under that subcategory  
- Brand ONLY → discount applies to all products of that brand
- Product ONLY → discount applies to that specific product

## Required Changes

### 1. Update formData initialization (line ~1280)
```javascript
const [formData, setFormData] = useState({
  mappingType: "sales",
  targetType: "category", // NEW: Add targetType field
  discountName: "", // NEW: Add discount name
  category: "",
  subcategory: "",
  brand: "",
  product: "", // NEW: Add product field
  validFrom: new Date().toISOString().split('T')[0],
  validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  discountType: "direct", // NEW: direct or level_based
  directDiscountPercentage: 0, // NEW: for direct discounts
  levels: [], // For level-based discounts
  remarks: "",
  applicableDealerTypes: [], // NEW: Optional dealer type restrictions
  minOrderAmount: 0, // NEW: Optional minimum order
  minOrderQuantity: 0, // NEW: Optional minimum quantity
});
```

### 2. Add Target Type Selection (after Mapping Type, before Category)
```javascript
{/* Target Type Selection - NEW SECTION */}
<div>
  <label className="block mb-3 text-sm font-medium text-gray-700">
    Apply Discount To *
  </label>
  <div className="grid grid-cols-4 gap-4">
    <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
      <input
        type="radio"
        name="targetType"
        value="category"
        checked={formData.targetType === "category"}
        onChange={(e) => {
          onInputChange("targetType", e.target.value);
          // Clear other fields
          onInputChange("subcategory", "");
          onInputChange("brand", "");
          onInputChange("product", "");
        }}
        className="mr-2"
        disabled={isEditing || loading}
      />
      <div>
        <div className="font-medium">Category</div>
        <div className="text-xs text-gray-500">All products in category</div>
      </div>
    </label>
    
    <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
      <input
        type="radio"
        name="targetType"
        value="subcategory"
        checked={formData.targetType === "subcategory"}
        onChange={(e) => {
          onInputChange("targetType", e.target.value);
          // Clear other fields
          onInputChange("category", "");
          onInputChange("brand", "");
          onInputChange("product", "");
        }}
        className="mr-2"
        disabled={isEditing || loading}
      />
      <div>
        <div className="font-medium">Subcategory</div>
        <div className="text-xs text-gray-500">All products in subcategory</div>
      </div>
    </label>
    
    <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
      <input
        type="radio"
        name="targetType"
        value="brand"
        checked={formData.targetType === "brand"}
        onChange={(e) => {
          onInputChange("targetType", e.target.value);
          // Clear other fields
          onInputChange("category", "");
          onInputChange("subcategory", "");
          onInputChange("product", "");
        }}
        className="mr-2"
        disabled={isEditing || loading}
      />
      <div>
        <div className="font-medium">Brand</div>
        <div className="text-xs text-gray-500">All products of brand</div>
      </div>
    </label>
    
    <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
      <input
        type="radio"
        name="targetType"
        value="product"
        checked={formData.targetType === "product"}
        onChange={(e) => {
          onInputChange("targetType", e.target.value);
          // Clear other fields
          onInputChange("category", "");
          onInputChange("subcategory", "");
          onInputChange("brand", "");
        }}
        className="mr-2"
        disabled={isEditing || loading}
      />
      <div>
        <div className="font-medium">Product</div>
        <div className="text-xs text-gray-500">Specific product only</div>
      </div>
    </label>
  </div>
</div>
```

### 3. Make Dropdowns Conditional (replace existing category/subcategory/brand sections)
```javascript
{/* Show ONLY the relevant dropdown based on targetType */}
{formData.targetType === "category" && (
  <div>
    <label className="block mb-2 text-sm font-medium text-gray-700">
      Select Category *
    </label>
    <SearchableDropdown
      options={categories}
      value={formData.category}
      onChange={(value) => onInputChange("category", value)}
      placeholder="Search categories..."
      searchValue={categorySearch}
      onSearchChange={setCategorySearch}
      showDropdown={showCategoryDropdown}
      setShowDropdown={setShowCategoryDropdown}
      disabled={loading}
    />
  </div>
)}

{formData.targetType === "subcategory" && (
  <div>
    <label className="block mb-2 text-sm font-medium text-gray-700">
      Select Subcategory *
    </label>
    <SearchableDropdown
      options={subcategories}
      value={formData.subcategory}
      onChange={(value) => onInputChange("subcategory", value)}
      placeholder="Search subcategories..."
      searchValue={subcategorySearch}
      onSearchChange={setSubcategorySearch}
      showDropdown={showSubcategoryDropdown}
      setShowDropdown={setShowSubcategoryDropdown}
      disabled={loading}
    />
  </div>
)}

{formData.targetType === "brand" && (
  <div>
    <label className="block mb-2 text-sm font-medium text-gray-700">
      Select Brand *
    </label>
    <SearchableDropdown
      options={brands}
      value={formData.brand}
      onChange={(value) => onInputChange("brand", value)}
      placeholder="Search brands..."
      searchValue={brandSearch}
      onSearchChange={setBrandSearch}
      showDropdown={showBrandDropdown}
      setShowDropdown={setShowBrandDropdown}
      disabled={loading}
    />
  </div>
)}

{formData.targetType === "product" && (
  <div>
    <label className="block mb-2 text-sm font-medium text-gray-700">
      Select Product *
    </label>
    <SearchableDropdown
      options={products}
      value={formData.product}
      onChange={(value) => onInputChange("product", value)}
      placeholder="Search products..."
      searchValue={productSearch}
      onSearchChange={setProductSearch}
      showDropdown={showProductDropdown}
      setShowDropdown={setShowProductDropdown}
      disabled={loading}
    />
  </div>
)}
```

### 4. Update Form Validation (in submit button disabled condition)
```javascript
disabled={
  loading ||
  !formData.discountName ||
  !formData.validFrom ||
  !formData.validTo ||
  // Check that the selected target type has a value
  (formData.targetType === "category" && !formData.category) ||
  (formData.targetType === "subcategory" && !formData.subcategory) ||
  (formData.targetType === "brand" && !formData.brand) ||
  (formData.targetType === "product" && !formData.product) ||
  // Check discount configuration
  (formData.discountType === "direct" && !formData.directDiscountPercentage) ||
  (formData.discountType === "level_based" && formData.levels.length === 0)
}
```

### 5. Update API Call in handleFormSubmit
```javascript
const handleFormSubmit = async () => {
  try {
    setLoading(true);
    
    const submitData = {
      discountName: formData.discountName,
      discountType: formData.discountType,
      mappingType: formData.mappingType,
      targetType: formData.targetType,
      validFrom: formData.validFrom,
      validTo: formData.validTo,
      remarks: formData.remarks,
      applicableDealerTypes: formData.applicableDealerTypes,
      minOrderAmount: formData.minOrderAmount,
      minOrderQuantity: formData.minOrderQuantity,
    };
    
    // Add the target field based on targetType
    if (formData.targetType === "category") {
      submitData.category = formData.category;
    } else if (formData.targetType === "subcategory") {
      submitData.subcategory = formData.subcategory;
    } else if (formData.targetType === "brand") {
      submitData.brand = formData.brand;
    } else if (formData.targetType === "product") {
      submitData.product = formData.product;
    }
    
    // Add discount values
    if (formData.discountType === "direct") {
      submitData.directDiscountPercentage = formData.directDiscountPercentage;
    } else {
      submitData.levels = formData.levels;
    }
    
    const response = isEditing
      ? await apiService.updateDiscountMapping(selectedMapping._id, submitData)
      : await apiService.createDiscountMapping(submitData);
    
    if (response.success) {
      alert(isEditing ? "Discount updated successfully!" : "Discount created successfully!");
      handleFormCancel();
      loadMappings();
    }
  } catch (error) {
    console.error("Error saving discount:", error);
    alert("Error: " + (error.response?.data?.message || error.message));
  } finally {
    setLoading(false);
  }
};
```

## Summary
These changes will transform the form from requiring ALL three fields to allowing selection of ONLY ONE target type, which matches the client's requirements perfectly.
