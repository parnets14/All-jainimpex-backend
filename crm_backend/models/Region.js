// backend/models/Region.js
import mongoose from "mongoose";

const regionSchema = new mongoose.Schema(
  {
    name: { 
        type: String, 
        required: true, 
        unique: true, 
        trim: true 
    },
  },
  { timestamps: true }
);

const Region = mongoose.model("Region", regionSchema);
export default Region;
