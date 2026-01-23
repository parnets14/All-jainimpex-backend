import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Check the actual field names in the purchase discount document
async function checkPurchaseDiscountFields() {
  try {
    console.log('🔍 Checking Purchase Discount Field Names...\n');

    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to database');

    const db = mongoose.connection.db;
    const discountCollection = db.collection('purchasediscountmappings');
    
    // Get the specific discount we fixed
    const discount = await discountCollection.findOne({ _id: new mongoose.Types.ObjectId('697323bd764817c3af4ffd40') });
    
    if (discount) {
      console.log('📋 Purchase Discount Document Structure:');
      console.log(JSON.stringify(discount, null, 2));
      
      console.log('\n🔍 Key Fields:');
      console.log(`directDiscount: ${discount.directDiscount}`);
      console.log(`directDiscountPercentage: ${discount.directDiscountPercentage}`);
      console.log(`floatingDiscountMin: ${discount.floatingDiscountMin}`);
      console.log(`floatingDiscountMax: ${discount.floatingDiscountMax}`);
      console.log(`floatingDiscountEnabled: ${discount.floatingDiscountEnabled}`);
      
    } else {
      console.log('❌ Discount not found');
    }

  } catch (error) {
    console.error('❌ Check failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

checkPurchaseDiscountFields();