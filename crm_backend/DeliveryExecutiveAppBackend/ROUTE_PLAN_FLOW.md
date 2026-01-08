# Route Plan Feature - Complete Flow

## Overview
Route Plan helps delivery executives follow an optimized delivery sequence for their assigned orders. It works in both **Web (Admin)** and **Mobile App (Delivery Executive)**.

---

## 🔄 Complete Flow

### **Step 1: Create Assignments (Web - Admin)**
1. Admin goes to **Delivery Assignment** page
2. Selects confirmed orders
3. Assigns them to a delivery executive
4. **Result**: `DeliveryAssignment` documents are created in database

### **Step 2: Create Route Plan (Web - Admin)** *(Optional but Recommended)*
1. Admin goes to **Route Plan** page
2. Selects assignments for a delivery executive
3. Clicks "Create Route Plan"
4. System automatically:
   - Optimizes route using GPS coordinates (nearest neighbor algorithm)
   - Creates `DeliveryRoute` document
   - Links assignments to route plan
   - Sets status as `draft`

**API Endpoint**: `POST /api/de/route-plan/create`
```json
{
  "deliveryExecutive": "executive_id",
  "date": "2025-11-19",
  "assignmentIds": ["assignment1_id", "assignment2_id"],
  "optimize": true
}
```

### **Step 3: View Route Plan (Mobile App)**
1. Delivery executive opens app
2. Taps **Route Plan** in hamburger menu
3. App calls: `GET /api/de/route/today`
4. Shows:
   - Route status (draft/active/completed)
   - Optimized delivery sequence
   - Total deliveries count
   - Distance information

### **Step 4: Start Route (Mobile App)**
1. Executive sees route plan with "Start Route" button
2. Taps "Start Route"
3. App calls: `POST /api/de/route/start`
   ```json
   {
     "routeId": "route_id",
     "location": { "latitude": 19.0760, "longitude": 72.8777 }
   }
   ```
4. Route status changes to `active`
5. Start time is recorded

### **Step 5: Follow Route (Mobile App)**
- Executive follows the optimized sequence
- Each delivery in the sequence shows:
  - Order number
  - Dealer name
  - Estimated distance
  - Estimated time

### **Step 6: End Route (Mobile App)**
1. After completing all deliveries
2. Executive taps "End Route"
3. App calls: `POST /api/de/route/end`
   ```json
   {
     "routeId": "route_id",
     "totalDistance": 45.5
   }
   ```
4. Route status changes to `completed`
5. End time and total distance are recorded

---

## 📊 Data Structure

### **DeliveryRoute Model**
```javascript
{
  deliveryExecutive: ObjectId,  // User ID
  date: Date,                   // Route date
  deliveries: [ObjectId],         // Array of DeliveryAssignment IDs
  optimizedRoute: [{
    sequence: Number,            // 1, 2, 3...
    delivery: ObjectId,          // DeliveryAssignment ID
    estimatedTime: Number,       // Minutes
    distance: Number             // Kilometers
  }],
  startTime: Date,              // When route started
  endTime: Date,               // When route ended
  totalDistance: Number,        // Total km traveled
  status: 'draft' | 'active' | 'completed' | 'cancelled',
  notes: String
}
```

---

## 🌐 Web Interface (Admin)

### **Route Plan Page** (`/de-app/route-plan`)
- **View all route plans** with filters:
  - Delivery Executive
  - Status (draft/active/completed)
  - Date range
- **View route details**:
  - Route status
  - Total deliveries
  - Optimized sequence
  - Start/end times
  - Total distance
- **Create route plan** from assignments (via API)

### **API Endpoints (Web)**
- `GET /api/de/route-plan/all` - Get all route plans
- `GET /api/de/route-plan/:routeId` - Get route plan details
- `POST /api/de/route-plan/create` - Create route plan from assignments

---

## 📱 Mobile App Interface

### **Route Plan Screen**
- **View today's route plan**
- **Route status card**:
  - Status badge (draft/active/completed)
  - Date
  - Total deliveries
  - Total distance
- **Action buttons**:
  - "Start Route" (if status is draft)
  - "End Route" (if status is active)
- **Optimized route list**:
  - Sequence number
  - Order number
  - Dealer name
  - Distance
  - Estimated time

### **API Endpoints (Mobile App)**
- `GET /api/de/route/today` - Get today's route plan
- `POST /api/de/route/start` - Start route
- `POST /api/de/route/end` - End route

---

## 🔧 Route Optimization Algorithm

### **Nearest Neighbor Algorithm**
1. Starts with first assignment
2. Finds nearest unvisited assignment
3. Adds to route sequence
4. Repeats until all assignments are added
5. Uses GPS coordinates (priority order):
   - `deliveryLocation` (corrected address)
   - `salesOrder.deliveryLatitude/Longitude`
   - `dealer.latitude/longitude`

### **Distance Calculation**
- Uses **Haversine formula** for accurate distance
- Calculates distance between consecutive stops
- Sums up total estimated distance

---

## 📋 Current Status

### ✅ **What's Working**
- Route plan viewing (web & mobile)
- Route plan creation from assignments
- Route optimization algorithm
- Start/End route functionality
- Route status tracking

### ⚠️ **What's Missing**
- **Automatic route plan creation** when assignments are made
- **Route plan creation UI** in web interface
- **Route editing** functionality
- **Distance calculation** between stops (currently 0)

---

## 🚀 How to Use

### **For Admin (Web)**
1. Assign orders to delivery executive
2. Go to Route Plan page
3. Create route plan for the executive (using API or future UI)
4. Route plan is created with optimized sequence

### **For Delivery Executive (Mobile App)**
1. Open Route Plan from menu
2. View today's route plan
3. Start route when beginning deliveries
4. Follow the optimized sequence
5. End route when all deliveries are complete

---

## 🔗 Integration Points

### **With Delivery Assignments**
- Route plans are created FROM assignments
- Each route plan contains multiple assignments
- Assignments can exist without route plans
- Route plans provide optimized sequence

### **With Collections**
- Collections are recorded per delivery
- Route plan tracks overall route completion
- Collections can be viewed separately

### **With Delivery History**
- Completed routes appear in history
- Route statistics are tracked
- Performance metrics available

---

## 📝 Notes

1. **Route plans are optional** - Executives can deliver without route plans
2. **Route optimization requires GPS coordinates** - Without coordinates, uses alphabetical order
3. **One route plan per executive per day** - Prevents duplicate routes
4. **Route status flow**: `draft` → `active` → `completed`




