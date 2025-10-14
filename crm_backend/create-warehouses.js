import mongoose from 'mongoose';
import Region from './models/Region.js';
import Warehouse from './models/Warehouse.js';

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/jaininpexcrm', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('Connected to MongoDB');
  
  try {
    // Create a default region if it doesn't exist
    let region = await Region.findOne({ name: 'Default Region' });
    if (!region) {
      region = new Region({
        name: 'Default Region',
        description: 'Default region for warehouses',
        code: 'DEF',
        status: 'active',
        createdBy: new mongoose.Types.ObjectId() // Dummy user ID
      });
      await region.save();
      console.log('Created default region');
    }
    
    // Create sample warehouses
    const warehouses = [
      {
        code: 'WH001',
        name: 'Main Warehouse',
        address: {
          street: '123 Industrial Area',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          country: 'India'
        },
        contact: {
          phone: '9876543210',
          email: 'main@warehouse.com',
          managerName: 'John Doe'
        },
        capacity: {
          totalArea: 10000,
          usedArea: 5000,
          unit: 'sq.ft'
        },
        status: 'active',
        facilities: ['racking', 'forklift', 'security', 'cctv'],
        region: region._id,
        isActive: true,
        createdBy: new mongoose.Types.ObjectId()
      },
      {
        code: 'WH002',
        name: 'Secondary Warehouse',
        address: {
          street: '456 Business Park',
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110001',
          country: 'India'
        },
        contact: {
          phone: '9876543211',
          email: 'secondary@warehouse.com',
          managerName: 'Jane Smith'
        },
        capacity: {
          totalArea: 8000,
          usedArea: 3000,
          unit: 'sq.ft'
        },
        status: 'active',
        facilities: ['cold-storage', 'racking', 'security'],
        region: region._id,
        isActive: true,
        createdBy: new mongoose.Types.ObjectId()
      },
      {
        code: 'WH003',
        name: 'Regional Warehouse',
        address: {
          street: '789 Commercial Zone',
          city: 'Bangalore',
          state: 'Karnataka',
          pincode: '560001',
          country: 'India'
        },
        contact: {
          phone: '9876543212',
          email: 'regional@warehouse.com',
          managerName: 'Mike Johnson'
        },
        capacity: {
          totalArea: 12000,
          usedArea: 7000,
          unit: 'sq.ft'
        },
        status: 'active',
        facilities: ['cold-storage', 'racking', 'forklift', 'security', 'cctv', 'fire-safety'],
        region: region._id,
        isActive: true,
        createdBy: new mongoose.Types.ObjectId()
      }
    ];
    
    // Check if warehouses already exist
    for (const warehouseData of warehouses) {
      const existingWarehouse = await Warehouse.findOne({ code: warehouseData.code });
      if (!existingWarehouse) {
        const warehouse = new Warehouse(warehouseData);
        await warehouse.save();
        console.log(`Created warehouse: ${warehouse.name} (${warehouse.code})`);
      } else {
        console.log(`Warehouse already exists: ${existingWarehouse.name} (${existingWarehouse.code})`);
      }
    }
    
    // List all warehouses
    const allWarehouses = await Warehouse.find({ isActive: true });
    console.log(`\nTotal active warehouses: ${allWarehouses.length}`);
    allWarehouses.forEach(w => console.log(`- ${w.name} (${w.code}) - ${w.address.city}`));
    
  } catch (error) {
    console.error('Error creating warehouses:', error);
  } finally {
    mongoose.connection.close();
    process.exit(0);
  }
}).catch(err => {
  console.error('Connection error:', err);
  process.exit(1);
});
