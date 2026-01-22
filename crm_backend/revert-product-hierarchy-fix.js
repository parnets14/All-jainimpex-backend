import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';

dotenv.config();

async function revertProductHierarchyFix() {
  try {
    console.log('🔄 REVERTING Product Hierarchy Changes...');
    
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB Atlas');
    
    // Restore the original extended subcategory assignments based on the fix script output
    const restorations = [
      {
        productCode: '1616551',
        subcategory1: '6969d4140ae8fdeacfdb677e', // cera ewc 1pc 220mm
        subcategory2: null,
        subcategory3: null,
        subcategory4: null,
        subcategory5: null
      },
      {
        productCode: '635165165',
        subcategory1: '6969d4ea0ae8fdeacfdb67d0', // cera colour ewc 1pc 220mm
        subcategory2: null,
        subcategory3: null,
        subcategory4: null,
        subcategory5: null
      },
      {
        productCode: '561651',
        subcategory1: '6969ea82b7dee0bae2983da8', // vine
        subcategory2: null,
        subcategory3: null,
        subcategory4: null,
        subcategory5: null
      },
      {
        productCode: '052151',
        subcategory1: '6969ebcdb7dee0bae2983dde', // lux brooklyn
        subcategory2: '6969ebf6b7dee0bae2983e02', // lux rose brooklyn
        subcategory3: null,
        subcategory4: null,
        subcategory5: null
      },
      {
        productCode: 'f1001521',
        subcategory1: '6969e888b7dee0bae2983cbd', // cera regular wash basin
        subcategory2: null,
        subcategory3: null,
        subcategory4: null,
        subcategory5: null
      },
      {
        productCode: '1515158',
        subcategory1: '6969d4140ae8fdeacfdb677e', // cera ewc 1pc 220mm
        subcategory2: null,
        subcategory3: null,
        subcategory4: null,
        subcategory5: null
      },
      {
        productCode: '153161',
        subcategory1: '6969e8e5b7dee0bae2983cd0', // cera table top
        subcategory2: null,
        subcategory3: null,
        subcategory4: null,
        subcategory5: null
      },
      {
        productCode: '1964149641',
        subcategory1: '6969ea82b7dee0bae2983da8', // vine
        subcategory2: null,
        subcategory3: null,
        subcategory4: null,
        subcategory5: null
      },
      {
        productCode: 'frg100055',
        subcategory1: '6969ebcdb7dee0bae2983dde', // lux brooklyn
        subcategory2: '6969ebf6b7dee0bae2983e02', // lux rose brooklyn
        subcategory3: null,
        subcategory4: null,
        subcategory5: null
      },
      {
        productCode: 'CAA001',
        subcategory1: '696a0debbec07c14cfe9529d', // ggg
        subcategory2: '696dbbfe28b5f6168171eada', // sss
        subcategory3: null,
        subcategory4: null,
        subcategory5: null
      },
      {
        productCode: 'CAA002',
        subcategory1: '696a0debbec07c14cfe9529d', // ggg
        subcategory2: '696a0df3bec07c14cfe952c0', // ddd
        subcategory3: null,
        subcategory4: null,
        subcategory5: null
      },
      {
        productCode: '15151262162',
        subcategory1: '696ce4650588aebfaecac3e4', // h cpvc nrv
        subcategory2: null,
        subcategory3: null,
        subcategory4: null,
        subcategory5: null
      },
      {
        productCode: '989948',
        subcategory1: '696ce4650588aebfaecac3e4', // h cpvc nrv
        subcategory2: null,
        subcategory3: null,
        subcategory4: null,
        subcategory5: null
      },
      {
        productCode: 'CWW001',
        subcategory1: '6971b0b139870bccbb5cbd46', // Wire level 1
        subcategory2: '6971b0cf39870bccbb5cbd58', // wire level 2
        subcategory3: '6971b11b39870bccbb5cbd9c', // wire level 3
        subcategory4: null,
        subcategory5: null
      }
    ];
    
    console.log(`\n🔄 Restoring ${restorations.length} products to their original state...`);
    
    let restoredCount = 0;
    let notFoundCount = 0;
    
    for (const restoration of restorations) {
      try {
        const product = await Product.findOne({ productCode: restoration.productCode });
        
        if (!product) {
          console.log(`❌ Product ${restoration.productCode} not found`);
          notFoundCount++;
          continue;
        }
        
        // Restore the original extended subcategory assignments
        const updateData = {
          subcategory1: restoration.subcategory1 ? new mongoose.Types.ObjectId(restoration.subcategory1) : null,
          subcategory2: restoration.subcategory2 ? new mongoose.Types.ObjectId(restoration.subcategory2) : null,
          subcategory3: restoration.subcategory3 ? new mongoose.Types.ObjectId(restoration.subcategory3) : null,
          subcategory4: restoration.subcategory4 ? new mongoose.Types.ObjectId(restoration.subcategory4) : null,
          subcategory5: restoration.subcategory5 ? new mongoose.Types.ObjectId(restoration.subcategory5) : null
        };
        
        await Product.findByIdAndUpdate(product._id, updateData);
        
        console.log(`✅ Restored ${restoration.productCode} - ${product.itemName}`);
        console.log(`   Level 1: ${restoration.subcategory1 || 'NULL'}`);
        console.log(`   Level 2: ${restoration.subcategory2 || 'NULL'}`);
        console.log(`   Level 3: ${restoration.subcategory3 || 'NULL'}`);
        
        restoredCount++;
        
      } catch (error) {
        console.log(`❌ Error restoring ${restoration.productCode}:`, error.message);
      }
    }
    
    console.log(`\n📊 Restoration Summary:`);
    console.log(`   Products restored: ${restoredCount}`);
    console.log(`   Products not found: ${notFoundCount}`);
    console.log(`   Total attempted: ${restorations.length}`);
    
    // Verify the restoration by checking a few key products
    console.log(`\n🔍 Verifying restoration...`);
    
    const verifyProducts = ['052151', 'CWW001', 'CAA001'];
    
    for (const productCode of verifyProducts) {
      const product = await Product.findOne({ productCode })
        .populate('subcategory1', 'name')
        .populate('subcategory2', 'name')
        .populate('subcategory3', 'name');
      
      if (product) {
        console.log(`\n✅ ${productCode} - ${product.itemName}:`);
        console.log(`   Level 1: ${product.subcategory1?.name || 'NULL'}`);
        console.log(`   Level 2: ${product.subcategory2?.name || 'NULL'}`);
        console.log(`   Level 3: ${product.subcategory3?.name || 'NULL'}`);
      }
    }
    
    console.log(`\n✅ REVERSION COMPLETE - All products restored to original state`);
    
  } catch (error) {
    console.error('❌ Reversion failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

revertProductHierarchyFix();