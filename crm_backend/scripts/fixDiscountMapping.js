import mongoose from 'mongoose';

async function fixDiscount() {
  try {
    await mongoose.connect('mongodb+srv://JainimpexCRM:JainImpexCRM@jainimpexcrm.gyffsox.mongodb.net/shreejain_crm');
    
    const DiscountMapping = mongoose.connection.collection('discountmappings');
    
    console.log('📊 Checking discount mapping...');
    const discount = await DiscountMapping.findOne({ discountName: 'Summer sale' });
    
    console.log('\n🎯 Current Discount Mapping:');
    console.log(JSON.stringify(discount, null, 2));
    
    // The issue: When targetType is 'subcategory', only the subcategory field should be set
    // But the discount has brand and category fields set too, which breaks the matching logic
    
    console.log('\n🔧 Fixing discount mapping...');
    console.log('   Target Type is "subcategory", so we should only keep the subcategory field');
    console.log('   Removing brand and category fields...');
    
    const result = await DiscountMapping.updateOne(
      { _id: discount._id },
      { 
        $unset: { 
          brand: '',
          category: ''
        }
      }
    );
    
    console.log(`✅ Updated ${result.modifiedCount} discount mapping`);
    
    // Verify the fix
    const updatedDiscount = await DiscountMapping.findOne({ discountName: 'Summer sale' });
    console.log('\n✅ Updated Discount Mapping:');
    console.log(`   Target Type: ${updatedDiscount.targetType}`);
    console.log(`   Brand: ${updatedDiscount.brand || 'NOT SET (correct!)'}`);
    console.log(`   Category: ${updatedDiscount.category || 'NOT SET (correct!)'}`);
    console.log(`   Subcategory: ${updatedDiscount.subcategory}`);
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixDiscount();
