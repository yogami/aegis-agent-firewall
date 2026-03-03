/**
 * Threat Store — The "Flywheel" Persistence Layer
 *
 * Every blocked payload generates a threat signature that is persisted
 * to an append-only JSONL file with enterprise-grade rotation.
 * On startup, these signatures are loaded into memory for instant recognition.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const THREAT_FILE = path.resolve(process.cwd(), 'semaproof_threats.jsonl');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB (Enterprise Standard)
const MAX_ROTATED_FILES = 5;

/** @type {Map<string, {reason: string, timestamp: number, count: number}>} */
const threatSignatures = new Map();

/** Parse a single JSONL line into a threat entry, or return null */
function parseThreatLine(line) {
    try {
        return JSON.parse(line);
    } catch { return null; }
}

/** Store a parsed entry into the in-memory map */
function storeEntry(entry) {
    threatSignatures.set(entry.hash, {
        reason: entry.reason,
        timestamp: entry.timestamp,
        count: entry.count || 1
    });
}

/** 
 * Rotate threat files: .jsonl -> .jsonl.1 -> .jsonl.2 ...
 */
function rotateFiles() {
    for (let i = MAX_ROTATED_FILES - 1; i >= 0; i--) {
        const oldFile = i === 0 ? THREAT_FILE : `${THREAT_FILE}.${i}`;
        const newFile = `${THREAT_FILE}.${i + 1}`;
        if (fs.existsSync(oldFile)) {
            if (i + 1 >= MAX_ROTATED_FILES) {
                fs.unlinkSync(oldFile); // Delete oldest
            } else {
                fs.renameSync(oldFile, newFile);
            }
        }
    }
}

/** 
 * Check file size and trigger rotation if needed
 */
function checkRotation() {
    if (fs.existsSync(THREAT_FILE)) {
        const stats = fs.statSync(THREAT_FILE);
        if (stats.size > MAX_FILE_SIZE) {
            console.log(`[THREAT STORE] 📡 File size ${stats.size} exceeds 10MB. Rotating files...`);
            rotateFiles();
        }
    }
}

/**
 * Load existing threat signatures from all rotated files (warm boot).
 */
export function loadThreatStore() {
    let totalLoaded = 0;
    // Load current + all rotated files
    const filesToLoad = [THREAT_FILE];
    for (let i = 1; i < MAX_ROTATED_FILES; i++) {
        filesToLoad.push(`${THREAT_FILE}.${i}`);
    }

    filesToLoad.forEach(file => {
        if (!fs.existsSync(file)) return;
        const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
        const entries = lines.map(parseThreatLine).filter(Boolean);
        entries.forEach(storeEntry);
        totalLoaded += entries.length;
    });

    console.log(`[THREAT STORE] 🛡️ Loaded ${totalLoaded} threat signatures from disk (warm boot)`);
    return totalLoaded;
}

/** Hash a payload into a consistent signature */
function hashPayload(payload) {
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/** Build a threat entry from the payload and context */
function buildThreatEntry(hash, payload, reasons, layer, count) {
    return {
        hash,
        layer,
        reason: reasons.join('; '),
        method: payload.method || 'UNKNOWN',
        endpoint: payload.endpoint || 'UNKNOWN',
        timestamp: Date.now(),
        count
    };
}

/**
 * Record a blocked payload as a threat signature.
 */
export function recordThreat(payload, reasons, layer) {
    checkRotation();

    const hash = hashPayload(payload);
    const existing = threatSignatures.get(hash);
    const count = existing ? existing.count + 1 : 1;
    const entry = buildThreatEntry(hash, payload, reasons, layer, count);

    threatSignatures.set(hash, { reason: entry.reason, timestamp: entry.timestamp, count });

    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(THREAT_FILE, line);

    return entry;
}

/**
 * Check if a payload hash is already a known threat.
 */
export function isKnownThreat(payload) {
    const hash = hashPayload(payload);
    const sig = threatSignatures.get(hash);
    return sig ? { known: true, signature: { hash, ...sig } } : { known: false };
}

/**
 * Get all threat signatures for the dashboard / API.
 */
export function getThreats(limit = 50) {
    return Array.from(threatSignatures.entries())
        .map(([hash, data]) => ({ hash: hash.substring(0, 16) + '...', ...data }))
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
}

/**
 * Get threat store stats for the dashboard.
 */
export function getThreatStats() {
    const values = Array.from(threatSignatures.values());
    const timestamps = values.map(t => t.timestamp);

    return {
        totalSignatures: threatSignatures.size,
        totalBlocks: values.reduce((sum, t) => sum + t.count, 0),
        oldestThreat: timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : null,
        newestThreat: timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null,
    };
}
