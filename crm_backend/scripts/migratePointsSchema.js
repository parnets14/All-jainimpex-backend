import mongoose from 'mongoose';
import Points from '../models/Points.js';
import connectDB from '../config/db.js';

const migratePointsSchema = async () => {
  try {
    await connectDB();
    console.log('Connected to database');

    // Find all points records that don't have the new fields
    const pointsToUpdate = await Points.find({
      $or: [
        { benefitType: { $exists: false } },
        { extraQuantity: { $exists: false } },
        { discountPercentage: { $exists: false } },
        { cashbackAmount: { $exists: false } },
        { validFrom: { $exists: false } },
        { validTo: { $exists: false } },
        { autoApplyGRN: { $exists: false } },
        { autoApplySupplierInvoice: { $exists: false } },
        { description: { $exists: false } }
      ]
    });

    console.log(`Found ${pointsToUpdate.length} records to update`);

    // Update each record with default values
    for (const point of pointsToUpdate) {
      const updateData = {};
      
      if (!point.benefitType) updateData.benefitType = 'points';
      if (!point.extraQuantity) updateData.extraQuantity = 0;
      if (!point.discountPercentage) updateData.discountPercentage = 0;
      if (!point.cashbackAmount) updateData.cashbackAmount = 0;
      if (!point.validFrom) updateData.validFrom = new Date();
      if (!point.validTo) updateData.validTo = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year from now
      if (!point.autoApplyGRN) updateData.autoApplyGRN = false;
      if (!point.autoApplySupplierInvoice) updateData.autoApplySupplierInvoice = false;
      if (!point.description) updateData.description = '';

      await Points.findByIdAndUpdate(point._id, updateData);
      console.log(`Updated record ${point._id}`);
    }

    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

migratePointsSchema();
