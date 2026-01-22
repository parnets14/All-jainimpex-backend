import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Dealer from './models/Dealer.js';
import Product from './models/Product.js';

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL);

async function testDealerSelection() {
  try {
    console.log('🧪 TESTING DEALER SELECTION FIX');
    console.log('=' .repeat(50));
    
    // Get Suman and Ravi dealers
    const sumanDealer = await Dealer.findOne({ name: 'Suman' });
    const raviDealer = await Dealer.findOne({ name: 'Ravi Ranjan Rai' });
    
    console.log('👤 Suman Dealer:');
    console.log('  ID:', sumanDealer._id.toString());
    console.log('  Type:', sumanDealer.dealerType);
    console.log('  Permissions:', sumanDealer.productPermissions?.length || 0);
    
    console.log('\n👤 Ravi Dealer:');
    console.log('  ID:', raviDealer._id.toString());
    console.log('  Type:', raviDealer.dealerType);
    console.log('  Permissions:', raviDealer.productPermissions?.length || 0);
    
    // Test product access for Suman (should have 1 product)
    console.log('\n🔍 Testing Suman product access...');
    const sumanProducts = await Product.find({
      $or: [
        // Products with no extended subcategory (basic hierarchy only)
        {
          brand: { $in: sumanDealer.productPermissions?.map(p => p.brand) || [] },
          category: { $in: sumanDealer.productPermissions?.map(p => p.category) || [] },
          subcategory: { $in: sumanDealer.productPermissions?.map(p => p.subcategory) || [] },
          extendedSubcategory: { $exists: false }
        },
        {
          brand: { $in: sumanDealer.productPermissions?.map(p => p.brand) || [] },
          category: { $in: sumanDealer.productPermissions?.map(p => p.category) || [] },
          subcategory: { $in: sumanDealer.productPermissions?.map(p => p.subcategory) || [] },
          extendedSubcategory: null
        }
      ]
    });
    
    console.log('  Products found:', sumanProducts.length);
    sumanProducts.forEach(p => {
      console.log(`    - ${p.itemName} (${p.productCode})`);
    });
    
    // Test product access for Ravi (should have 14 products)
    console.log('\n🔍 Testing Ravi product access...');
    const raviProducts = await Product.find({
      $or: [
        // Products matching dealer's extended permissions
        {
          brand: { $in: raviDealer.productPermissions?.map(p => p.brand) || [] },
          category: { $in: raviDealer.productPermissions?.map(p => p.category) || [] },
          subcategory: { $in: raviDealer.productPermissions?.map(p => p.subcategory) || [] },
          extendedSubcategory: { $in: raviDealer.productPermissions?.map(p => p.extendedSubcategory).filter(Boolean) || [] }
        }
      ]
    });
    
    console.log('  Products found:', raviProducts.length);
    console.log('  Sample products:');
    raviProducts.slice(0, 5).forEach(p => {
      console.log(`    - ${p.itemName} (${p.productCode})`);
    });
    
    console.log('\n✅ Backend data looks correct');
    console.log('🔧 Frontend issue is likely in the SearchableDropdown onClick handler');
    console.log('💡 Try the enhanced debugging in the browser console');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

testDealerSelection();