import { createClient } from "redis";
import { Logger } from "../../shared/utils/Logger.js";

let redisClient = null;

// Initialize Redis client if REDIS_URL is provided
if (process.env.REDIS_URL) {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL,
    });

    redisClient.on("error", (err) => {
      Logger.warn("Redis Client Error:", err);
    });

    redisClient.on("connect", () => {
      Logger.info("Redis Client Connected");
    });

    // Connect asynchronously (don't block server startup)
    redisClient.connect().catch((err) => {
      Logger.warn("Redis connection failed:", err);
      redisClient = null;
    });
  } catch (error) {
    Logger.warn("Failed to initialize Redis:", error);
    redisClient = null;
  }
}

export default redisClient;

