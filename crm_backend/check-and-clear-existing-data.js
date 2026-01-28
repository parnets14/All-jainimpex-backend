import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/jain_inpex_crm', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

console.log('🔍 Checking existing data in collections...');

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

async function checkAndClearData() {
  try {
    console.log('\n📊 Current data counts:');
    
    const brandCount = await Brand.countDocuments();
    const categoryCount = await Category.countDocuments();
    const subcategoryCount = await Subcategory.countDocuments();
    const extendedSubcategoryCount = await ExtendedSubcategory.countDocuments();
    const productCount = await Product.countDocuments();
    
    console.log(`Brands: ${brandCount}`);
    console.log(`Categories: ${categoryCount}`);
    console.log(`Subcategories: ${subcategoryCount}`);
    console.log(`Extended Subcategories: ${extendedSubcategoryCount}`);
    console.log(`Products: ${productCount}`);

    if (brandCount > 0) {
      console.log('\n📝 Sample existing brands:');
      const sampleBrands = await Brand.find().limit(5);
      sampleBrands.forEach(brand => {
        console.log(`  - ${brand.name} (ID: ${brand._id})`);
      });
    }

    if (categoryCount > 0) {
      console.log('\n📝 Sample existing categories:');
      const sampleCategories = await Category.find().limit(5);
      sampleCategories.forEach(category => {
        console.log(`  - ${category.name} (ID: ${category._id})`);
      });
    }

    // Clear all collections to start fresh
    console.log('\n🧹 Clearing all collections to start fresh...');
    
    await Brand.deleteMany({});
    await Category.deleteMany({});
    await Subcategory.deleteMany({});
    await ExtendedSubcategory.deleteMany({});
    await Product.deleteMany({});
    
    console.log('✅ All collections cleared successfully!');
    
    // Verify clearing
    const newBrandCount = await Brand.countDocuments();
    const newCategoryCount = await Category.countDocuments();
    const newSubcategoryCount = await Subcategory.countDocuments();
    const newExtendedSubcategoryCount = await ExtendedSubcategory.countDocuments();
    const newProductCount = await Product.countDocuments();
    
    console.log('\n📊 After clearing:');
    console.log(`Brands: ${newBrandCount}`);
    console.log(`Categories: ${newCategoryCount}`);
    console.log(`Subcategories: ${newSubcategoryCount}`);
    console.log(`Extended Subcategories: ${newExtendedSubcategoryCount}`);
    console.log(`Products: ${newProductCount}`);

  } catch (error) {
    console.error('❌ Error checking/clearing data:', error);
  } finally {
    mongoose.connection.close();
  }
}

checkAndClearData();