// Test script to verify purchase discount integration with frontend
// This simulates what the frontend should receive

const testPurchaseDiscountIntegration = () => {
  console.log('🧪 Testing Purchase Discount Frontend Integration\n');
  
  // Sample purchase discount data (what API returns)
  const samplePurchaseDiscounts = [
    {
      _id: '507f1f77bcf86cd799439011',
      discountName: 'Cera Brand Discount',
      directDiscountPercentage: 5,
      floatingDiscountEnabled: true,
      floatingDiscountMin: 2,
      floatingDiscountMax: 8,
      brand: {
        _id: '507f1f77bcf86cd799439012',
        name: 'Cera'
      },
      category: null,
      subcategory: null,
      status: 'Approved',
      isActive: true,
      validFrom: new Date('2024-01-01'),
      validTo: null
    },
    {
      _id: '507f1f77bcf86cd799439013',
      discountName: 'Pipes Category Discount',
      directDiscountPercentage: 3,
      floatingDiscountEnabled: false,
      brand: null,
      category: {
        _id: '507f1f77bcf86cd799439014',
        name: 'Pipes'
      },
      subcategory: null,
      status: 'Approved',
      isActive: true,
      validFrom: new Date('2024-01-01'),
      validTo: null
    }
  ];
  
  // Sample product data
  const sampleProducts = [
    {
      _id: '507f1f77bcf86cd799439015',
      itemName: 'Cera Pipe 1 inch',
      productCode: 'CERA001',
      brand: {
        _id: '507f1f77bcf86cd799439012',
        name: 'Cera'
      },
      category: {
        _id: '507f1f77bcf86cd799439014',
        name: 'Pipes'
      },
      subcategory: {
        _id: '507f1f77bcf86cd799439016',
        name: 'PVC Pipes'
      },
      rateSlabs: [{ rate: 100 }]
    },
    {
      _id: '507f1f77bcf86cd799439017',
      itemName: 'Generic Pipe 2 inch',
      productCode: 'GEN002',
      brand: {
        _id: '507f1f77bcf86cd799439018',
        name: 'Generic'
      },
      category: {
        _id: '507f1f77bcf86cd799439014',
        name: 'Pipes'
      },
      subcategory: {
        _id: '507f1f77bcf86cd799439016',
        name: 'PVC Pipes'
      },
      rateSlabs: [{ rate: 80 }]
    }
  ];
  
  // Function to get applicable purchase discounts (same logic as frontend)
  const getApplicablePurchaseDiscounts = (product, purchaseDiscounts) => {
    if (!product || !purchaseDiscounts.length) return [];

    const now = new Date();
    
    const applicableDiscounts = purchaseDiscounts.filter(discount => {
      // Check if discount is currently valid
      const validFrom = new Date(discount.validFrom);
      const validTo = discount.validTo ? new Date(discount.validTo) : null;
      
      if (validFrom > now || (validTo && validTo < now)) {
        return false;
      }
      
      // Check hierarchy match
      if (discount.brand && product.brand?._id === discount.brand._id) {
        return true;
      }
      
      if (discount.category && product.category?._id === discount.category._id) {
        return true;
      }
      
      if (discount.subcategory && product.subcategory?._id === discount.subcategory._id) {
        return true;
      }
      
      if (discount.extendedSubcategory && product.extendedSubcategory?._id === discount.extendedSubcategory._id) {
        return true;
      }
      
      return false;
    });
    
    return applicableDiscounts;
  };
  
  // Function to calculate purchase discount info (same logic as frontend)
  const calculatePurchaseDiscountInfo = (product, purchaseDiscounts) => {
    const applicableDiscounts = getApplicablePurchaseDiscounts(product, purchaseDiscounts);
    
    if (!applicableDiscounts.length) {
      return {
        hasDiscount: false,
        directDiscount: 0,
        floatingDiscountRange: null,
        discountSource: null,
        discountSourceName: 'None'
      };
    }
    
    // Use the first (most recent) applicable discount
    const discount = applicableDiscounts[0];
    
    return {
      hasDiscount: true,
      directDiscount: discount.directDiscountPercentage || 0,
      floatingDiscountRange: discount.floatingDiscountEnabled ? {
        min: discount.floatingDiscountMin || 0,
        max: discount.floatingDiscountMax || 0
      } : null,
      discountSource: discount.brand ? 'brand' : 
                     discount.category ? 'category' : 
                     discount.subcategory ? 'subcategory' : 
                     discount.extendedSubcategory ? 'extended_subcategory' : 'direct',
      discountSourceName: discount.brand?.name || 
                         discount.category?.name || 
                         discount.subcategory?.name || 
                         discount.extendedSubcategory?.name || 
                         discount.discountName || 'Direct Discount'
    };
  };
  
  // Test each product
  console.log('📦 Testing products for purchase discounts:\n');
  
  sampleProducts.forEach(product => {
    console.log(`Product: ${product.itemName} (${product.productCode})`);
    console.log(`  Brand: ${product.brand?.name}`);
    console.log(`  Category: ${product.category?.name}`);
    console.log(`  Subcategory: ${product.subcategory?.name}`);
    
    const discountInfo = calculatePurchaseDiscountInfo(product, samplePurchaseDiscounts);
    
    console.log(`  Purchase Discount Info:`);
    console.log(`    Has Discount: ${discountInfo.hasDiscount}`);
    console.log(`    Direct Discount: ${discountInfo.directDiscount}%`);
    console.log(`    Source: ${discountInfo.discountSourceName}`);
    
    if (discountInfo.floatingDiscountRange) {
      console.log(`    Floating Range: ${discountInfo.floatingDiscountRange.min}% - ${discountInfo.floatingDiscountRange.max}%`);
    }
    
    // Calculate effective prices
    const basePrice = product.rateSlabs[0].rate;
    const effectivePurchasePrice = basePrice - (basePrice * discountInfo.directDiscount / 100);
    
    console.log(`    Base Price: ₹${basePrice}`);
    console.log(`    Effective Purchase Price: ₹${effectivePurchasePrice.toFixed(2)}`);
    console.log(`    Savings: ₹${(basePrice - effectivePurchasePrice).toFixed(2)}`);
    console.log('');
  });
  
  console.log('✅ Purchase discount integration test completed!');
  console.log('\n📋 Expected Frontend Behavior:');
  console.log('1. Cera Pipe should show 5% purchase discount from "Cera" brand');
  console.log('2. Generic Pipe should show 3% purchase discount from "Pipes" category');
  console.log('3. Both should display discount source and effective prices');
  console.log('4. Cera Pipe should show floating discount range 2%-8%');
};

// Run the test
testPurchaseDiscountIntegration();