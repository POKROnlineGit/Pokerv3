// CommonJS file to load .env.local before ES modules execute
// This runs synchronously via --require flag

const path = require("path");
const fs = require("fs");

// Get absolute path to .env.local (relative to this file's location)
const envPath = path.resolve(__dirname, ".env.local");

// Load .env.local if it exists
if (fs.existsSync(envPath)) {
  try {
    require("dotenv").config({ path: envPath });
    const nodeEnv = process.env.NODE_ENV || "development";
    console.log(
      `✅ Loaded environment variables from .env.local (NODE_ENV: ${nodeEnv})`
    );
  } catch (error) {
    console.error("❌ Error loading .env.local:", error.message);
  }
} else {
  // In production, try to load from .env or use system env vars
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "⚠️  .env.local not found, using system environment variables"
    );
  }
}
