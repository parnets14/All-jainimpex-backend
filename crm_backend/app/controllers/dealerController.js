import Dealer from '../../models/Dealer.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for profile image upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Save to crm_backend/uploads/dealer-images (same level as server.js)
    const uploadDir = path.join(__dirname, '../../uploads/dealer-images');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `dealer-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Export multer middleware
export const uploadProfileImage = upload.single('image');

// @desc    Update dealer profile (name and image only - for app)
// @route   PUT /api/app/dealer/profile
// @access  Protected (Dealer)
export const updateDealerProfile = async (req, res) => {
  try {
    // Get dealer by username (dealer code)
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }

    const updateData = {};

    // Update name if provided
    if (req.body.name !== undefined) {
      const name = req.body.name.trim();
      if (name.length < 3) {
        return res.status(400).json({
          success: false,
          message: 'Name must be at least 3 characters long'
        });
      }
      
      // Check if another dealer with same name exists
      const duplicateDealer = await Dealer.findOne({
        _id: { $ne: dealer._id },
        name: new RegExp(`^${name}$`, 'i'),
      });

      if (duplicateDealer) {
        return res.status(400).json({
          success: false,
          message: 'Another dealer with this name already exists'
        });
      }

      updateData.name = name;
    }

    // Update image if uploaded
    if (req.file) {
      // Delete old image if exists
      if (dealer.image) {
        // Old image path is relative like /uploads/dealer-images/filename.jpg
        const oldImageRelativePath = dealer.image.replace('/uploads/', '');
        const oldImagePath = path.join(__dirname, '../../uploads', oldImageRelativePath);
        if (fs.existsSync(oldImagePath)) {
          try {
            fs.unlinkSync(oldImagePath);
            console.log('✅ Deleted old image:', oldImagePath);
          } catch (err) {
            console.error('Error deleting old image:', err);
          }
        }
      }
      
      updateData.image = `/uploads/dealer-images/${req.file.filename}`;
      console.log('✅ Saved new image path:', updateData.image);
      console.log('✅ File saved to:', req.file.path);
    }

    // Update dealer
    const updatedDealer = await Dealer.findByIdAndUpdate(
      dealer._id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      dealer: {
        _id: updatedDealer._id,
        code: updatedDealer.code,
        name: updatedDealer.name,
        image: updatedDealer.image,
        contactPerson: updatedDealer.contactPerson,
        phone: updatedDealer.phone,
        email: updatedDealer.email,
      }
    });
  } catch (error) {
    console.error('Update dealer profile error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update profile'
    });
  }
};

// @desc    Get dealer profile (for app)
// @route   GET /api/app/dealer/profile
// @access  Protected (Dealer)
export const getDealerProfile = async (req, res) => {
  try {
    // Get dealer by username (dealer code)
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }

    res.json({
      success: true,
      dealer: {
        _id: dealer._id,
        code: dealer.code,
        name: dealer.name,
        image: dealer.image,
        contactPerson: dealer.contactPerson,
        phone: dealer.phone,
        email: dealer.email,
        address: dealer.address,
        dealerType: dealer.dealerType,
        creditLimit: dealer.creditLimit,
        creditDays: dealer.creditDays,
      }
    });
  } catch (error) {
    console.error('Get dealer profile error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get profile'
    });
  }
};

