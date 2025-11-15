import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import StockMovementService from '../services/stockMovementService.js';
import Product from '../models/Product.js';
import Warehouse from '../models/Warehouse.js';
import User from '../models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const syncStockMovements = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔄 Starting Stock Movement Sync...');
    console.log('='.repeat(60));
    console.log('This will:');
    console.log('1. Clear all existing stock movements');
    console.log('2. Recreate them from GRN data');
    console.log('3. Recalculate all balances');
    console.log('='.repeat(60));

    const result = await StockMovementService.migrateExistingGRNData();

    console.log('\n✅ Sync Complete!');
    console.log('='.repeat(60));
    console.log(`GRNs Processed: ${result.grnsProcessed}`);
    console.log(`Movements Created: ${result.movementsCreated}`);
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

syncStockMovements();
