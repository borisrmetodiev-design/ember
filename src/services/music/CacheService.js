// CacheService — local file cache for music tracks
// Hashed filenames, metadata store, auto-cleanup

const fs   = require("fs");
const fsp  = require("fs").promises;
const path = require("path");
const crypto = require("crypto");

const { CACHE } = require("../../utils/music/constants");

const CACHE_DIR  = path.join(process.cwd(), CACHE.DIR);
const META_PATH  = path.join(CACHE_DIR, "metadata.json");

// ─── Internal helpers ────────────────────────────────────────────────────────

function hashUrl(url) {
    return crypto.createHash("sha256").update(url).digest("hex").slice(0, 32);
}

function ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}

async function loadMeta() {
    try {
        const raw = await fsp.readFile(META_PATH, "utf8");
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

async function saveMeta(meta) {
    try {
        ensureCacheDir();
        await fsp.writeFile(META_PATH, JSON.stringify(meta, null, 2), "utf8");
    } catch (err) {
        console.error("[CacheService] Failed to save metadata:", err.message);
    }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Check if a URL is cached and the file exists.
 * @param {string} url
 * @returns {string|null} absolute file path if cached, else null
 */
async function get(url) {
    try {
        const meta = await loadMeta();
        const key  = hashUrl(url);
        const entry = meta[key];
        if (!entry) return null;

        // Check expiry
        if (Date.now() - entry.cachedAt > CACHE.MAX_AGE_MS) {
            // Expired — remove asynchronously
            remove(url).catch(() => {});
            return null;
        }

        // Check file exists
        const filePath = path.join(CACHE_DIR, entry.filename);
        if (!fs.existsSync(filePath)) {
            delete meta[key];
            await saveMeta(meta);
            return null;
        }

        return filePath;
    } catch (err) {
        console.error("[CacheService] get error:", err.message);
        return null;
    }
}

/**
 * Register a cached file in the metadata store.
 * @param {string} url
 * @param {string} filePath - absolute path where file was saved
 * @param {object} trackMeta - { title, artist, duration }
 */
async function set(url, filePath, trackMeta = {}) {
    try {
        const meta = await loadMeta();
        const key  = hashUrl(url);
        const filename = path.basename(filePath);

        meta[key] = {
            url,
            filename,
            cachedAt: Date.now(),
            ...trackMeta,
        };

        await saveMeta(meta);
    } catch (err) {
        console.error("[CacheService] set error:", err.message);
    }
}

/**
 * Remove a cached entry and its file.
 * @param {string} url
 */
async function remove(url) {
    try {
        const meta = await loadMeta();
        const key  = hashUrl(url);
        const entry = meta[key];
        if (entry) {
            const filePath = path.join(CACHE_DIR, entry.filename);
            if (fs.existsSync(filePath)) {
                await fsp.unlink(filePath).catch(() => {});
            }
            delete meta[key];
            await saveMeta(meta);
        }
    } catch (err) {
        console.error("[CacheService] remove error:", err.message);
    }
}

/**
 * Get the expected file path for a URL (before it exists).
 * @param {string} url
 * @param {string} ext - file extension (default: 'webm')
 * @returns {string}
 */
function getExpectedPath(url, ext = "webm") {
    ensureCacheDir();
    return path.join(CACHE_DIR, `${hashUrl(url)}.${ext}`);
}

/**
 * Auto-cleanup: remove all expired entries and their files.
 */
async function cleanup() {
    try {
        ensureCacheDir();
        const meta = await loadMeta();
        const now  = Date.now();
        let changed = false;

        for (const [key, entry] of Object.entries(meta)) {
            if (now - entry.cachedAt > CACHE.MAX_AGE_MS) {
                const filePath = path.join(CACHE_DIR, entry.filename);
                if (fs.existsSync(filePath)) {
                    await fsp.unlink(filePath).catch(() => {});
                }
                delete meta[key];
                changed = true;
            }
        }

        if (changed) {
            await saveMeta(meta);
            console.log("[CacheService] Cleanup complete.");
        }
    } catch (err) {
        console.error("[CacheService] cleanup error:", err.message);
    }
}

/**
 * Remove oldest entries until cache is under MAX_SIZE_MB.
 */
async function enforceSizeLimit() {
    try {
        ensureCacheDir();
        const meta = await loadMeta();
        const maxBytes = CACHE.MAX_SIZE_MB * 1024 * 1024;

        const entries = Object.entries(meta).map(([key, entry]) => {
            const filePath = path.join(CACHE_DIR, entry.filename);
            let size = 0;
            try {
                size = fs.statSync(filePath).size;
            } catch {}
            return { key, entry, filePath, size, cachedAt: entry.cachedAt || 0 };
        });

        let totalSize = entries.reduce((sum, e) => sum + e.size, 0);
        if (totalSize <= maxBytes) return;

        entries.sort((a, b) => a.cachedAt - b.cachedAt);

        let changed = false;
        for (const item of entries) {
            if (totalSize <= maxBytes) break;
            if (fs.existsSync(item.filePath)) {
                await fsp.unlink(item.filePath).catch(() => {});
            }
            delete meta[item.key];
            totalSize -= item.size;
            changed = true;
        }

        if (changed) {
            await saveMeta(meta);
            console.log("[CacheService] Size limit enforced.");
        }
    } catch (err) {
        console.error("[CacheService] enforceSizeLimit error:", err.message);
    }
}

// Run cleanup on startup
(async () => {
    try {
        ensureCacheDir();
        await cleanup();
        await enforceSizeLimit();
        console.log("[CacheService] Initialised. Cache dir:", CACHE_DIR);
    } catch (err) {
        console.error("[CacheService] Init error:", err.message);
    }
})();

module.exports = { get, set, remove, getExpectedPath, cleanup, enforceSizeLimit };
