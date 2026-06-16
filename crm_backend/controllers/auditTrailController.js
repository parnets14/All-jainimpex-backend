import { auditTrailSchema } from '../models/AuditTrail.js';

const getModels = (dbConnection) => ({
  AuditTrail:
    dbConnection.models.AuditTrail ||
    dbConnection.model('AuditTrail', auditTrailSchema),
});

// @desc    List audit-trail entries (filterable). Read-only.
// @route   GET /api/audit-trail
// @access  Private
export const getAuditTrail = async (req, res) => {
  try {
    const { AuditTrail } = getModels(req.dbConnection);
    const {
      page = 1,
      limit = 50,
      entity,
      entityId,
      action,
      performedBy,
      documentNumber,
      startDate,
      endDate,
      search,
    } = req.query;

    const query = {};
    if (entity) query.entity = entity;
    if (entityId) query.entityId = entityId;
    if (action) query.action = action;
    if (performedBy) query.performedBy = performedBy;
    if (documentNumber) query.documentNumber = { $regex: documentNumber, $options: 'i' };
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    if (search) {
      query.$or = [
        { documentNumber: { $regex: search, $options: 'i' } },
        { entity: { $regex: search, $options: 'i' } },
        { performedByName: { $regex: search, $options: 'i' } },
        { reason: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [entries, total] = await Promise.all([
      AuditTrail.find(query)
        .populate('performedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      AuditTrail.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: entries,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalRecords: total,
      },
    });
  } catch (error) {
    console.error('Get audit trail error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get the full audit history for one document. Read-only.
// @route   GET /api/audit-trail/:entity/:entityId
// @access  Private
export const getDocumentAuditTrail = async (req, res) => {
  try {
    const { AuditTrail } = getModels(req.dbConnection);
    const { entity, entityId } = req.params;

    const entries = await AuditTrail.find({ entity, entityId })
      .populate('performedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: entries });
  } catch (error) {
    console.error('Get document audit trail error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
