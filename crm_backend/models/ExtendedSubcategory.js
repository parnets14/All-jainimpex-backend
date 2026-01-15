import mongoose from "mongoose";

const extendedSubcategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Extended subcategory name is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    // PERMANENT STRUCTURE (Required)
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: [true, "Brand is required"],
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    subcategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subcategory",
      required: true,
    },
    // PARENT EXTENDED SUBCATEGORY (Optional - for nested levels)
    parentExtendedSubcategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExtendedSubcategory",
      required: false,
    },
    // LEVEL (1-5, where 1 is first extended level after subcategory)
    level: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for unique names per parent level
extendedSubcategorySchema.index(
  {
    name: 1,
    category: 1,
    subcategory: 1,
    parentExtendedSubcategory: 1,
  },
  { unique: true }
);

// Add text search index
extendedSubcategorySchema.index({ name: "text", description: "text" });

// Index for level-based queries
extendedSubcategorySchema.index({ level: 1 });

// Index for brand-based filtering
extendedSubcategorySchema.index({ brand: 1 });

// Method to get full hierarchy path
extendedSubcategorySchema.methods.getFullPath = async function () {
  const path = [this.name];
  let current = this;

  // Traverse up the extended subcategory chain
  while (current.parentExtendedSubcategory) {
    current = await mongoose
      .model("ExtendedSubcategory")
      .findById(current.parentExtendedSubcategory);
    if (current) {
      path.unshift(current.name);
    }
  }

  // Add subcategory, category, and brand
  const subcategory = await mongoose
    .model("Subcategory")
    .findById(this.subcategory);
  const category = await mongoose.model("Category").findById(this.category);
  const brand = await mongoose.model("Brand").findById(this.brand);

  if (subcategory) path.unshift(subcategory.name);
  if (category) path.unshift(category.name);
  if (brand) path.unshift(brand.name);

  return path.join(" → ");
};

// Static method to get children of a parent
extendedSubcategorySchema.statics.getChildren = function (
  parentId,
  brandId,
  categoryId,
  subcategoryId
) {
  return this.find({
    parentExtendedSubcategory: parentId,
    brand: brandId,
    category: categoryId,
    subcategory: subcategoryId,
    status: "active",
  }).sort({ name: 1 });
};

// Static method to get all items at a specific level
extendedSubcategorySchema.statics.getByLevel = function (
  level,
  brandId,
  categoryId,
  subcategoryId,
  parentId = null
) {
  const query = {
    level: level,
    brand: brandId,
    category: categoryId,
    subcategory: subcategoryId,
    status: "active",
  };

  if (level === 1) {
    query.parentExtendedSubcategory = null;
  } else if (parentId) {
    query.parentExtendedSubcategory = parentId;
  }

  return this.find(query).sort({ name: 1 });
};

export default mongoose.model("ExtendedSubcategory", extendedSubcategorySchema);
