import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/jain_inpex_crm', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

console.log('🔍 Checking current data status...');

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

async function checkCurrentStatus() {
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
      console.log('\n📝 Current brands:');
      const brands = await Brand.find();
      brands.forEach(brand => {
        console.log(`  - ${brand.name} (ID: ${brand._id})`);
      });
    }

    if (categoryCount > 0) {
      console.log('\n📝 Current categories:');
      const categories = await Category.find();
      categories.forEach(category => {
        console.log(`  - ${category.name} (ID: ${category._id})`);
      });
    }

    if (subcategoryCount > 0) {
      console.log('\n📝 Current subcategories:');
      const subcategories = await Subcategory.find();
      subcategories.forEach(subcategory => {
        console.log(`  - ${subcategory.name} (ID: ${subcategory._id})`);
      });
    }

    if (extendedSubcategoryCount > 0) {
      console.log('\n📝 Current extended subcategories:');
      const extendedSubcategories = await ExtendedSubcategory.find();
      extendedSubcategories.forEach(extendedSubcategory => {
        console.log(`  - ${extendedSubcategory.name} (ID: ${extendedSubcategory._id})`);
      });
    }

    if (productCount > 0) {
      console.log('\n📝 Current products:');
      const products = await Product.find();
      products.forEach(product => {
        console.log(`  - ${product.itemName || product.productName} (Code: ${product.productCode}, ID: ${product._id})`);
      });
    }

  } catch (error) {
    console.error('❌ Error checking current status:', error);
  } finally {
    mongoose.connection.close();
  }
}

checkCurrentStatus();