import fetch from "node-fetch";

const BASE_URL = "http://localhost:5000/api";

async function testAPI() {
  console.log("🔍 TESTING API ENDPOINTS\n");
  console.log("=".repeat(40));

  try {
    // Test 1: Check if server is running
    console.log("1. Testing server connection...");
    try {
      const response = await fetch(`${BASE_URL}/categories/stats`);
      if (response.ok) {
        const data = await response.json();
        console.log("✅ Server is running");
        console.log("📊 Current stats:", JSON.stringify(data, null, 2));
      } else {
        console.log("❌ Server responded with error:", response.status);
      }
    } catch (error) {
      console.log("❌ Server is not running or not accessible");
      console.log("   Error:", error.message);
      console.log("\n💡 To start the server, run: npm start");
      return;
    }

    // Test 2: Test brand creation
    console.log("\n2. Testing brand creation...");
    try {
      const brandData = {
        name: "Test Brand",
        description: "This is a test brand created by API test",
      };

      const response = await fetch(`${BASE_URL}/brands`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(brandData),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("✅ Brand created successfully");
        console.log("📝 Brand data:", JSON.stringify(result, null, 2));
      } else {
        const error = await response.text();
        console.log("❌ Failed to create brand:", response.status);
        console.log("   Error:", error);
      }
    } catch (error) {
      console.log("❌ Error creating brand:", error.message);
    }

    // Test 3: List brands
    console.log("\n3. Testing brand listing...");
    try {
      const response = await fetch(`${BASE_URL}/brands`);
      if (response.ok) {
        const data = await response.json();
        console.log("✅ Brands retrieved successfully");
        console.log("📋 Brands:", JSON.stringify(data, null, 2));
      } else {
        console.log("❌ Failed to retrieve brands:", response.status);
      }
    } catch (error) {
      console.log("❌ Error retrieving brands:", error.message);
    }
  } catch (error) {
    console.error("❌ Unexpected error:", error);
  }
}

// Run the test
testAPI();
