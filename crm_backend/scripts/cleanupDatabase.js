import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../.env") });

// Import models (only existing ones)
import Brand from "../models/Brand.js";
import Category from "../models/Category.js";
import Subcategory from "../models/Subcategory.js";
import ExtendedSubcategory from "../models/ExtendedSubcategory.js";
import Product from "../models/Product.js";
import Dealer from "../models/Dealer.js";
import DealerCategory from "../models/DealerCategory.js";
import Region from "../models/Region.js";
import Warehouse from "../models/Warehouse.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import GRN from "../models/GRN.js";
import Stock from "../models/Stock.js";
import SalesOrder from "../models/SalesOrder.js";
import DealerInvoice from "../models/DealerInvoice.js";
import DealerPayment from "../models/DealerPayment.js";
import CreditNote from "../models/CreditNote.js";
import DebitNote from "../models/DebitNote.js";
import Supplier from "../models/Supplier.js";
import SupplierInvoice from "../models/SupplierInvoice.js";
import SupplierPayment from "../models/SupplierPayment.js";
import SupplierLedger from "../models/SupplierLedger.js";
import DealerLedger from "../models/DealerLedger.js";
import Cheque from "../models/Cheque.js";
import DiscountMapping from "../models/DiscountMapping.js";
import Points from "../models/Points.js";
import DealerPricing from "../models/DealerPricing.js";
import Employee from "../models/Employee.js";
import Attendance from "../models/Attendance.js";
import Expense from "../models/Expense.js";
import Claim from "../models/Claim.js";
import DealerPerformance from "../models/DealerPerformance.js";
import ActivityLog from "../models/ActivityLog.js";
import DownloadLog from "../models/DownloadLog.js";
import Notification from "../models/Notification.js";
import ProductRecommendation from "../models/ProductRecommendation.js";
import InvoicePrintTemplate from "../models/InvoicePrintTemplate.js";
import SalarySlip from "../models/SalarySlip.js";
import Leave from "../models/Leave.js";
import ExpenseCategory from "../models/ExpenseCategory.js";
import ExpenseType from "../models/ExpenseType.js";
import ClaimType from "../models/ClaimType.js";
import SchemeType from "../models/SchemeType.js";
import PaymentTerm from "../models/PaymentTerm.js";
import ChatConversation from "../models/ChatConversation.js";
import ChatMessage from "../models/ChatMessage.js";

// NOTE: We are NOT importing User or Dealertype models - we want to keep users intact

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/jainimpexcrm";

async function cleanupDatabase() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    console.log("\n⚠️  WARNING: This will delete ALL data except Users!");
    console.log("📋 Collections to be cleared:");
    console.log(
      "   - Brands, Categories, Subcategories, Extended Subcategories"
    );
    console.log("   - Products");
    console.log("   - Dealers, Suppliers");
    console.log("   - Orders, Invoices, Payments");
    console.log("   - Stock, Warehouses");
    console.log("   - Employees, Attendance");
    console.log("   - All transactional data");
    console.log("\n✅ Collections to be PRESERVED:");
    console.log("   - Users (including super admin)");

    console.log("\n🗑️  Starting cleanup...\n");

    // Delete in order to respect dependencies
    const deletions = [
      { model: ChatMessage, name: "Chat Messages" },
      { model: ChatConversation, name: "Chat Conversations" },
      { model: DealerPayment, name: "Dealer Payments" },
      { model: DealerInvoice, name: "Dealer Invoices" },
      { model: SalesOrder, name: "Sales Orders" },
      { model: CreditNote, name: "Credit Notes" },
      { model: DealerLedger, name: "Dealer Ledger" },
      { model: DealerPerformance, name: "Dealer Performance" },
      { model: Cheque, name: "Cheques" },
      { model: Dealer, name: "Dealers" },
      { model: DealerCategory, name: "Dealer Categories" },

      { model: SupplierPayment, name: "Supplier Payments" },
      { model: SupplierInvoice, name: "Supplier Invoices" },
      { model: SupplierLedger, name: "Supplier Ledger" },
      { model: DebitNote, name: "Debit Notes" },
      { model: Supplier, name: "Suppliers" },

      { model: Stock, name: "Stock" },
      { model: GRN, name: "GRNs" },
      { model: PurchaseOrder, name: "Purchase Orders" },
      { model: Warehouse, name: "Warehouses" },

      { model: DealerPricing, name: "Dealer Pricing" },
      { model: ProductRecommendation, name: "Product Recommendations" },
      { model: Product, name: "Products" },

      { model: DiscountMapping, name: "Discount Mappings" },
      { model: Points, name: "Points" },
      { model: SchemeType, name: "Scheme Types" },
      { model: PaymentTerm, name: "Payment Terms" },

      { model: ExtendedSubcategory, name: "Extended Subcategories" },
      { model: Subcategory, name: "Subcategories" },
      { model: Category, name: "Categories" },
      { model: Brand, name: "Brands" },

      { model: Region, name: "Regions" },

      { model: Leave, name: "Leaves" },
      { model: SalarySlip, name: "Salary Slips" },
      { model: Attendance, name: "Attendance" },
      { model: Claim, name: "Claims" },
      { model: ClaimType, name: "Claim Types" },
      { model: Expense, name: "Expenses" },
      { model: ExpenseType, name: "Expense Types" },
      { model: ExpenseCategory, name: "Expense Categories" },
      { model: Employee, name: "Employees" },

      { model: InvoicePrintTemplate, name: "Invoice Print Templates" },
      { model: Notification, name: "Notifications" },
      { model: ActivityLog, name: "Activity Logs" },
      { model: DownloadLog, name: "Download Logs" },
    ];

    let totalDeleted = 0;

    for (const { model, name } of deletions) {
      try {
        const result = await model.deleteMany({});
        console.log(`✅ Deleted ${result.deletedCount} ${name}`);
        totalDeleted += result.deletedCount;
      } catch (error) {
        console.error(`❌ Error deleting ${name}:`, error.message);
      }
    }

    console.log(
      `\n✅ Cleanup complete! Total records deleted: ${totalDeleted}`
    );
    console.log(
      "✅ Users preserved - you can still login with your super admin account"
    );
    console.log(
      "\n🎉 Database is now clean and ready for the new brand-first hierarchy!"
    );
  } catch (error) {
    console.error("❌ Error during cleanup:", error);
  } finally {
    await mongoose.connection.close();
    console.log("\n🔌 Disconnected from MongoDB");
    process.exit(0);
  }
}

// Run the cleanup
cleanupDatabase();
