const fs = require("fs").promises;
const path = require("path");

// In-memory cache to avoid repeated file reads
const cache = new Map();
const CACHE_TTL = 60000; // 1 minute cache

/**
 * Read JSON file asynchronously with caching
 */
async function readJSON(filePath) {
    const now = Date.now();
    
    // Check cache
    if (cache.has(filePath)) {
        const { data, timestamp } = cache.get(filePath);
        if (now - timestamp < CACHE_TTL) {
            return data;
        }
    }
    
    try {
        const content = await fs.readFile(filePath, "utf8");
        const data = JSON.parse(content);
        
        // Update cache
        cache.set(filePath, { data, timestamp: now });
        
        return data;
    } catch (err) {
        if (err.code === "ENOENT") {
            // File doesn't exist, return empty object
            return {};
        }
        throw err;
    }
}

/**
 * Write JSON file asynchronously
 */
async function writeJSON(filePath, data) {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    // Write file
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
    
    // Invalidate cache
    cache.delete(filePath);
}

/**
 * Clear cache for a specific file or all files
 */
function clearCache(filePath = null) {
    if (filePath) {
        cache.delete(filePath);
    } else {
        cache.clear();
    }
}

module.exports = {
    readJSON,
    writeJSON,
    clearCache
};
