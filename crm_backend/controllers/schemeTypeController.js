// controllers/schemeTypeController.js
import SchemeType from "../models/SchemeType.js";

export const getSchemeTypes = async (req, res) => {
  try {
    const schemeTypes = await SchemeType.find({ isActive: true }).sort({ name: 1 });
    
    res.json({
      success: true,
      data: schemeTypes
    });
  } catch (error) {
    console.error('Get scheme types error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching scheme types',
      error: error.message
    });
  }
};

export const createSchemeType = async (req, res) => {
  try {
    const { name, code, description } = req.body;

    const schemeType = new SchemeType({
      name,
      code: code.toUpperCase(),
      description
    });

    await schemeType.save();

    res.status(201).json({
      success: true,
      message: 'Scheme type created successfully',
      data: schemeType
    });
  } catch (error) {
    console.error('Create scheme type error:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Scheme type code already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating scheme type',
      error: error.message
    });
  }
};