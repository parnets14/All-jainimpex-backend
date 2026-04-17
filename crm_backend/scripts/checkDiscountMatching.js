import mongoose from 'mongoose';

async function checkDiscounts() {
  try {
    await mongoose.connect('mongodb+srv://JainimpexCRM:JainImpexCRM@jainimpexcrm.gyffsox.mongodb.net/shreejain_crm');
    
    const DiscountMapping = mongoose.connection.collection('discountmappings');
    const Product = mongoose.connection.collection('products');
    
    console.log('📊 Checking discount mappings...');
    const discounts = await DiscountMapping.find({ mappingType: 'sales', status: 'Approved', isActive: true }).toArray();
    console.log(`Found ${discounts.length} active sales discounts`);
    
    for (const discount of discounts) {
      console.log(`\n🎯 Discount: ${discount.discountName}`);
      console.log(`   Target Type: ${discount.targetType}`);
      console.log(`   Direct Discount: ${discount.directDiscountPercentage}%`);
      console.log(`   Valid: ${discount.validFrom} to ${discount.validTo}`);
      console.log(`   Brand: ${discount.brand}`);
      console.log(`   Category: ${discount.category}`);
      console.log(`   Subcategory: ${discount.subcategory}`);
    }
    
    console.log('\n📦 Checking products...');
    const products = await Product.find({}).toArray();
    console.log(`Found ${products.length} products`);
    
    for (const product of products) {
      console.log(`\n📦 Product: ${product.itemName} (${product.productCode})`);
      console.log(`   Brand: ${product.brand}`);
      console.log(`   Category: ${product.category}`);
      console.log(`   Subcategory: ${product.subcategory}`);
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkDiscounts();
