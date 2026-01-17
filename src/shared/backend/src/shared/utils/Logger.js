const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Read LOG_LEVEL at runtime to ensure env vars are loaded
// Default to 'info' if not set
const getCurrentLevel = () => {
  const level = (process.env.LOG_LEVEL || "info").toLowerCase();
  return LOG_LEVELS[level] ?? LOG_LEVELS.info;
};

export const Logger = {
  error: (message, ...args) => {
    const currentLevel = getCurrentLevel();
    if (LOG_LEVELS.error <= currentLevel) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  },

  warn: (message, ...args) => {
    const currentLevel = getCurrentLevel();
    if (LOG_LEVELS.warn <= currentLevel) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  },

  info: (message, ...args) => {
    const currentLevel = getCurrentLevel();
    if (LOG_LEVELS.info <= currentLevel) {
      console.log(`[INFO] ${message}`, ...args);
    }
  },

  debug: (message, ...args) => {
    const currentLevel = getCurrentLevel();
    if (LOG_LEVELS.debug <= currentLevel) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },
};
