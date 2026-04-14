// utils/modelHelper.js
// Helper utility to get models from company-specific database connection

// Import all schemas
import { userSchema } from '../models/User.js';
import { productSchema } from '../models/Product.js';
import { categorySchema } from '../models/Category.js';
import { subcategorySchema } from '../models/Subcategory.js';
import { extendedSubcategorySchema } from '../models/ExtendedSubcategory.js';
import { brandSchema } from '../models/Brand.js';
import { dealerSchema } from '../models/Dealer.js';
import { salesOrderSchema } from '../models/SalesOrder.js';
import { dealerInvoiceSchema } from '../models/DealerInvoice.js';
import { dealerPaymentSchema } from '../models/DealerPayment.js';
import { stockSchema } from '../models/Stock.js';
import { grnSchema } from '../models/GRN.js';
import { purchaseOrderSchema } from '../models/PurchaseOrder.js';
import { supplierSchema } from '../models/Supplier.js';
import { regionSchema } from '../models/Region.js';
import { routeSchema } from '../models/Route.js';
// Add more schema imports as needed

/**
 * Get a model from the company-specific database connection
 * @param {mongoose.Connection} dbConnection - Company-specific database connection
 * @param {string} modelName - Name of the model
 * @returns {mongoose.Model} - Model instance for the company's database
 */
export const getModel = (dbConnection, modelName) => {
  if (!dbConnection) {
    throw new Error('Database connection is required');
  }

  // Check if model already exists on this connection
  if (dbConnection.models[modelName]) {
    return dbConnection.models[modelName];
  }

  // Map model names to their schemas
  const schemaMap = {
    'User': userSchema,
    'Product': productSchema,
    'Category': categorySchema,
    'Subcategory': subcategorySchema,
    'ExtendedSubcategory': extendedSubcategorySchema,
    'Brand': brandSchema,
    'Dealer': dealerSchema,
    'SalesOrder': salesOrderSchema,
    'DealerInvoice': dealerInvoiceSchema,
    'DealerPayment': dealerPaymentSchema,
    'Stock': stockSchema,
    'GRN': grnSchema,
    'PurchaseOrder': purchaseOrderSchema,
    'Supplier': supplierSchema,
    'Region': regionSchema,
    'Route': routeSchema,
    // Add more mappings as needed
  };

  const schema = schemaMap[modelName];
  if (!schema) {
    throw new Error(`Schema not found for model: ${modelName}`);
  }

  // Create and return new model
  return dbConnection.model(modelName, schema);
};

/**
 * Get multiple models at once
 * @param {mongoose.Connection} dbConnection - Company-specific database connection
 * @param {string[]} modelNames - Array of model names
 * @returns {Object} - Object with model names as keys and model instances as values
 */
export const getModels = (dbConnection, modelNames) => {
  const models = {};
  for (const modelName of modelNames) {
    models[modelName] = getModel(dbConnection, modelName);
  }
  return models;
};

export default { getModel, getModels };
