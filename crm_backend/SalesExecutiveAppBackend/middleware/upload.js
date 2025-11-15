import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create uploads directory inside crm_backend (same as main CRM)
const uploadsDir = path.join(__dirname, '../../uploads');
const selfiesDir = path.join(uploadsDir, 'selfies');
const receiptsDir = path.join(uploadsDir, 'receipts');
const expensesDir = path.join(uploadsDir, 'expenses');
const visitsDir = path.join(uploadsDir, 'visits');

console.log('📁 Upload paths configured:');
console.log('  __dirname:', __dirname);
console.log('  uploadsDir:', uploadsDir);
console.log('  selfiesDir:', selfiesDir);

[uploadsDir, selfiesDir, receiptsDir, expensesDir, visitsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath = selfiesDir;
    
    // Determine upload path based on field name
    if (file.fieldname === 'receipt') {
      uploadPath = receiptsDir;
    } else if (file.fieldname === 'bill' || file.fieldname === 'document') {
      uploadPath = expensesDir;
    } else if (file.fieldname === 'visitImage') {
      uploadPath = visitsDir;
    }
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  // Accept images only
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// Upload middleware
export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Helper for single file upload
export const uploadSingle = (fieldName) => upload.single(fieldName);

// Error handling middleware for multer
export const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Multer-specific errors
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size is 5MB.'
      });
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`
    });
  } else if (err) {
    // Other errors
    return res.status(400).json({
      success: false,
      message: err.message || 'File upload failed'
    });
  }
  next();
};
