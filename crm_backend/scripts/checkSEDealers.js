import { getCompanyConnection } from '../config/multiDatabase.js';
import { dealerSchema } from '../models/Dealer.js';
import { userSchema } from '../models/User.js';
import mongoose from 'mongoose';

setTimeout(async () => {
  try {
    const db = await getCompanyConnection('shree-jain-impex');
    await db.asPromise();
    const D = db.models.Dealer || db.model('Dealer', dealerSchema);
    const U = db.models.User || db.model('User', userSchema);

    const lokesh = await U.findOne({ name: /lokesh/i }).lean();
    console.log('Lokesh regions:', lokesh.assignedRegions);
    console.log('Lokesh _id:', lokesh._id.toString());

    const regionObjIds = lokesh.assignedRegions.map(r => new mongoose.Types.ObjectId(r));
    
    const inRegion = await D.countDocuments({ regionId: { $in: regionObjIds }, isActive: true });
    const bySE = await D.countDocuments({ salesExecutiveId: lokesh._id, isActive: true });
    const total = await D.countDocuments({ isActive: true });
    
    console.log('\nTotal active dealers:', total);
    console.log('Dealers in Lokesh assigned regions:', inRegion);
    console.log('Dealers with salesExecutiveId=Lokesh:', bySE);

    // Show a few dealers that Lokesh's SE ID is assigned to
    const seDealers = await D.find({ salesExecutiveId: lokesh._id }).select('name code regionId').limit(5).lean();
    console.log('\nSample dealers assigned to Lokesh (by SE ID):');
    seDealers.forEach(d => console.log(' ', d.name, '- regionId:', d.regionId?.toString()));

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}, 2000);
