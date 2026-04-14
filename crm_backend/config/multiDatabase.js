// config/multiDatabase.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Company to database mapping
const COMPANY_DB_MAP = {
  'jain-impex': process.env.MONGO_DB_JAINIMPEX || 'JainImpexCRM',
  'ridhi': process.env.MONGO_DB_RIDHI || 'ridhi_crm',
  'shree-jain-impex': process.env.MONGO_DB_SHREEJAIN || 'shreejain_crm'
};

// Store database connections
const connections = {};

/**
 * Get database connection for a specific company
 * @param {string} company - Company identifier (jain-impex, ridhi, shree-jain-impex)
 * @returns {mongoose.Connection} - Mongoose connection for the company
 */
export const getCompanyConnection = (company) => {
  if (!company) {
    throw new Error('Company identifier is required');
  }

  const dbName = COMPANY_DB_MAP[company];
  if (!dbName) {
    throw new Error(`Invalid company identifier: ${company}. Valid options: ${Object.keys(COMPANY_DB_MAP).join(', ')}`);
  }

  // Return existing connection if already created
  if (connections[company]) {
    return connections[company];
  }

  // Create new connection
  const baseUri = process.env.MONGO_BASE_URI;
  const options = process.env.MONGO_OPTIONS || '?retryWrites=true&w=majority';
  const connectionString = `${baseUri}/${dbName}${options}`;

  console.log(`🔌 Creating database connection for ${company} → ${dbName}`);

  try {
    const connection = mongoose.createConnection(connectionString, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    connection.on('connected', () => {
      console.log(`✅ Connected to ${company} database: ${dbName}`);
    });

    connection.on('error', (err) => {
      console.error(`❌ Error in ${company} database connection:`, err);
    });

    connection.on('disconnected', () => {
      console.log(`⚠️ Disconnected from ${company} database: ${dbName}`);
    });

    connections[company] = connection;
    return connection;
  } catch (error) {
    console.error(`❌ Failed to create connection for ${company}:`, error);
    throw error;
  }
};

/**
 * Initialize all database connections
 * @returns {Promise<Object>} - Object with all connections
 */
export const initializeAllConnections = async () => {
  console.log('🚀 Initializing all company database connections...');
  
  const companies = Object.keys(COMPANY_DB_MAP);
  const connectionPromises = companies.map(async (company) => {
    try {
      const connection = getCompanyConnection(company);
      await connection.asPromise(); // Wait for connection to be established
      return { company, success: true };
    } catch (error) {
      console.error(`Failed to connect to ${company}:`, error.message);
      return { company, success: false, error: error.message };
    }
  });

  const results = await Promise.all(connectionPromises);
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`✅ Database connections initialized: ${successful} successful, ${failed} failed`);
  
  return connections;
};

/**
 * Get model for a specific company
 * @param {string} company - Company identifier
 * @param {string} modelName - Name of the model (e.g., 'User', 'Dealer')
 * @param {mongoose.Schema} schema - Mongoose schema
 * @returns {mongoose.Model} - Model for the company's database
 */
export const getCompanyModel = (company, modelName, schema) => {
  const connection = getCompanyConnection(company);
  
  // Check if model already exists on this connection
  if (connection.models[modelName]) {
    return connection.models[modelName];
  }
  
  // Create and return new model
  return connection.model(modelName, schema);
};

/**
 * Close all database connections
 */
export const closeAllConnections = async () => {
  console.log('🔌 Closing all database connections...');
  
  const closePromises = Object.entries(connections).map(async ([company, connection]) => {
    try {
      await connection.close();
      console.log(`✅ Closed connection for ${company}`);
    } catch (error) {
      console.error(`❌ Error closing connection for ${company}:`, error);
    }
  });

  await Promise.all(closePromises);
  console.log('✅ All database connections closed');
};

/**
 * Get list of valid company identifiers
 * @returns {string[]} - Array of valid company identifiers
 */
export const getValidCompanies = () => {
  return Object.keys(COMPANY_DB_MAP);
};

/**
 * Check if company identifier is valid
 * @param {string} company - Company identifier to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export const isValidCompany = (company) => {
  return Object.keys(COMPANY_DB_MAP).includes(company);
};

// Export company database mapping for reference
export { COMPANY_DB_MAP };

// Handle process termination
process.on('SIGINT', async () => {
  await closeAllConnections();
  process.exit(0);
});

export default {
  getCompanyConnection,
  initializeAllConnections,
  getCompanyModel,
  closeAllConnections,
  getValidCompanies,
  isValidCompany,
  COMPANY_DB_MAP
};
