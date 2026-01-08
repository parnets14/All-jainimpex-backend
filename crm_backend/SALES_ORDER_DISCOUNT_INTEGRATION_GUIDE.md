# Sales Order Dashboard - Discount Integration Guide

## Overview
This guide shows how to integrate the flexible discount system into SalesOrderDashboard.jsx so that when users add products to sales orders, applicable discounts are automatically detected and applied.

## Integration Points

### 1. When Product is Added to Order
Location: `handleItemChange` function when `field === 'product'`

```javascript
// After product is selected and details are populated
if (field === 'product' && value) {
  const product = products.find(p => p._id === value);
  if (product) {
    updatedItems[index] = {
      ...updatedItems[index],
      productCode: product.productCode,
      productName: product.itemName,
      HSNCode: product.HSNCode,
      gst: product.gst || 0,
      unitPrice: product.rateSlabs?.[0]?.rate || 0,
      category: product.category?._id,
      subcategory: product.subcategory?._id,
      brand: product.brand?._id
    };
    
    // NEW: Check for applicable discounts
    try {
      const dealerType = dealers.find(d => d._id === formData.dealer)?.dealerType;
      const discountResponse = await apiService.getApplicableDiscounts(
        value, // productId
        'sales', // mappingType
        dealerType // optional dealer type filter
      );
      
      if (discountResponse.success && discountResponse.applicableDiscounts.length > 0) {
        const discount = discountResponse.applicableDiscounts[0]; // Highest priority
        
        updatedItems[index].applicableDiscount = discount;
        updatedItems[index].discountType = discount.discountType;
        
        if (discount.discountType === 'direct') {
          // Apply direct discount automatically
          updatedItems[index].discountPercentage = discount.directDiscountPercentage;
          updatedItems[index].selectedDiscountLevel = null;
        } else {
          // Level-based: User must select level
          updatedItems[index].availableLevels = discount.levels;
          updatedItems[index].discountPercentage = 0;
          updatedItems[index].selectedDiscountLevel = null;
        }
      } else {
        // No discount available
        updatedItems[index].applicableDiscount = null;
        updatedItems[index].discountPercentage = 0;
      }
    } catch (error) {
      console.error("Error fetching discounts:", error);
      // Continue without discount
      updatedItems[index].applicableDiscount = null;
      updatedItems[index].discountPercentage = 0;
    }
  }
}
```

### 2. Add Discount Level Selector Column
In the product table, add a new column for level-based discounts:

```javascript
{/* Discount Column - NEW */}
<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
  Discount
</th>

{/* In the table body */}
<td className="px-4 py-3">
  {item.applicableDiscount ? (
    item.discountType === 'direct' ? (
      <div className="text-sm">
        <div className="font-medium text-green-600">
          {item.discountPercentage}% Off
        </div>
        <div className="text-xs text-gray-500">
          Auto-applied
        </div>
      </div>
    ) : (
      <select
        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
        value={item.selectedDiscountLevel || ""}
        onChange={(e) => {
          const levelName = e.target.value;
          const level = item.availableLevels.find(l => l.levelName === levelName);
          handleItemChange(index, 'selectedDiscountLevel', levelName);
          handleItemChange(index, 'discountPercentage', level?.discountPercentage || 0);
        }}
      >
        <option value="">Select Level</option>
        {item.availableLevels?.map((level, idx) => (
          <option key={idx} value={level.levelName}>
            {level.levelName} ({level.discountPercentage}%)
          </option>
        ))}
      </select>
    )
  ) : (
    <span className="text-xs text-gray-400">No discount</span>
  )}
</td>
```

### 3. Update Price Calculation
Modify the price calculation to include discount:

```javascript
const calculateItemTotal = (item) => {
  const baseAmount = item.quantity * item.unitPrice;
  const discountAmount = (baseAmount * (item.discountPercentage || 0)) / 100;
  const amountAfterDiscount = baseAmount - discountAmount;
  const gstAmount = (amountAfterDiscount * item.gst) / 100;
  const total = amountAfterDiscount + gstAmount;
  
  return {
    baseAmount,
    discountAmount,
    amountAfterDiscount,
    gstAmount,
    total
  };
};
```

### 4. Display Discount in Item Row
Show discount information in the product row:

```javascript
{/* Price Column - Updated */}
<td className="px-4 py-3">
  <div className="text-sm">
    {item.discountPercentage > 0 ? (
      <>
        <div className="line-through text-gray-400">
          ₹{(item.quantity * item.unitPrice).toFixed(2)}
        </div>
        <div className="font-medium text-green-600">
          ₹{calculateItemTotal(item).amountAfterDiscount.toFixed(2)}
        </div>
        <div className="text-xs text-gray-500">
          Saved: ₹{calculateItemTotal(item).discountAmount.toFixed(2)}
        </div>
      </>
    ) : (
      <div className="font-medium">
        ₹{(item.quantity * item.unitPrice).toFixed(2)}
      </div>
    )}
  </div>
</td>
```

### 5. Update Order Totals
Include discount in order summary:

```javascript
const calculateOrderTotals = () => {
  let subtotal = 0;
  let totalDiscount = 0;
  let totalGst = 0;
  
  formData.products.forEach(product => {
    const itemCalc = calculateItemTotal(product);
    subtotal += itemCalc.baseAmount;
    totalDiscount += itemCalc.discountAmount;
    totalGst += itemCalc.gstAmount;
  });
  
  const totalAmount = subtotal - totalDiscount + totalGst;
  
  return { subtotal, totalDiscount, totalGst, totalAmount };
};

// In the order summary display
<div className="space-y-2">
  <div className="flex justify-between">
    <span>Subtotal:</span>
    <span>₹{totals.subtotal.toFixed(2)}</span>
  </div>
  {totals.totalDiscount > 0 && (
    <div className="flex justify-between text-green-600">
      <span>Discount:</span>
      <span>-₹{totals.totalDiscount.toFixed(2)}</span>
    </div>
  )}
  <div className="flex justify-between">
    <span>GST:</span>
    <span>₹{totals.totalGst.toFixed(2)}</span>
  </div>
  <div className="flex justify-between font-bold text-lg border-t pt-2">
    <span>Total:</span>
    <span>₹{totals.totalAmount.toFixed(2)}</span>
  </div>
</div>
```

### 6. Save Discount Info with Order
When submitting the order, include discount details:

```javascript
const orderData = {
  ...formData,
  products: formData.products.map(p => ({
    product: p.productId,
    quantity: parseInt(p.quantity),
    unitPrice: parseFloat(p.unitPrice),
    gst: parseFloat(p.gst),
    // NEW: Discount fields
    discountPercentage: p.discountPercentage || 0,
    discountAmount: calculateItemTotal(p).discountAmount,
    appliedDiscount: p.applicableDiscount ? {
      discountId: p.applicableDiscount._id,
      discountName: p.applicableDiscount.discountName,
      discountType: p.applicableDiscount.discountType,
      targetType: p.applicableDiscount.targetType,
      selectedLevel: p.selectedDiscountLevel
    } : null,
    totalPrice: calculateItemTotal(p).total,
    // ... other fields
  }))
};
```

## Testing Checklist
- [ ] Product with category discount shows discount automatically
- [ ] Product with direct discount applies percentage correctly
- [ ] Product with level-based discount shows level selector
- [ ] Selecting different levels updates discount correctly
- [ ] Price calculations include discount properly
- [ ] Order totals show discount breakdown
- [ ] Discount info is saved with order
- [ ] Products without discounts work normally
- [ ] Priority works (product discount overrides category discount)

## Notes
- Discounts are fetched when product is selected
- Direct discounts apply automatically
- Level-based discounts require user selection
- Priority: Product > Brand > Subcategory > Category
- Only one discount applies per product (highest priority)
