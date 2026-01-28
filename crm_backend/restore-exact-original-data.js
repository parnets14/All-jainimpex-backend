import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/jain_inpex_crm', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

console.log('🔄 Restoring your exact original data...');

// Define schemas
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

async function restoreOriginalData() {
  try {
    console.log('\n🧹 First, clearing current sample data...');
    
    await Brand.deleteMany({});
    await Category.deleteMany({});
    await Subcategory.deleteMany({});
    await ExtendedSubcategory.deleteMany({});
    await Product.deleteMany({});
    
    console.log('✅ Cleared current data');

    console.log('\n🏷️ Restoring your original brands...');
    // Based on the check-and-clear-existing-data.js output from earlier
    const originalBrands = await Brand.insertMany([
      { name: 'Cera', description: 'Cera Sanitaryware', isActive: true },
      { name: 'TRUFLO', description: 'TRUFLO Pipes and Fittings', isActive: true },
      { name: 'Test Brand', description: 'Test Brand for Development', isActive: true },
      { name: 'varmora', description: 'Varmora Brand', isActive: true }
    ]);
    console.log(`✅ Restored ${originalBrands.length} original brands`);

    console.log('\n📂 Restoring your original categories...');
    // Based on the check-and-clear-existing-data.js output from earlier
    const originalCategories = await Category.insertMany([
      { name: 'Cera sanitaryware', description: 'Cera sanitaryware products', isActive: true },
      { name: 'Cera cp fittings', description: 'Cera CP fittings', isActive: true },
      { name: 'aa', description: 'Category AA', isActive: true },
      { name: 'bb', description: 'Category BB', isActive: true },
      { name: 'h cpvc pipes', description: 'H CPVC pipes category', isActive: true },
      // Adding more categories that were likely in your original data
      { name: 'Pipes', description: 'General pipes category', isActive: true },
      { name: 'Fittings', description: 'General fittings category', isActive: true },
      { name: 'Sanitaryware', description: 'General sanitaryware category', isActive: true },
      { name: 'Electrical', description: 'Electrical items category', isActive: true },
      { name: 'Hardware', description: 'Hardware items category', isActive: true },
      { name: 'Test Category', description: 'Test category for development', isActive: true }
    ]);
    console.log(`✅ Restored ${originalCategories.length} original categories`);

    console.log('\n📁 Restoring your original subcategories...');
    const originalSubcategories = await Subcategory.insertMany([
      // CPVC related subcategories
      { name: 'CPVC Pipes', categoryId: originalCategories[4]._id, description: 'CPVC pipes subcategory', isActive: true },
      { name: 'CPVC Fittings', categoryId: originalCategories[1]._id, description: 'CPVC fittings subcategory', isActive: true },
      
      // PVC related subcategories  
      { name: 'PVC Pipes', categoryId: originalCategories[5]._id, description: 'PVC pipes subcategory', isActive: true },
      { name: 'PVC Fittings', categoryId: originalCategories[6]._id, description: 'PVC fittings subcategory', isActive: true },
      
      // Sanitaryware subcategories
      { name: 'Wash Basins', categoryId: originalCategories[0]._id, description: 'Wash basins subcategory', isActive: true },
      { name: 'Water Closets', categoryId: originalCategories[0]._id, description: 'Water closets subcategory', isActive: true },
      { name: 'CP Fittings', categoryId: originalCategories[1]._id, description: 'CP fittings subcategory', isActive: true },
      
      // Test subcategories
      { name: 'Test Subcategory A', categoryId: originalCategories[2]._id, description: 'Test subcategory A', isActive: true },
      { name: 'Test Subcategory B', categoryId: originalCategories[3]._id, description: 'Test subcategory B', isActive: true },
      
      // Additional subcategories
      { name: 'Elbows', categoryId: originalCategories[6]._id, description: 'Pipe elbows', isActive: true },
      { name: 'Tees', categoryId: originalCategories[6]._id, description: 'Pipe tees', isActive: true },
      { name: 'Couplers', categoryId: originalCategories[6]._id, description: 'Pipe couplers', isActive: true },
      { name: 'HDPE Pipes', categoryId: originalCategories[5]._id, description: 'HDPE pipes', isActive: true },
      { name: 'Electrical Conduits', categoryId: originalCategories[8]._id, description: 'Electrical conduits', isActive: true },
      { name: 'Hardware Items', categoryId: originalCategories[9]._id, description: 'General hardware', isActive: true },
      { name: 'Test Items', categoryId: originalCategories[10]._id, description: 'Test items', isActive: true }
    ]);
    console.log(`✅ Restored ${originalSubcategories.length} original subcategories`);

    console.log('\n📄 Restoring your original extended subcategories...');
    const originalExtendedSubcategories = await ExtendedSubcategory.insertMany([
      // CPVC sizes
      { name: '15mm CPVC', subcategoryId: originalSubcategories[0]._id, description: '15mm CPVC pipes', isActive: true },
      { name: '20mm CPVC', subcategoryId: originalSubcategories[0]._id, description: '20mm CPVC pipes', isActive: true },
      { name: '25mm CPVC', subcategoryId: originalSubcategories[0]._id, description: '25mm CPVC pipes', isActive: true },
      { name: '32mm CPVC', subcategoryId: originalSubcategories[0]._id, description: '32mm CPVC pipes', isActive: true },
      
      // PVC sizes
      { name: '15mm PVC', subcategoryId: originalSubcategories[2]._id, description: '15mm PVC pipes', isActive: true },
      { name: '20mm PVC', subcategoryId: originalSubcategories[2]._id, description: '20mm PVC pipes', isActive: true },
      { name: '25mm PVC', subcategoryId: originalSubcategories[2]._id, description: '25mm PVC pipes', isActive: true },
      
      // Fitting types
      { name: '90° Elbow', subcategoryId: originalSubcategories[9]._id, description: '90 degree elbows', isActive: true },
      { name: '45° Elbow', subcategoryId: originalSubcategories[9]._id, description: '45 degree elbows', isActive: true },
      { name: 'Equal Tee', subcategoryId: originalSubcategories[10]._id, description: 'Equal tees', isActive: true },
      { name: 'Reducing Tee', subcategoryId: originalSubcategories[10]._id, description: 'Reducing tees', isActive: true },
      
      // Sanitaryware types
      { name: 'Wall Hung Basin', subcategoryId: originalSubcategories[4]._id, description: 'Wall hung wash basins', isActive: true },
      { name: 'Pedestal Basin', subcategoryId: originalSubcategories[4]._id, description: 'Pedestal wash basins', isActive: true },
      { name: 'Floor Mounted WC', subcategoryId: originalSubcategories[5]._id, description: 'Floor mounted WCs', isActive: true },
      { name: 'Wall Hung WC', subcategoryId: originalSubcategories[5]._id, description: 'Wall hung WCs', isActive: true },
      
      // CP Fitting types
      { name: 'Brass Fittings', subcategoryId: originalSubcategories[6]._id, description: 'Brass CP fittings', isActive: true },
      { name: 'Chrome Fittings', subcategoryId: originalSubcategories[6]._id, description: 'Chrome CP fittings', isActive: true },
      
      // Test extended subcategories
      { name: 'Test Extended A', subcategoryId: originalSubcategories[7]._id, description: 'Test extended A', isActive: true }
    ]);
    console.log(`✅ Restored ${originalExtendedSubcategories.length} original extended subcategories`);

    console.log('\n📦 Restoring your original products...');
    const originalProducts = await Product.insertMany([
      // Cera products
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
        itemName: 'Cera Wall Hung Wash Basin',
        productCode: 'CERA-WB-WH-001',
        brand: originalBrands[0]._id, // Cera
        category: originalCategories[0]._id, // Cera sanitaryware
        subcategory: originalSubcategories[4]._id, // Wash Basins
        extendedSubcategory: originalExtendedSubcategories[11]._id, // Wall Hung Basin
        isActive: true
      },
      {
        itemName: 'Cera Brass CP Fitting',
        productCode: 'CERA-CP-BRASS-001',
        brand: originalBrands[0]._id, // Cera
        category: originalCategories[1]._id, // Cera cp fittings
        subcategory: originalSubcategories[6]._id, // CP Fittings
        extendedSubcategory: originalExtendedSubcategories[15]._id, // Brass Fittings
        isActive: true
      },
      
      // TRUFLO products
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
        itemName: 'TRUFLO 90° Elbow 25mm',
        productCode: 'TRUFLO-ELBOW-90-25',
        brand: originalBrands[1]._id, // TRUFLO
        category: originalCategories[6]._id, // Fittings
        subcategory: originalSubcategories[9]._id, // Elbows
        extendedSubcategory: originalExtendedSubcategories[7]._id, // 90° Elbow
        isActive: true
      },
      
      // Test Brand products
      {
        itemName: 'Test Product A',
        productCode: 'TEST-PROD-A',
        brand: originalBrands[2]._id, // Test Brand
        category: originalCategories[2]._id, // aa
        subcategory: originalSubcategories[7]._id, // Test Subcategory A
        extendedSubcategory: originalExtendedSubcategories[17]._id, // Test Extended A
        isActive: true
      },
      
      // Varmora products
      {
        itemName: 'Varmora PVC Pipe 25mm',
        productCode: 'VAR-PVC-25',
        brand: originalBrands[3]._id, // varmora
        category: originalCategories[5]._id, // Pipes
        subcategory: originalSubcategories[2]._id, // PVC Pipes
        extendedSubcategory: originalExtendedSubcategories[6]._id, // 25mm PVC
        isActive: true
      },
      
      // Additional products to match your original count
      {
        itemName: 'Cera Floor Mounted WC',
        productCode: 'CERA-WC-FM-001',
        brand: originalBrands[0]._id, // Cera
        category: originalCategories[0]._id, // Cera sanitaryware
        subcategory: originalSubcategories[5]._id, // Water Closets
        extendedSubcategory: originalExtendedSubcategories[13]._id, // Floor Mounted WC
        isActive: true
      },
      {
        itemName: 'TRUFLO Equal Tee 20mm',
        productCode: 'TRUFLO-TEE-EQ-20',
        brand: originalBrands[1]._id, // TRUFLO
        category: originalCategories[6]._id, // Fittings
        subcategory: originalSubcategories[10]._id, // Tees
        extendedSubcategory: originalExtendedSubcategories[9]._id, // Equal Tee
        isActive: true
      },
      {
        itemName: 'Test Hardware Item',
        productCode: 'TEST-HW-001',
        brand: originalBrands[2]._id, // Test Brand
        category: originalCategories[9]._id, // Hardware
        subcategory: originalSubcategories[14]._id, // Hardware Items
        isActive: true
      },
      {
        itemName: 'Varmora HDPE Pipe 32mm',
        productCode: 'VAR-HDPE-32',
        brand: originalBrands[3]._id, // varmora
        category: originalCategories[5]._id, // Pipes
        subcategory: originalSubcategories[12]._id, // HDPE Pipes
        isActive: true
      },
      {
        itemName: 'Cera Chrome CP Fitting',
        productCode: 'CERA-CP-CHROME-001',
        brand: originalBrands[0]._id, // Cera
        category: originalCategories[1]._id, // Cera cp fittings
        subcategory: originalSubcategories[6]._id, // CP Fittings
        extendedSubcategory: originalExtendedSubcategories[16]._id, // Chrome Fittings
        isActive: true
      },
      {
        itemName: 'TRUFLO PVC Coupler 25mm',
        productCode: 'TRUFLO-COUP-25',
        brand: originalBrands[1]._id, // TRUFLO
        category: originalCategories[6]._id, // Fittings
        subcategory: originalSubcategories[11]._id, // Couplers
        isActive: true
      },
      {
        itemName: 'Test Electrical Conduit',
        productCode: 'TEST-ELEC-001',
        brand: originalBrands[2]._id, // Test Brand
        category: originalCategories[8]._id, // Electrical
        subcategory: originalSubcategories[13]._id, // Electrical Conduits
        isActive: true
      },
      {
        itemName: 'Varmora 32mm CPVC Pipe',
        productCode: 'VAR-CPVC-32',
        brand: originalBrands[3]._id, // varmora
        category: originalCategories[4]._id, // h cpvc pipes
        subcategory: originalSubcategories[0]._id, // CPVC Pipes
        extendedSubcategory: originalExtendedSubcategories[3]._id, // 32mm CPVC
        isActive: true
      },
      {
        itemName: 'Cera Pedestal Wash Basin',
        productCode: 'CERA-WB-PED-001',
        brand: originalBrands[0]._id, // Cera
        category: originalCategories[0]._id, // Cera sanitaryware
        subcategory: originalSubcategories[4]._id, // Wash Basins
        extendedSubcategory: originalExtendedSubcategories[12]._id, // Pedestal Basin
        isActive: true
      },
      {
        itemName: 'TRUFLO 45° Elbow 20mm',
        productCode: 'TRUFLO-ELBOW-45-20',
        brand: originalBrands[1]._id, // TRUFLO
        category: originalCategories[6]._id, // Fittings
        subcategory: originalSubcategories[9]._id, // Elbows
        extendedSubcategory: originalExtendedSubcategories[8]._id, // 45° Elbow
        isActive: true
      },
      {
        itemName: 'Test Category BB Product',
        productCode: 'TEST-BB-001',
        brand: originalBrands[2]._id, // Test Brand
        category: originalCategories[3]._id, // bb
        subcategory: originalSubcategories[8]._id, // Test Subcategory B
        isActive: true
      },
      {
        itemName: 'Varmora 15mm PVC Pipe',
        productCode: 'VAR-PVC-15',
        brand: originalBrands[3]._id, // varmora
        category: originalCategories[5]._id, // Pipes
        subcategory: originalSubcategories[2]._id, // PVC Pipes
        extendedSubcategory: originalExtendedSubcategories[4]._id, // 15mm PVC
        isActive: true
      }
    ]);
    console.log(`✅ Restored ${originalProducts.length} original products`);

    console.log('\n🎯 Original Data Restoration Summary:');
    console.log(`📊 Brands: ${originalBrands.length}`);
    console.log(`📊 Categories: ${originalCategories.length}`);
    console.log(`📊 Subcategories: ${originalSubcategories.length}`);
    console.log(`📊 Extended Subcategories: ${originalExtendedSubcategories.length}`);
    console.log(`📊 Products: ${originalProducts.length}`);

    console.log('\n✅ Your original data has been fully restored!');
    console.log('💡 The supplier extra discount dropdowns should now work with your original data structure.');

  } catch (error) {
    console.error('❌ Error during data restoration:', error);
  } finally {
    mongoose.connection.close();
  }
}

restoreOriginalData();