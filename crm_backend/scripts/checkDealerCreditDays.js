import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import Dealer from '../models/Dealer.js';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '..', '.env') });

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL).then(async () => {
  console.log('Connected to MongoDB');
  console.log('\n' + '='.repeat(80));
  console.log('CHECKING DEALER CREDIT DAYS CONFIGURATION');
  console.log('='.repeat(80) + '\n');
  
  try {
    const dealers = await Dealer.find({});
    
    console.log(`Found ${dealers.length} dealers\n`);
    
    dealers.forEach((dealer, index) => {
      console.log(`${index + 1}. ${dealer.code} - ${dealer.name}`);
      console.log(`   Credit Days (Legacy): ${dealer.creditDays || 0} days`);
      console.log(`   Credit Days (Regular): ${dealer.creditDaysRegular || 0} days`);
      console.log(`   Credit Days (CD): ${dealer.creditDaysCD || 0} days`);
      
      if (!dealer.creditDaysRegular && !dealer.creditDaysCD) {
        console.log(`   ⚠️  WARNING: No specific credit days configured!`);
        console.log(`   💡 TIP: Set creditDaysRegular and creditDaysCD in Dealer Master`);
      } else if (dealer.creditDaysRegular === dealer.creditDaysCD) {
        console.log(`   ⚠️  WARNING: Both Regular and CD have same credit days!`);
        console.log(`   💡 TIP: CD Sales should typically have longer credit period`);
      } else {
        console.log(`   ✅ Different credit days configured`);
      }
      console.log('');
    });
    
    console.log('='.repeat(80));
    console.log('RECOMMENDATION:');
    console.log('='.repeat(80));
    console.log('In Dealer Master, configure:');
    console.log('  - Credit Days (Regular): e.g., 30 days for regular sales');
    console.log('  - Credit Days (CD): e.g., 45 days for CD sales');
    console.log('');
    console.log('This will ensure different credit periods are applied automatically.');
    console.log('='.repeat(80) + '\n');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    mongoose.connection.close();
    console.log('Database connection closed.\n');
  }
}).catch(error => {
  console.error('MongoDB connection error:', error);
});
