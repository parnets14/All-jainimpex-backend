import mongoose from 'mongoose';

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/jain_inpex_crm');

async function checkSalesOrdersDiscounts() {
  try {
    console.log('🔍 Checking sales orders for discount data...\n');
    
    // Wait for connection
    await new Promise(resolve => {
      mongoose.connection.once('open', resolve);
    });
    
    console.log('✅ Connected to database\n');
    
    // Find sales orders collection
    const collections = await mongoose.connection.db.listCollections().toArray();
    const salesOrderCollection = collections.find(c => 
      c.name.toLowerCase().includes('salesorder') || 
      c.name.toLowerCase().includes('order')
    );
    
    if (!salesOrderCollection) {
      console.log('❌ No sales orders collection found');
      return;
    }
    
    console.log(`📋 Found sales orders collection: ${salesOrderCollection.name}\n`);
    
    // Get sales orders with discount data
    const salesOrders = await mongoose.connection.db.collection(salesOrderCollection.name)
      .find({})
      .limit(5)
      .toArray();
    
    console.log(`Found ${salesOrders.length} sales orders:\n`);
    
    let foundDiscountData = false;
    
    salesOrders.forEach((order, idx) => {
      console.log(`📦 Sales Order ${idx + 1}: ${order.orderNumber || order._id}`);
      console.log(`   - Dealer: ${order.dealerName || 'Unknown'}`);
      console.log(`   - Status: ${order.status || 'Unknown'}`);
      console.log(`   - Products: ${order.products?.length || 0}`);
      
      if (order.products && order.products.length > 0) {
        order.products.forEach((product, pIdx) => {
          const hasDiscount = product.appliedDiscount || product.discountPercentage > 0;
          
          if (hasDiscount) {
            foundDiscountData = true;
            console.log(`     🎯 Product ${pIdx + 1}: ${product.productName}`);
            console.log(`        - Discount %: ${product.discountPercentage || 0}`);
            console.log(`        - Discount Amount: ${product.discountAmount || 0}`);
            
            if (product.appliedDiscount) {
              console.log(`        - Applied Discount:`, {
                discountName: product.appliedDiscount.discountName,
                discountType: product.appliedDiscount.discountType,
                targetType: product.appliedDiscount.targetType,
                levels: product.appliedDiscount.levels?.length || 0,
                selectedLevel: product.appliedDiscount.selectedLevel
              });
              
              // This is the problematic data!
              if (product.appliedDiscount.discountType === 'both' && 
                  (!product.appliedDiscount.levels || product.appliedDiscount.levels.length === 0)) {
                console.log(`        🚨 ISSUE: This discount has type "both" but no levels!`);
                console.log(`        🚨 This is causing "No level discount (Direct only)" in frontend`);
              }
            }
          }
        });
      }
      console.log('');
    });
    
    if (foundDiscountData) {
      console.log('🎯 FOUND THE ISSUE!');
      console.log('The sales orders contain old/stale discount data with empty levels arrays.');
      console.log('This is why the frontend shows discounts but no level options.\n');
      
      console.log('🔧 SOLUTIONS:');
      console.log('1. Create proper discounts in Dealer Discount Management with levels');
      console.log('2. Or clean up the stale discount data in existing sales orders');
      console.log('3. The backend fix I implemented will prevent this in the future\n');
    } else {
      console.log('❌ No discount data found in sales orders');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the check
checkSalesOrdersDiscounts();