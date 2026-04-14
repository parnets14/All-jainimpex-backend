// controllers/paymentTermController.js
import { paymentTermSchema } from "../models/PaymentTerm.js";

const getModels = (dbConnection) => {
  return {
    PaymentTerm: dbConnection.models.PaymentTerm || dbConnection.model('PaymentTerm', paymentTermSchema)
  };
};

export const getPaymentTerms = async (req, res) => {
  try {
    const { PaymentTerm } = getModels(req.dbConnection);
    const paymentTerms = await PaymentTerm.find({ isActive: true }).sort({ days: 1 });
    
    res.json({
      success: true,
      data: paymentTerms
    });
  } catch (error) {
    console.error('Get payment terms error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payment terms',
      error: error.message
    });
  }
};

export const createPaymentTerm = async (req, res) => {
  try {
    const { PaymentTerm } = getModels(req.dbConnection);
    const { name, days, code } = req.body;

    const paymentTerm = new PaymentTerm({
      name,
      days: days !== null ? parseInt(days) : null,
      code: code.toUpperCase()
    });

    await paymentTerm.save();

    res.status(201).json({
      success: true,
      message: 'Payment term created successfully',
      data: paymentTerm
    });
  } catch (error) {
    console.error('Create payment term error:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Payment term code already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating payment term',
      error: error.message
    });
  }
};