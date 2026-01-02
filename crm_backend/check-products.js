import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import DealerPricing from './models/DealerPricing.js';

dotenv.config();

async function checkProducts() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB\n');

    const productCount = await Product.countDocuments();
    const pricingCount = await DealerPricing.countDocuments();
    
    console.log('=== PRODUCT COUNT ===');
    console.log('Total Products in Database:', productCount);
    console.log('Products with Dealer Pricing:', pricingCount);
    console.log('Products WITHOUT Dealer Pricing:', productCount - pricingCount);
    
    console.log('\n=== ALL PRODUCTS ===');
    const products = await Product.find({}, 'itemName productCode').sort({ itemName: 1 });
    products.forEach((p, i) => {
      console.log(`${i + 1}. ${p.itemName} (Code: ${p.productCode || 'N/A'})`);
    });
    
    console.log('\n=== PRODUCTS WITH DEALER PRICING ===');
    const pricings = await DealerPricing.find({}).populate('product', 'itemName productCode');
    pricings.forEach((pricing, i) => {
      const productName = pricing.product?.itemName || 'Unknown';
      const productCode = pricing.product?.productCode || 'N/A';
      console.log(`${i + 1}. ${productName} (Code: ${productCode}) - Selling: ₹${pricing.sellingPrice}, Purchase: ₹${pricing.purchasePrice}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkProducts();
