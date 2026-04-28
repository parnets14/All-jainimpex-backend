import { dealerSchema } from '../../models/Dealer.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Multer config ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/dealer-images');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `dealer-${suffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed!'), false);
  },
});

export const uploadProfileImage = upload.single('image');

// ── Validation helpers ────────────────────────────────────────────────────────
const PAN_REGEX   = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// @desc    Update dealer profile (name, image, gst, pan)
// @route   PUT /api/app/dealer/profile
export const updateDealerProfile = async (req, res) => {
  try {
    const Dealer = req.dbConnection.models.Dealer || req.dbConnection.model('Dealer', dealerSchema);
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const updateData = {};

    // ── Name ──────────────────────────────────────────────────────────────────
    if (req.body.name !== undefined) {
      const name = req.body.name.trim();
      if (name.length < 3) {
        return res.status(400).json({ success: false, message: 'Name must be at least 3 characters' });
      }
      const dup = await Dealer.findOne({
        _id: { $ne: dealer._id },
        name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });
      if (dup) return res.status(400).json({ success: false, message: 'Another dealer with this name already exists' });
      updateData.name = name;
    }

    // ── GST / GSTIN ───────────────────────────────────────────────────────────
    if (req.body.gst !== undefined) {
      const gst = req.body.gst.trim().toUpperCase();
      if (gst && !GSTIN_REGEX.test(gst)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid GSTIN format. Expected: 29ABCDE1234A1Z5 (15 characters)',
        });
      }
      updateData.gst = gst;
    }

    // ── PAN ───────────────────────────────────────────────────────────────────
    if (req.body.pan !== undefined) {
      const pan = req.body.pan.trim().toUpperCase();
      if (pan && !PAN_REGEX.test(pan)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid PAN format. Expected: ABCDE1234A (5 letters + 4 digits + 1 letter)',
        });
      }
      updateData.pan = pan;
    }

    // ── Profile image ─────────────────────────────────────────────────────────
    if (req.file) {
      if (dealer.image) {
        const oldPath = path.join(__dirname, '../../uploads', dealer.image.replace('/uploads/', ''));
        if (fs.existsSync(oldPath)) {
          try { fs.unlinkSync(oldPath); } catch (e) { console.error('Error deleting old image:', e); }
        }
      }
      updateData.image = `/uploads/dealer-images/${req.file.filename}`;
    }

    if (Object.keys(updateData).length === 0) {
      return res.json({ success: true, message: 'No changes to save', dealer: { _id: dealer._id, code: dealer.code, name: dealer.name } });
    }

    const updated = await Dealer.findByIdAndUpdate(dealer._id, updateData, { new: true, runValidators: false });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      dealer: {
        _id:           updated._id,
        code:          updated.code,
        name:          updated.name,
        image:         updated.image,
        gst:           updated.gst,
        pan:           updated.pan,
        contactPerson: updated.contactPerson,
        phone:         updated.phone,
        email:         updated.email,
      },
    });
  } catch (error) {
    console.error('updateDealerProfile error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get dealer profile
// @route   GET /api/app/dealer/profile
export const getDealerProfile = async (req, res) => {
  try {
    const Dealer = req.dbConnection.models.Dealer || req.dbConnection.model('Dealer', dealerSchema);
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    res.json({
      success: true,
      dealer: {
        _id:           dealer._id,
        code:          dealer.code,
        name:          dealer.name,
        image:         dealer.image,
        gst:           dealer.gst,
        pan:           dealer.pan,
        contactPerson: dealer.contactPerson,
        phone:         dealer.phone,
        email:         dealer.email,
        address:       dealer.address,
        dealerType:    dealer.dealerType,
        creditLimit:   dealer.creditLimit,
        creditDays:    dealer.creditDays,
      },
    });
  } catch (error) {
    console.error('getDealerProfile error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Save FCM token for push notifications
// @route   POST /api/app/dealer/fcm-token
export const saveFcmToken = async (req, res) => {
  try {
    const Dealer = req.dbConnection.models.Dealer || req.dbConnection.model('Dealer', dealerSchema);
    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ success: false, message: 'FCM token is required' });

    const dealer = await Dealer.findOneAndUpdate(
      { code: req.user.username },
      { fcmToken },
      { new: true }
    );
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    res.json({ success: true, message: 'FCM token saved' });
  } catch (error) {
    console.error('saveFcmToken error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
