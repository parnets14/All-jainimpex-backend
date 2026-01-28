import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/jain_inpex_crm', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

console.log('🔧 Creating Sample Hierarchy Data for Supplier Discount System...');

// Define schemas
const brandSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const subcategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const extendedSubcategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  subcategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcategory' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const productSchema = new mongoose.Schema({
  itemName: { type: String, required: true },
  productCode: { type: String, required: true },
  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  subcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcategory' },
  extendedSubcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'ExtendedSubcategory' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// Create models
const Brand = mongoose.model('Brand', brandSchema);
const Category = mongoose.model('Category', categorySchema);
const Subcategory = mongoose.model('Subcategory', subcategorySchema);
const ExtendedSubcategory = mongoose.model('ExtendedSubcategory', extendedSubcategorySchema);
const Product = mongoose.model('Product', productSchema);

async function createSampleData() {
  try {
    console.log('\n🏷️ Creating sample brands...');
    const brands = await Brand.insertMany([
      { name: 'Cera', description: 'Cera Sanitaryware' },
      { name: 'TRUFLO', description: 'TRUFLO Pipes and Fittings' },
      { name: 'Astral', description: 'Astral Pipes' },
      { name: 'Supreme', description: 'Supreme Industries' },
      { name: 'Finolex', description: 'Finolex Pipes' }
    ]);
    console.log(`✅ Created ${brands.length} brands`);

    console.log('\n📂 Creating sample categories...');
    const categories = await Category.insertMany([
      { name: 'Pipes', description: 'All types of pipes' },
      { name: 'Fittings', description: 'Pipe fittings and connectors' },
      { name: 'Sanitaryware', description: 'Bathroom and kitchen fixtures' },
      { name: 'Electrical', description: 'Electrical conduits and accessories' },
      { name: 'Hardware', description: 'General hardware items' }
    ]);
    console.log(`✅ Created ${categories.length} categories`);

    console.log('\n📁 Creating sample subcategories...');
    const subcategories = await Subcategory.insertMany([
      { name: 'CPVC Pipes', categoryId: categories[0]._id, description: 'CPVC pipes for hot water' },
      { name: 'PVC Pipes', categoryId: categories[0]._id, description: 'PVC pipes for cold water' },
      { name: 'HDPE Pipes', categoryId: categories[0]._id, description: 'HDPE pipes for industrial use' },
      { name: 'Elbows', categoryId: categories[1]._id, description: 'Pipe elbows and bends' },
      { name: 'Tees', categoryId: categories[1]._id, description: 'Pipe tees and junctions' },
      { name: 'Couplers', categoryId: categories[1]._id, description: 'Pipe couplers and connectors' },
      { name: 'Wash Basins', categoryId: categories[2]._id, description: 'Bathroom wash basins' },
      { name: 'Water Closets', categoryId: categories[2]._id, description: 'Toilet fixtures' }
    ]);
    console.log(`✅ Created ${subcategories.length} subcategories`);

    console.log('\n📄 Creating sample extended subcategories...');
    const extendedSubcategories = await ExtendedSubcategory.insertMany([
      { name: '15mm CPVC', subcategoryId: subcategories[0]._id, description: '15mm diameter CPVC pipes' },
      { name: '20mm CPVC', subcategoryId: subcategories[0]._id, description: '20mm diameter CPVC pipes' },
      { name: '25mm CPVC', subcategoryId: subcategories[0]._id, description: '25mm diameter CPVC pipes' },
      { name: '90° Elbow', subcategoryId: subcategories[3]._id, description: '90 degree pipe elbows' },
      { name: '45° Elbow', subcategoryId: subcategories[3]._id, description: '45 degree pipe elbows' },
      { name: 'Equal Tee', subcategoryId: subcategories[4]._id, description: 'Equal diameter tees' },
      { name: 'Reducing Tee', subcategoryId: subcategories[4]._id, description: 'Reducing diameter tees' }
    ]);
    console.log(`✅ Created ${extendedSubcategories.length} extended subcategories`);

    console.log('\n📦 Creating sample products...');
    const products = await Product.insertMany([
      {
        itemName: 'Cera 15mm CPVC Pipe',
        productCode: 'CERA-CPVC-15',
        brand: brands[0]._id, // Cera
        category: categories[0]._id, // Pipes
        subcategory: subcategories[0]._id, // CPVC Pipes
        extendedSubcategory: extendedSubcategories[0]._id // 15mm CPVC
      },
      {
        itemName: 'TRUFLO 20mm CPVC Pipe',
        productCode: 'TRUFLO-CPVC-20',
        brand: brands[1]._id, // TRUFLO
        category: categories[0]._id, // Pipes
        subcategory: subcategories[0]._id, // CPVC Pipes
        extendedSubcategory: extendedSubcategories[1]._id // 20mm CPVC
      },
      {
        itemName: 'Astral PVC Pipe 25mm',
        productCode: 'ASTRAL-PVC-25',
        brand: brands[2]._id, // Astral
        category: categories[0]._id, // Pipes
        subcategory: subcategories[1]._id, // PVC Pipes
      },
      {
        itemName: 'Cera 90° Elbow 15mm',
        productCode: 'CERA-ELBOW-90-15',
        brand: brands[0]._id, // Cera
        category: categories[1]._id, // Fittings
        subcategory: subcategories[3]._id, // Elbows
        extendedSubcategory: extendedSubcategories[3]._id // 90° Elbow
      },
      {
        itemName: 'TRUFLO Equal Tee 20mm',
        productCode: 'TRUFLO-TEE-EQ-20',
        brand: brands[1]._id, // TRUFLO
        category: categories[1]._id, // Fittings
        subcategory: subcategories[4]._id, // Tees
        extendedSubcategory: extendedSubcategories[5]._id // Equal Tee
      },
      {
        itemName: 'Supreme HDPE Pipe 32mm',
        productCode: 'SUP-HDPE-32',
        brand: brands[3]._id, // Supreme
        category: categories[0]._id, // Pipes
        subcategory: subcategories[2]._id, // HDPE Pipes
      },
      {
        itemName: 'Finolex PVC Coupler 25mm',
        productCode: 'FINO-COUP-25',
        brand: brands[4]._id, // Finolex
        category: categories[1]._id, // Fittings
        subcategory: subcategories[5]._id, // Couplers
      },
      {
        itemName: 'Cera Wall Hung Wash Basin',
        productCode: 'CERA-WB-WH-001',
        brand: brands[0]._id, // Cera
        category: categories[2]._id, // Sanitaryware
        subcategory: subcategories[6]._id, // Wash Basins
      }
    ]);
    console.log(`✅ Created ${products.length} products`);

    console.log('\n🎯 Sample Data Creation Summary:');
    console.log(`📊 Brands: ${brands.length}`);
    console.log(`📊 Categories: ${categories.length}`);
    console.log(`📊 Subcategories: ${subcategories.length}`);
    console.log(`📊 Extended Subcategories: ${extendedSubcategories.length}`);
    console.log(`📊 Products: ${products.length}`);

    console.log('\n✅ Sample hierarchy data created successfully!');
    console.log('💡 The supplier extra discount dropdowns should now work properly.');

  } catch (error) {
    console.error('❌ Error creating sample data:', error);
  } finally {
    mongoose.connection.close();
  }
}

createSampleData();