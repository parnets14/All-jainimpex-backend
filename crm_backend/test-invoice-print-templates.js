import mongoose from 'mongoose';
import dotenv from 'dotenv';
import InvoicePrintTemplate from './models/InvoicePrintTemplate.js';
import User from './models/User.js';

dotenv.config();

const testInvoicePrintTemplates = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Find super admin
    const superAdmin = await User.findOne({ role: 'super_admin' });
    if (!superAdmin) {
      console.log('❌ No super admin found');
      process.exit(1);
    }
    console.log(`✅ Found super admin: ${superAdmin.name}\n`);
    
    // Test 1: Get all templates
    console.log('📋 Test 1: Get All Templates');
    console.log('─'.repeat(50));
    const allTemplates = await InvoicePrintTemplate.find()
      .populate('createdBy', 'name email');
    console.log(`Found ${allTemplates.length} templates:`);
    allTemplates.forEach((template, index) => {
      console.log(`${index + 1}. ${template.name}`);
      console.log(`   - Global: ${template.isGlobal ? 'Yes' : 'No'}`);
      console.log(`   - Default: ${template.isDefault ? 'Yes' : 'No'}`);
      console.log(`   - Created by: ${template.createdBy.name}`);
      console.log(`   - Settings: ${Object.keys(template.settings).length} options`);
    });
    console.log('');
    
    // Test 2: Get default template
    console.log('📋 Test 2: Get Default Template');
    console.log('─'.repeat(50));
    const defaultTemplate = await InvoicePrintTemplate.findOne({
      isGlobal: true,
      isDefault: true
    });
    if (defaultTemplate) {
      console.log(`✅ Default template: ${defaultTemplate.name}`);
      console.log(`   Description: ${defaultTemplate.description}`);
      console.log(`   Settings:`);
      console.log(`   - Show Product Code: ${defaultTemplate.settings.showProductCode}`);
      console.log(`   - Show HSN Code: ${defaultTemplate.settings.showHSNCode}`);
      console.log(`   - Show Brand: ${defaultTemplate.settings.showBrand}`);
      console.log(`   - Show Category: ${defaultTemplate.settings.showCategory}`);
      console.log(`   - Font Size: ${defaultTemplate.settings.fontSize}`);
      console.log(`   - Orientation: ${defaultTemplate.settings.orientation}`);
    } else {
      console.log('❌ No default template found');
    }
    console.log('');
    
    // Test 3: Create user template
    console.log('📋 Test 3: Create User Template');
    console.log('─'.repeat(50));
    const userTemplate = new InvoicePrintTemplate({
      name: 'My Custom Invoice',
      description: 'Test template for user',
      settings: {
        showSerialNumber: true,
        showProductCode: true,
        showProductName: true,
        showDescription: true,
        showHSNCode: true,
        showCategory: true,
        showSubcategory: false,
        showBrand: true,
        showUnit: true,
        showAlternateUnit: false,
        showQuantity: true,
        showRate: true,
        showAmount: true,
        showDiscount: true,
        showGST: true,
        showTotal: true,
        showProductType: false,
        showSalesType: false,
        showCompanyLogo: true,
        showCompanyDetails: true,
        showInvoiceNumber: true,
        showInvoiceDate: true,
        showDueDate: true,
        showCustomerInfo: true,
        showCustomerGST: true,
        showBankDetails: true,
        showTermsAndConditions: true,
        showSignature: true,
        showPointsEarned: true,
        showSchemes: true,
        fontSize: 'medium',
        orientation: 'portrait',
        showProductImages: false,
        compactMode: false
      },
      isDefault: false,
      isGlobal: false,
      createdBy: superAdmin._id
    });
    
    await userTemplate.save();
    console.log(`✅ Created user template: ${userTemplate.name}`);
    console.log(`   ID: ${userTemplate._id}`);
    console.log('');
    
    // Test 4: Update template
    console.log('📋 Test 4: Update Template');
    console.log('─'.repeat(50));
    userTemplate.description = 'Updated description';
    userTemplate.settings.showBrand = false;
    await userTemplate.save();
    console.log(`✅ Updated template: ${userTemplate.name}`);
    console.log(`   New description: ${userTemplate.description}`);
    console.log(`   Show Brand: ${userTemplate.settings.showBrand}`);
    console.log('');
    
    // Test 5: Get templates for user
    console.log('📋 Test 5: Get Templates for User');
    console.log('─'.repeat(50));
    const userTemplates = await InvoicePrintTemplate.find({
      $or: [
        { createdBy: superAdmin._id },
        { isGlobal: true }
      ]
    }).sort({ isDefault: -1, createdAt: -1 });
    console.log(`Found ${userTemplates.length} templates for user:`);
    userTemplates.forEach((template, index) => {
      console.log(`${index + 1}. ${template.name} ${template.isDefault ? '(DEFAULT)' : ''}`);
      console.log(`   - Type: ${template.isGlobal ? 'Global' : 'Personal'}`);
    });
    console.log('');
    
    // Test 6: Delete user template
    console.log('📋 Test 6: Delete Template');
    console.log('─'.repeat(50));
    await userTemplate.deleteOne();
    console.log(`✅ Deleted template: ${userTemplate.name}`);
    console.log('');
    
    // Test 7: Verify settings structure
    console.log('📋 Test 7: Verify Settings Structure');
    console.log('─'.repeat(50));
    const taxInvoice = await InvoicePrintTemplate.findOne({ name: 'Tax Invoice (GST Compliant)' });
    if (taxInvoice) {
      console.log(`✅ Tax Invoice template found`);
      console.log(`   Product Columns:`);
      const productColumns = [
        'showSerialNumber', 'showProductCode', 'showProductName', 'showDescription',
        'showHSNCode', 'showCategory', 'showSubcategory', 'showBrand',
        'showUnit', 'showAlternateUnit', 'showQuantity', 'showRate',
        'showAmount', 'showDiscount', 'showGST', 'showTotal',
        'showProductType', 'showSalesType'
      ];
      productColumns.forEach(col => {
        if (taxInvoice.settings[col]) {
          console.log(`      ✓ ${col.replace('show', '')}`);
        }
      });
      
      console.log(`   Invoice Sections:`);
      const invoiceSections = [
        'showCompanyLogo', 'showCompanyDetails', 'showInvoiceNumber', 'showInvoiceDate',
        'showDueDate', 'showCustomerInfo', 'showCustomerGST', 'showBankDetails',
        'showTermsAndConditions', 'showSignature', 'showPointsEarned', 'showSchemes'
      ];
      invoiceSections.forEach(sec => {
        if (taxInvoice.settings[sec]) {
          console.log(`      ✓ ${sec.replace('show', '')}`);
        }
      });
      
      console.log(`   Layout:`);
      console.log(`      - Font Size: ${taxInvoice.settings.fontSize}`);
      console.log(`      - Orientation: ${taxInvoice.settings.orientation}`);
      console.log(`      - Compact Mode: ${taxInvoice.settings.compactMode}`);
    }
    console.log('');
    
    console.log('✅ All tests completed successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

testInvoicePrintTemplates();
