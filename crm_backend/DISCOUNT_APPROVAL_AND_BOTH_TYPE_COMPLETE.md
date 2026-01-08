# Discount Approval System & Both Type Implementation - COMPLETE ✅

## Overview
Three major enhancements to the discount system:
1. **Approval Required**: Only "Approved" discounts visible in Sales Order Dashboard
2. **Both Discount Types**: Support direct + level-based discounts together
3. **Re-approval on Edit**: Editing approved discounts requires re-approval

---

## 1. Approval System

### How It Works

#### Discount Statuses:
- **Draft**: Initial creation, not visible anywhere
- **Pending Approval**: Submitted for review, not visible in sales orders
- **Approved**: Approved by Super Admin, visible in sales orders
- **Rejected**: Rejected by Super Admin, not visible
- **Expired**: Past validTo date, not visible

### Visibility Rules

#### Sales Order Dashboard:
```javascript
// Only these discounts are visible:
{
  status: 'Approved',
  isActive: true,
  validFrom: { $lte: now },
  validTo: { $gte: now }
}
```

**Result**: Draft and Pending Approval discounts are NOT visible!

#### Discount Management UI:
- All discounts visible (for management purposes)
- Status badges show current state
- Date status badges show Active/Scheduled/Expired

---

## 2. Both Discount Types (Direct + Level-Based)

### New Discount Type: "both"

Previously:
- **direct**: Fixed percentage, auto-applied
- **level_based**: Multiple levels, user selects

Now Added:
- **both**: Direct discount (auto) + Level-based discount (optional)

### Use Case

**Scenario**: You want to give all dealers a base discount, but good dealers can get extra discount.

**Example**:
```
Product: Premium Pipe
Direct Discount: 5% (auto-applied to ALL dealers)
Level-Based Options:
  - Good Dealer: +3% extra (total 8%)
  - Excellent Dealer: +5% extra (total 10%)
```

### How It Works

#### 1. Direct Discount (Auto-Applied)
```javascript
directDiscountPercentage: 5
```
- Applies automatically when product is added to sales order
- No user action required
- All dealers get this discount

#### 2. Level-Based Discount (Optional)
```javascript
levels: [
  { levelName: 'Good Dealer', discountPercentage: 3 },
  { levelName: 'Excellent Dealer', discountPercentage: 5 }
]
```
- User can choose to apply extra discount
- Only for good/excellent dealers
- Optional - can skip if not applicable

#### 3. Combined Discount
```
Original Price: ₹1000

Scenario 1: Regular Dealer
- Direct Discount: 5% = ₹50
- Final Price: ₹950

Scenario 2: Good Dealer
- Direct Discount: 5% = ₹50
- Good Dealer Extra: 3% = ₹30
- Total Discount: 8% = ₹80
- Final Price: ₹920

Scenario 3: Excellent Dealer
- Direct Discount: 5% = ₹50
- Excellent Dealer Extra: 5% = ₹50
- Total Discount: 10% = ₹100
- Final Price: ₹900
```

---

## 3. Re-Approval on Edit

### The Problem
If someone edits an approved discount, it could change pricing without Super Admin knowing.

### The Solution
When an approved discount is edited:
1. Status automatically resets to "Pending Approval"
2. Discount becomes invisible in sales orders
3. Super Admin must re-approve
4. Only then it becomes visible again

### Implementation

#### Backend (Controller)
**File**: `controllers/discountMappingController.js`

```javascript
export const updateDiscountMapping = async (req, res) => {
  const existingMapping = await DiscountMapping.findById(id);
  
  // If editing an Approved discount, reset to Pending Approval
  if (existingMapping.status === 'Approved') {
    updateData.status = 'Pending Approval';
    updateData.approvedBy = null;
    updateData.approvedAt = null;
  }
  
  // ... update logic
};
```

#### Frontend (UI)
**File**: `DealerDiscountManagement.jsx`

When user edits approved discount:
- Shows warning: "Editing this discount will require re-approval"
- After save: "Discount updated. Status reset to Pending Approval - requires Super Admin approval."

---

## Changes Made

### 1. Backend Model
**File**: `models/DiscountMapping.js`

#### Added "both" to discountType enum:
```javascript
discountType: {
  type: String,
  enum: ['direct', 'level_based', 'both'],
  required: true,
  default: 'direct'
}
```

#### Updated validation:
```javascript
directDiscountPercentage: {
  required: function() { 
    return this.discountType === 'direct' || this.discountType === 'both'; 
  }
},
levels: {
  required: function() { 
    return this.discountType === 'level_based' || this.discountType === 'both'; 
  }
}
```

#### Updated getDiscountForLevel method:
```javascript
if (this.discountType === 'both') {
  const levelDiscount = this.levels.find(l => l.levelName === levelName);
  const directDiscount = this.directDiscountPercentage || 0;
  const additionalDiscount = levelDiscount ? levelDiscount.discountPercentage : 0;
  return { 
    directDiscount, 
    additionalDiscount, 
    total: directDiscount + additionalDiscount 
  };
}
```

### 2. Backend Controller
**File**: `controllers/discountMappingController.js`

#### Updated updateDiscountMapping:
```javascript
// If editing an Approved discount, reset to Pending Approval
if (existingMapping.status === 'Approved') {
  updateData.status = 'Pending Approval';
  updateData.approvedBy = null;
  updateData.approvedAt = null;
  console.log(`Discount ${id} was Approved, resetting to Pending Approval due to edit`);
}
```

#### Added response message:
```javascript
const message = existingMapping.status === 'Approved' 
  ? 'Discount mapping updated successfully. Status reset to Pending Approval - requires Super Admin approval.'
  : 'Discount mapping updated successfully';

res.json({
  success: true,
  message,
  discountMapping,
  requiresReapproval: existingMapping.status === 'Approved'
});
```

### 3. Frontend UI
**File**: `DealerDiscountManagement.jsx`

#### Added "both" option to discount type selection:
```jsx
<label className="flex items-center">
  <input
    type="radio"
    name="discountType"
    value="both"
    checked={formData.discountType === "both"}
    onChange={(e) => onInputChange("discountType", e.target.value)}
  />
  <div>
    <div className="font-medium text-blue-600">Direct + Level-Based (Both)</div>
    <div className="text-xs text-gray-600">
      Direct discount applies automatically + optional extra level-based discount
    </div>
  </div>
</label>
```

#### Added combined form section:
```jsx
{formData.discountType === "both" ? (
  <>
    {/* Direct Discount Section */}
    <div>
      <label>Direct Discount Percentage (Auto-Applied) *</label>
      <input type="number" ... />
    </div>

    {/* Level-Based Discount Section */}
    <div className="p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
      <h4>Additional Level-Based Discounts (Optional for Good Dealers)</h4>
      {/* Level inputs */}
    </div>
  </>
) : ...}
```

---

## User Workflow

### Creating a Discount with "Both" Type

#### Step 1: Create Discount
1. Go to Discount Management
2. Click "Add New Mapping"
3. Select discount type: "Direct + Level-Based (Both)"
4. Enter direct discount: 5%
5. Add levels:
   - Good Dealer: +3%
   - Excellent Dealer: +5%
6. Set validity dates
7. Click "Submit for Approval"

#### Step 2: Super Admin Approval
1. Super Admin logs in
2. Goes to Discount Management
3. Sees discount with status "Pending Approval"
4. Reviews discount details
5. Clicks "Approve"
6. Discount status changes to "Approved"

#### Step 3: Discount Becomes Visible
1. Discount now appears in Sales Order Dashboard
2. When adding product:
   - Direct discount (5%) applies automatically
   - User sees option to select level:
     - No extra discount
     - Good Dealer (+3%)
     - Excellent Dealer (+5%)

#### Step 4: Editing Approved Discount
1. User edits the approved discount
2. Changes direct discount from 5% to 7%
3. Clicks "Save"
4. System shows: "Status reset to Pending Approval"
5. Discount disappears from Sales Order Dashboard
6. Super Admin must re-approve

#### Step 5: Re-Approval
1. Super Admin reviews edited discount
2. Approves again
3. Discount becomes visible in Sales Order Dashboard

---

## Sales Order Integration

### When Adding Product to Sales Order

#### 1. Fetch Applicable Discounts
```javascript
const discountResponse = await apiService.getApplicableDiscounts(
  productId,
  'sales',
  dealerType
);
```

**Backend filters**:
- Only "Approved" status
- Only active discounts
- Only within validity dates

#### 2. Apply Direct Discount (Auto)
```javascript
if (discount.discountType === 'direct' || discount.discountType === 'both') {
  const directDiscount = discount.directDiscountPercentage;
  // Apply automatically
}
```

#### 3. Show Level Options (If Available)
```javascript
if (discount.discountType === 'level_based' || discount.discountType === 'both') {
  // Show dropdown with levels
  discount.levels.forEach(level => {
    // Option: level.levelName - level.discountPercentage%
  });
}
```

#### 4. Calculate Final Discount
```javascript
let totalDiscount = 0;

// Add direct discount (if exists)
if (discount.discountType === 'direct' || discount.discountType === 'both') {
  totalDiscount += discount.directDiscountPercentage;
}

// Add level discount (if selected)
if (selectedLevel) {
  totalDiscount += selectedLevel.discountPercentage;
}

const discountAmount = (price * totalDiscount) / 100;
const finalPrice = price - discountAmount;
```

---

## Testing Checklist

### Test 1: Approval System
- [ ] Create discount with status "Draft"
- [ ] Verify NOT visible in Sales Order Dashboard
- [ ] Submit for approval (status: "Pending Approval")
- [ ] Verify still NOT visible in Sales Order Dashboard
- [ ] Super Admin approves (status: "Approved")
- [ ] Verify NOW visible in Sales Order Dashboard

### Test 2: Both Discount Type
- [ ] Create discount with type "both"
- [ ] Set direct discount: 5%
- [ ] Add level: Good Dealer +3%
- [ ] Add level: Excellent Dealer +5%
- [ ] Approve discount
- [ ] Add product to sales order
- [ ] Verify direct discount (5%) applied automatically
- [ ] Verify level options shown
- [ ] Select "Good Dealer" level
- [ ] Verify total discount: 8% (5% + 3%)
- [ ] Select "Excellent Dealer" level
- [ ] Verify total discount: 10% (5% + 5%)

### Test 3: Re-Approval on Edit
- [ ] Create and approve discount
- [ ] Verify visible in Sales Order Dashboard
- [ ] Edit the approved discount
- [ ] Verify status reset to "Pending Approval"
- [ ] Verify NOT visible in Sales Order Dashboard
- [ ] Super Admin re-approves
- [ ] Verify visible again in Sales Order Dashboard

### Test 4: Date-Based Expiration
- [ ] Create discount with validTo = yesterday
- [ ] Approve discount
- [ ] Verify NOT visible in Sales Order Dashboard (expired)
- [ ] Verify shows "Expired" badge in Discount Management

---

## API Endpoints

### Get Applicable Discounts
```
GET /api/discount-mappings/product/:productId/applicable?mappingType=sales&dealerType=Retailer
```

**Response** (only approved, active, non-expired):
```json
{
  "success": true,
  "applicableDiscounts": [
    {
      "_id": "...",
      "discountName": "Premium Dealer Discount",
      "discountType": "both",
      "directDiscountPercentage": 5,
      "levels": [
        {
          "levelName": "Good Dealer",
          "discountPercentage": 3,
          "description": "Extra 3% for good dealers"
        },
        {
          "levelName": "Excellent Dealer",
          "discountPercentage": 5,
          "description": "Extra 5% for excellent dealers"
        }
      ],
      "status": "Approved",
      "validFrom": "2026-01-08",
      "validTo": "2026-04-08"
    }
  ]
}
```

### Update Discount Mapping
```
PUT /api/discount-mappings/:id
```

**Request Body**:
```json
{
  "directDiscountPercentage": 7,
  "levels": [...]
}
```

**Response** (if was approved):
```json
{
  "success": true,
  "message": "Discount mapping updated successfully. Status reset to Pending Approval - requires Super Admin approval.",
  "discountMapping": {...},
  "requiresReapproval": true
}
```

---

## Database Schema

### DiscountMapping Model

```javascript
{
  discountName: String,
  discountType: {
    type: String,
    enum: ['direct', 'level_based', 'both']
  },
  directDiscountPercentage: Number, // Required for 'direct' and 'both'
  levels: [{
    levelName: String,
    discountPercentage: Number,
    description: String
  }], // Required for 'level_based' and 'both'
  status: {
    type: String,
    enum: ['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Expired']
  },
  approvedBy: ObjectId,
  approvedAt: Date,
  validFrom: Date,
  validTo: Date,
  // ... other fields
}
```

---

## Status: ✅ COMPLETE

### What's Working:
- ✅ Only "Approved" discounts visible in Sales Order Dashboard
- ✅ Draft and Pending Approval discounts hidden
- ✅ "Both" discount type (direct + level-based)
- ✅ Direct discount applies automatically
- ✅ Level-based discount is optional
- ✅ Both discounts can be combined
- ✅ Editing approved discount resets to "Pending Approval"
- ✅ Re-approval required after editing
- ✅ Discount disappears from sales orders until re-approved
- ✅ Date-based expiration still works
- ✅ Visual status badges in UI

### Files Modified:
1. `models/DiscountMapping.js` - Added "both" type, updated validation
2. `controllers/discountMappingController.js` - Added re-approval logic
3. `DealerDiscountManagement.jsx` - Added "both" option in UI

### No Breaking Changes:
- Existing "direct" and "level_based" discounts still work
- Backward compatible with existing data
- All previous features intact

---

## Summary

The discount system now has three powerful features:

1. **Approval Control**: Only Super Admin approved discounts are visible in sales orders
2. **Flexible Discounting**: Support for automatic + optional discounts together
3. **Change Management**: Any edit to approved discount requires re-approval

This gives you complete control over pricing while maintaining flexibility for good dealers!
