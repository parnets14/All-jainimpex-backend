import Capital from '../models/Capital.js';

// Get all capital accounts
export const getAllCapitals = async (req, res) => {
  try {
    const { financialYear } = req.query;
    const query = financialYear ? { financialYear } : {};
    
    const capitals = await Capital.find(query).sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      data: capitals
    });
  } catch (error) {
    console.error('Error fetching capitals:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch capitals',
      error: error.message
    });
  }
};

// Create capital account
export const createCapital = async (req, res) => {
  try {
    const capitalData = {
      ...req.body,
      createdBy: req.user._id
    };
    
    const capital = await Capital.create(capitalData);
    
    res.status(201).json({
      success: true,
      message: 'Capital account created successfully',
      data: capital
    });
  } catch (error) {
    console.error('Error creating capital:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create capital account',
      error: error.message
    });
  }
};

// Update capital account
export const updateCapital = async (req, res) => {
  try {
    const { id } = req.params;
    
    const capital = await Capital.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!capital) {
      return res.status(404).json({
        success: false,
        message: 'Capital account not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Capital account updated successfully',
      data: capital
    });
  } catch (error) {
    console.error('Error updating capital:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update capital account',
      error: error.message
    });
  }
};

// Delete capital account
export const deleteCapital = async (req, res) => {
  try {
    const { id } = req.params;
    
    const capital = await Capital.findByIdAndDelete(id);
    
    if (!capital) {
      return res.status(404).json({
        success: false,
        message: 'Capital account not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Capital account deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting capital:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete capital account',
      error: error.message
    });
  }
};
