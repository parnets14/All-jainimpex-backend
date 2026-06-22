// Check dealer opening balances for shree-jain-impex
import { getCompanyConnection } from '../config/multiDatabase.js';
import { dealerSchema } from '../models/Dealer.js';

setTimeout(async () => {
  try {
    const db = await getCompanyConnection('shree-jain-impex');
    await db.asPromise();
    const Dealer = db.models.Dealer || db.model('Dealer', dealerSchema);

    const total = await Dealer.countDocuments();
    const withOB = await Dealer.find({ openingBalance: { $gt: 0 } })
      .select('name code openingBalance openingBalanceType')
      .lean();

    console.log('Total dealers:', total);
    console.log('Dealers with openingBalance > 0:', withOB.length);
    withOB.slice(0, 10).forEach(d => {
      console.log(' ', d.name, ':', d.openingBalance, d.openingBalanceType || 'Dr');
    });

    if (withOB.length === 0) {
      const sample = await Dealer.findOne().select('name openingBalance openingBalanceType').lean();
      console.log('Sample dealer openingBalance:', sample?.openingBalance, '| type:', typeof sample?.openingBalance);
    }

    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}, 2000);
