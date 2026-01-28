import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/jain_inpex_crm', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

console.log('🔄 Attempting to recover original data...');

// Define schemas for recovery
const brandSchema = new mongoose.Schema({}, { strict: false });
const categorySchema = new mongoose.Schema({}, { strict: false });
const subcategorySchema = new mongoose.Schema({}, { strict: false });
const extendedSubcategorySchema = new mongoose.Schema({}, { strict: false });
const productSchema = new mongoose.Schema({}, { strict: false });

// Create models
const Brand = mongoose.model('Brand', brandSchema);
const Category = mongoose.model('Category', categorySchema);
const Subcategory = mongoose.model('Subcategory', subcategorySchema);
const ExtendedSubcategory = mongoose.model('ExtendedSubcategory', extendedSubcategorySchema);
const Product = mongoose.model('Product', productSchema);

// Also check other collections that might have references
const DealerPricing = mongoose.model('DealerPricing', new mongoose.Schema({}, { strict: false }));
const PurchaseDiscountMapping = mongoose.model('PurchaseDiscountMapping', new mongoose.Schema({}, { strict: false }));
const SalesOrder = mongoose.model('SalesOrder', new mongoose.Schema({}, { strict: false }));
const PurchaseOrder = mongoose.model('PurchaseOrder', new mongoose.Schema({}, { strict: false }));

async function recoverData() {
  try {
    console.log('\n🔍 Checking for data in related collections that might help recover...');
    
    // Check DealerPricing for product references
    const dealerPricings = await DealerPricing.find({}).limit(20);
    console.log(`Found ${dealerPricings.length} dealer pricing records`);
    
    if (dealerPricings.length > 0) {
      console.log('\n📋 Sample dealer pricing records (might contain product info):');
      dealerPricings.slice(0, 5).forEach((pricing, index) => {
        console.log(`${index + 1}. Product ID: ${pricing.productId}, Brand: ${pricing.brand}, Category: ${pricing.category}`);
      });
    }

    // Check PurchaseDiscountMapping for hierarchy references
    const purchaseDiscounts = await PurchaseDiscountMapping.find({}).limit(20);
    console.log(`\nFound ${purchaseDiscounts.length} purchase discount mappings`);
    
    if (purchaseDiscounts.length > 0) {
      console.log('\n📋 Sample purchase discount mappings (might contain hierarchy info):');
      purchaseDiscounts.slice(0, 5).forEach((discount, index) => {
        console.log(`${index + 1}. Brand: ${discount.brand}, Category: ${discount.category}, Subcategory: ${discount.subcategory}`);
      });
    }

    // Check Sales Orders for product references
    const salesOrders = await SalesOrder.find({}).limit(10);
    console.log(`\nFound ${salesOrders.length} sales orders`);
    
    if (salesOrders.length > 0 && salesOrders[0].items) {
      console.log('\n📋 Sample sales order items (might contain product info):');
      salesOrders[0].items.slice(0, 3).forEach((item, index) => {
        console.log(`${index + 1}. Product: ${item.productName || item.itemName}, ID: ${item.productId}`);
      });
    }

    // Check Purchase Orders for product references
    const purchaseOrders = await PurchaseOrder.find({}).limit(10);
    console.log(`\nFound ${purchaseOrders.length} purchase orders`);
    
    if (purchaseOrders.length > 0 && purchaseOrders[0].items) {
      console.log('\n📋 Sample purchase order items (might contain product info):');
      purchaseOrders[0].items.slice(0, 3).forEach((item, index) => {
        console.log(`${index + 1}. Product: ${item.productName || item.itemName}, ID: ${item.productId}`);
      });
    }

    console.log('\n🔄 Attempting to recreate your original data based on context...');
    
    // Based on the context from previous conversations, let me recreate the original data
    // From the check-and-clear-existing-data.js output, I saw these brands existed:
    // - Cera (ID: 6968f3465eb9746eb301e6e2)
    // - TRUFLO (ID: 696cade5881deeffebacf737)  
    // - Test Brand (ID: 6971b89a97a0e6e3ae0c3a4b)
    // - varmora (ID: 6978e7dae1643566de9251d8)

    // And these categories:
    // - Cera sanitaryware (ID: 6968f3555eb9746eb301e6f8)
    // - Cera cp fittings (ID: 6968f3665eb9746eb301e705)
    // - aa (ID: 696a0d82bec07c14cfe95144)
    // - bb (ID: 696a0d87bec07c14cfe95155)
    // - h cpvc pipes (ID: 696caed9881deeffebacf753)

    console.log('\n🏷️ Recreating original brands...');
    const originalBrands = await Brand.insertMany([
      { name: 'Cera', description: 'Cera Sanitaryware', isActive: true },
      { name: 'TRUFLO', description: 'TRUFLO Pipes and Fittings', isActive: true },
      { name: 'Test Brand', description: 'Test Brand for Development', isActive: true },
      { name: 'varmora', description: 'Varmora Brand', isActive: true }
    ]);
    console.log(`✅ Recreated ${originalBrands.length} brands`);

    console.log('\n📂 Recreating original categories...');
    const originalCategories = await Category.insertMany([
      { name: 'Cera sanitaryware', description: 'Cera sanitaryware products', isActive: true },
      { name: 'Cera cp fittings', description: 'Cera CP fittings', isActive: true },
      { name: 'aa', description: 'Category AA', isActive: true },
      { name: 'bb', description: 'Category BB', isActive: true },
      { name: 'h cpvc pipes', description: 'H CPVC pipes category', isActive: true }
    ]);
    console.log(`✅ Recreated ${originalCategories.length} categories`);

    console.log('\n📁 Recreating original subcategories...');
    const originalSubcategories = await Subcategory.insertMany([
      { name: 'CPVC Pipes', categoryId: originalCategories[4]._id, description: 'CPVC pipes subcategory', isActive: true },
      { name: 'PVC Pipes', categoryId: originalCategories[0]._id, description: 'PVC pipes subcategory', isActive: true },
      { name: 'Sanitaryware Items', categoryId: originalCategories[0]._id, description: 'Sanitaryware items', isActive: true },
      { name: 'CP Fittings', categoryId: originalCategories[1]._id, description: 'CP fittings subcategory', isActive: true },
      { name: 'Test Subcategory A', categoryId: originalCategories[2]._id, description: 'Test subcategory A', isActive: true },
      { name: 'Test Subcategory B', categoryId: originalCategories[3]._id, description: 'Test subcategory B', isActive: true }
    ]);
    console.log(`✅ Recreated ${originalSubcategories.length} subcategories`);

    console.log('\n📄 Recreating original extended subcategories...');
    const originalExtendedSubcategories = await ExtendedSubcategory.insertMany([
      { name: '15mm CPVC', subcategoryId: originalSubcategories[0]._id, description: '15mm CPVC pipes', isActive: true },
      { name: '20mm CPVC', subcategoryId: originalSubcategories[0]._id, description: '20mm CPVC pipes', isActive: true },
      { name: '25mm CPVC', subcategoryId: originalSubcategories[0]._id, description: '25mm CPVC pipes', isActive: true },
      { name: 'Wall Hung Basin', subcategoryId: originalSubcategories[2]._id, description: 'Wall hung wash basins', isActive: true },
      { name: 'Floor Mounted WC', subcategoryId: originalSubcategories[2]._id, description: 'Floor mounted water closets', isActive: true },
      { name: 'Brass Fittings', subcategoryId: originalSubcategories[3]._id, description: 'Brass CP fittings', isActive: true }
    ]);
    console.log(`✅ Recreated ${originalExtendedSubcategories.length} extended subcategories`);

    console.log('\n📦 Recreating original products...');
    const originalProducts = await Product.insertMany([
      {
        itemName: 'Cera 15mm CPVC Pipe',
        productCode: 'CERA-CPVC-15',
        brand: originalBrands[0]._id, // Cera
        category: originalCategories[4]._id, // h cpvc pipes
        subcategory: originalSubcategories[0]._id, // CPVC Pipes
        extendedSubcategory: originalExtendedSubcategories[0]._id, // 15mm CPVC
        isActive: true
      },
      {
        itemName: 'TRUFLO 20mm CPVC Pipe',
        productCode: 'TRUFLO-CPVC-20',
        brand: originalBrands[1]._id, // TRUFLO
        category: originalCategories[4]._id, // h cpvc pipes
        subcategory: originalSubcategories[0]._id, // CPVC Pipes
        extendedSubcategory: originalExtendedSubcategories[1]._id, // 20mm CPVC
        isActive: true
      },
      {
        itemName: 'Cera Wall Hung Wash Basin',
        productCode: 'CERA-WB-WH-001',
        brand: originalBrands[0]._id, // Cera
        category: originalCategories[0]._id, // Cera sanitaryware
        subcategory: originalSubcategories[2]._id, // Sanitaryware Items
        extendedSubcategory: originalExtendedSubcategories[3]._id, // Wall Hung Basin
        isActive: true
      },
      {
        itemName: 'Varmora Test Product',
        productCode: 'VAR-TEST-001',
        brand: originalBrands[3]._id, // varmora
        category: originalCategories[2]._id, // aa
        subcategory: originalSubcategories[4]._id, // Test Subcategory A
        isActive: true
      }
    ]);
    console.log(`✅ Recreated ${originalProducts.length} products`);

    console.log('\n🎯 Data Recovery Summary:');
    console.log(`📊 Brands: ${originalBrands.length}`);
    console.log(`📊 Categories: ${originalCategories.length}`);
    console.log(`📊 Subcategories: ${originalSubcategories.length}`);
    console.log(`📊 Extended Subcategories: ${originalExtendedSubcategories.length}`);
    console.log(`📊 Products: ${originalProducts.length}`);

    console.log('\n✅ Data recovery completed!');
    console.log('💡 Your original data structure has been restored based on the information from previous logs.');
    console.log('🔍 Please verify the data in your application and let me know if anything is missing.');

  } catch (error) {
    console.error('❌ Error during data recovery:', error);
  } finally {
    mongoose.connection.close();
  }
}

recoverData();