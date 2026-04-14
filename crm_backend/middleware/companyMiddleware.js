// middleware/companyMiddleware.js
import { getCompanyConnection, isValidCompany } from '../config/multiDatabase.js';

/**
 * Middleware to attach company database connection to request
 * This middleware should be used after authentication middleware
 */
export const attachCompanyDB = (req, res, next) => {
  try {
    // Get company from authenticated user
    const company = req.user?.company;

    if (!company) {
      return res.status(400).json({
        success: false,
        message: 'Company information not found in user session'
      });
    }

    // Validate company
    if (!isValidCompany(company)) {
      return res.status(400).json({
        success: false,
        message: `Invalid company identifier: ${company}`
      });
    }

    // Get and attach company database connection
    req.dbConnection = getCompanyConnection(company);
    req.company = company;

    // Log for debugging (remove in production)
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔗 Request using ${company} database`);
    }

    next();
  } catch (error) {
    console.error('Error in company middleware:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to establish database connection',
      error: error.message
    });
  }
};

/**
 * Middleware to validate company parameter in request
 * Used for login and other pre-authentication routes
 */
export const validateCompanyParam = (req, res, next) => {
  const company = req.body.company || req.query.company || req.params.company;

  if (!company) {
    return res.status(400).json({
      success: false,
      message: 'Company identifier is required'
    });
  }

  if (!isValidCompany(company)) {
    return res.status(400).json({
      success: false,
      message: `Invalid company identifier: ${company}. Valid options: jain-impex, ridhi, shree-jain-impex`
    });
  }

  // Attach company to request for use in controllers
  req.company = company;
  next();
};

/**
 * Get model from company-specific database
 * Helper function to be used in controllers
 */
export const getModelForCompany = (req, modelName) => {
  if (!req.dbConnection) {
    throw new Error('Database connection not found. Make sure attachCompanyDB middleware is used.');
  }

  // Check if model already exists on this connection
  if (req.dbConnection.models[modelName]) {
    return req.dbConnection.models[modelName];
  }

  throw new Error(`Model ${modelName} not found on company database connection`);
};

export default {
  attachCompanyDB,
  validateCompanyParam,
  getModelForCompany
};
