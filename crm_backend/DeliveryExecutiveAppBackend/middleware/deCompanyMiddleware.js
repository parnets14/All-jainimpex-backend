import { getDeModels } from '../utils/deDbHelper.js';

/** Attach company-specific DB models to request (web admin + mobile DE) */
export const attachDeModels = (req, res, next) => {
  try {
    req.deModels = getDeModels(req);
    req.company = req.deModels.company;
    next();
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to resolve company database',
    });
  }
};
