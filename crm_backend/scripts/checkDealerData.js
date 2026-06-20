// Quick script to check what dealer data is stored in DB
// Usage: node scripts/checkDealerData.js --company=shree-jain-impex

import { getCompanyConnection, getValidCompanies } from '../config/multiDatabase.js';

const args = process.argv.slice(2);
const companyArg = args.find(a => a.startsWith('--company='));
const company = companyArg ? companyArg.split('=')[1] : 'shree-jain-impex';

async function run() {
  try {
    const validCompanies = getValidCompanies();
    if (!validCompanies.includes(company)) {
      console.log(`❌ Invalid company: ${company}. Valid: ${validCompanies.join(', ')}`);
      process.exit(1);
    }

    console.log(`\n🔍 Checking dealer data for: ${company}\n`);
    const db = await getCompanyConnection(company);
    await db.asPromise();

    const { dealerSchema } = await import('../models/Dealer.js');
    const { routeSchema } = await import('../models/Route.js');
    const { regionSchema } = await import('../models/Region.js');
    const { default: userModel } = await import('../models/User.js');
    const { dealerCategorySchema } = await import('../models/DealerCategory.js');
    const Dealer = db.models.Dealer || db.model('Dealer', dealerSchema);
    const Route = db.models.Route || db.model('Route', routeSchema);
    if (!db.models.Region) db.model('Region', regionSchema);
    if (!db.models.User) db.model('User', userModel.schema);
    if (!db.models.DealerCategory) db.model('DealerCategory', dealerCategorySchema);

    const dealers = await Dealer.find({})
      .select('name code routeId regionId salesExecutiveId dealerCategory dealerType openingBalance openingBalanceType isActive creditLimit')
      .populate('routeId', 'name code')
      .populate('regionId', 'name code')
      .populate('salesExecutiveId', 'name empId')
      .populate('dealerCategory', 'name')
      .lean();

    const routes = await Route.find({}).select('name code totalDealers').lean();

    console.log(`📊 Total dealers: ${dealers.length}`);
    console.log(`📊 Total routes: ${routes.length}\n`);

    if (routes.length > 0) {
      console.log('── ROUTES ──');
      routes.forEach(r => {
        console.log(`  ${r.name} (${r.code || 'no code'}) — ${r.totalDealers || 0} dealers assigned`);
      });
      console.log('');
    }

    console.log('── DEALERS ──');
    dealers.forEach(d => {
      const routeName = d.routeId ? (typeof d.routeId === 'object' ? d.routeId.name : d.routeId) : '❌ NO ROUTE';
      const regionName = d.regionId ? (typeof d.regionId === 'object' ? d.regionId.name : d.regionId) : '❌ NO REGION';
      const seName = d.salesExecutiveId ? (typeof d.salesExecutiveId === 'object' ? d.salesExecutiveId.name : d.salesExecutiveId) : '❌ NO SE';
      const catNames = d.dealerCategory?.map(c => typeof c === 'object' ? c.name : c).join(', ') || '❌ NO CATEGORY';
      
      console.log(`  ${d.name} [${d.code}]`);
      console.log(`    Type: ${d.dealerType || 'N/A'} | Category: ${catNames}`);
      console.log(`    Region: ${regionName} | Route: ${routeName} | SE: ${seName}`);
      console.log(`    Active: ${d.isActive} | Credit: ₹${d.creditLimit || 0} | Opening: ₹${d.openingBalance || 0} (${d.openingBalanceType || 'Dr'})`);
      console.log('');
    });

    // Check for dealers with routeId stored as null or missing
    const noRoute = dealers.filter(d => !d.routeId);
    const hasRoute = dealers.filter(d => !!d.routeId);
    console.log(`\n📋 Summary: ${hasRoute.length} dealers have a route, ${noRoute.length} have no route.`);
    if (noRoute.length > 0) {
      console.log('   Without route:', noRoute.map(d => d.name).join(', '));
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

setTimeout(run, 2000);
