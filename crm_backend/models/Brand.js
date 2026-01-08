import mongoose from 'mongoose';

const brandSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Brand name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  // PERMANENT STRUCTURE (Required)
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  subcategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subcategory',
    required: true
  },
  // OPTIONAL EXTENDED SUBCATEGORIES (5 levels)
  subcategory1: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExtendedSubcategory',
    required: false
  },
  subcategory2: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExtendedSubcategory',
    required: false
  },
  subcategory3: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExtendedSubcategory',
    required: false
  },
  subcategory4: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExtendedSubcategory',
    required: false
  },
  subcategory5: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExtendedSubcategory',
    required: false
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Compound index for unique brand names per subcategory
brandSchema.index({ name: 1, subcategory: 1 }, { unique: true });

// Add text search index
brandSchema.index({ name: 'text', description: 'text' });

// Method to get full hierarchy path as string
brandSchema.methods.getFullHierarchyPath = function() {
  // This will be populated with actual names when needed
  return this.name;
};

export default mongoose.model('Brand', brandSchema);