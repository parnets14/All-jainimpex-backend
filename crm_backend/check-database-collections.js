import mongoose from 'mongoose';

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/jain_inpex_crm');

async function checkDatabaseCollections() {
  try {
    console.log('🔍 Checking database collections...\n');
    
    // Get all collection names
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    console.log(`Found ${collections.length} collections:\n`);
    
    for (const collection of collections) {
      console.log(`📁 Collection: ${collection.name}`);
      
      // Get document count
      const count = await mongoose.connection.db.collection(collection.name).countDocuments();
      console.log(`   - Documents: ${count}`);
      
      // If it's a discount-related collection, show sample documents
      if (collection.name.toLowerCase().includes('discount')) {
        console.log('   🎯 DISCOUNT COLLECTION FOUND!');
        
        const sampleDocs = await mongoose.connection.db.collection(collection.name)
          .find({})
          .limit(3)
          .toArray();
        
        console.log(`   - Sample documents (${sampleDocs.length}):`);
        sampleDocs.forEach((doc, idx) => {
          console.log(`     ${idx + 1}. ${JSON.stringify(doc, null, 2)}`);
        });
      }
      
      console.log('');
    }
    
    // Also check for sales orders that might contain discount data
    console.log('🔍 Checking sales orders for discount data...\n');
    
    const salesOrdersCollection = collections.find(c => c.name.toLowerCase().includes('salesorder') || c.name.toLowerCase().includes('order'));
    
    if (salesOrdersCollection) {
      console.log(`📋 Found sales orders collection: ${salesOrdersCollection.name}`);
      
      const salesOrdersWithDiscounts = await mongoose.connection.db.collection(salesOrdersCollection.name)
        .find({
          $or: [
            { 'products.appliedDiscount': { $exists: true } },
            { 'products.discountPercentage': { $gt: 0 } }
          ]
        })
        .limit(2)
        .toArray();
      
      console.log(`Found ${salesOrdersWithDiscounts.length} sales orders with discount data:`);
      
      salesOrdersWithDiscounts.forEach((order, idx) => {
        console.log(`\n📦 Sales Order ${idx + 1}: ${order.orderNumber || order._id}`);
        console.log(`   - Dealer: ${order.dealerName || 'Unknown'}`);
        console.log(`   - Products with discounts:`);
        
        order.products?.forEach((product, pIdx) => {
          if (product.appliedDiscount || product.discountPercentage > 0) {
            console.log(`     ${pIdx + 1}. ${product.productName}`);
            console.log(`        - Discount %: ${product.discountPercentage}`);
            console.log(`        - Applied Discount:`, product.appliedDiscount);
          }
        });
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the check
checkDatabaseCollections();