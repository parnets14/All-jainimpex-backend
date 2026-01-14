import mongoose from 'mongoose';
import dotenv from 'dotenv';
import InvoicePrintTemplate from './models/InvoicePrintTemplate.js';
import User from './models/User.js';

dotenv.config();

const seedTemplates = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Find super admin user
    const superAdmin = await User.findOne({ role: 'super_admin' });
    
    if (!superAdmin) {
      console.log('❌ No super admin found. Please create a super admin first.');
      process.exit(1);
    }
    
    console.log(`✅ Found super admin: ${superAdmin.name}`);
    
    // Delete existing global templates
    await InvoicePrintTemplate.deleteMany({ isGlobal: true });
    console.log('🗑️  Deleted existing global templates');
    
    // Default templates
    const templates = [
      {
        name: 'Detailed Invoice (All Fields)',
        description: 'Shows all available product information for comprehensive documentation',
        settings: {
          showSerialNumber: true,
          showProductCode: true,
          showProductName: true,
          showDescription: true,
          showHSNCode: true,
          showCategory: true,
          showSubcategory: true,
          showBrand: true,
          showUnit: true,
          showAlternateUnit: true,
          showQuantity: true,
          showRate: true,
          showAmount: true,
          showDiscount: true,
          showGST: true,
          showTotal: true,
          showProductType: true,
          showSalesType: true,
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
          fontSize: 'small',
          orientation: 'landscape',
          showProductImages: false,
          compactMode: false
        },
        isDefault: false,
        isGlobal: true,
        createdBy: superAdmin._id
      },
      {
        name: 'Simple Invoice (Basic Fields)',
        description: 'Minimal invoice with essential information only',
        settings: {
          showSerialNumber: true,
          showProductCode: false,
          showProductName: true,
          showDescription: false,
          showHSNCode: false,
          showCategory: false,
          showSubcategory: false,
          showBrand: false,
          showUnit: false,
          showAlternateUnit: false,
          showQuantity: true,
          showRate: true,
          showAmount: true,
          showDiscount: false,
          showGST: false,
          showTotal: true,
          showProductType: false,
          showSalesType: false,
          showCompanyLogo: true,
          showCompanyDetails: true,
          showInvoiceNumber: true,
          showInvoiceDate: true,
          showDueDate: false,
          showCustomerInfo: true,
          showCustomerGST: false,
          showBankDetails: false,
          showTermsAndConditions: false,
          showSignature: true,
          showPointsEarned: false,
          showSchemes: false,
          fontSize: 'medium',
          orientation: 'portrait',
          showProductImages: false,
          compactMode: true
        },
        isDefault: false,
        isGlobal: true,
        createdBy: superAdmin._id
      },
      {
        name: 'Tax Invoice (GST Compliant)',
        description: 'GST compliant invoice with HSN codes and tax details',
        settings: {
          showSerialNumber: true,
          showProductCode: true,
          showProductName: true,
          showDescription: false,
          showHSNCode: true,
          showCategory: false,
          showSubcategory: false,
          showBrand: false,
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
          showPointsEarned: false,
          showSchemes: false,
          fontSize: 'medium',
          orientation: 'portrait',
          showProductImages: false,
          compactMode: false
        },
        isDefault: true,
        isGlobal: true,
        createdBy: superAdmin._id
      },
      {
        name: 'Retail Invoice (Brand Focus)',
        description: 'Customer-friendly invoice highlighting brands and categories',
        settings: {
          showSerialNumber: true,
          showProductCode: false,
          showProductName: true,
          showDescription: true,
          showHSNCode: false,
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
          showCustomerGST: false,
          showBankDetails: false,
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
        isGlobal: true,
        createdBy: superAdmin._id
      },
      {
        name: 'Wholesale Invoice',
        description: 'Bulk order invoice with unit details and pricing',
        settings: {
          showSerialNumber: true,
          showProductCode: true,
          showProductName: true,
          showDescription: false,
          showHSNCode: true,
          showCategory: false,
          showSubcategory: false,
          showBrand: true,
          showUnit: true,
          showAlternateUnit: true,
          showQuantity: true,
          showRate: true,
          showAmount: true,
          showDiscount: true,
          showGST: true,
          showTotal: true,
          showProductType: false,
          showSalesType: true,
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
          showPointsEarned: false,
          showSchemes: false,
          fontSize: 'medium',
          orientation: 'portrait',
          showProductImages: false,
          compactMode: false
        },
        isDefault: false,
        isGlobal: true,
        createdBy: superAdmin._id
      }
    ];
    
    // Insert templates
    const createdTemplates = await InvoicePrintTemplate.insertMany(templates);
    
    console.log(`✅ Created ${createdTemplates.length} global templates:`);
    createdTemplates.forEach(template => {
      console.log(`   - ${template.name}${template.isDefault ? ' (DEFAULT)' : ''}`);
    });
    
    console.log('\n✅ Seed completed successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error seeding templates:', error);
    process.exit(1);
  }
};

seedTemplates();
