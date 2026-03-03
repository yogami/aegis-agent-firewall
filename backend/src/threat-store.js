/**
 * Threat Store — The "Flywheel" Persistence Layer
 *
 * Every blocked payload generates a threat signature that is persisted
 * to an append-only JSONL file. On startup, these signatures are loaded
 * into the semantic cache for instant warm-boot recognition.
 *
 * This is the "Proprietary Intelligence Flywheel":
 * More attacks → More signatures → Faster cache hits → Better defense
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const THREAT_FILE = path.resolve(process.cwd(), 'semaproof_threats.jsonl');

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
 * Load existing threat signatures from disk on startup (warm boot).
 */
export function loadThreatStore() {
    if (!fs.existsSync(THREAT_FILE)) return 0;

    const lines = fs.readFileSync(THREAT_FILE, 'utf-8').split('\n').filter(Boolean);
    const entries = lines.map(parseThreatLine).filter(Boolean);
    entries.forEach(storeEntry);

    console.log(`[THREAT STORE] 🛡️ Loaded ${entries.length} threat signatures from disk (warm boot)`);
    return entries.length;
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
 * Appends to disk (append-only) and updates in-memory map.
 */
export function recordThreat(payload, reasons, layer) {
    const hash = hashPayload(payload);
    const existing = threatSignatures.get(hash);
    const count = existing ? existing.count + 1 : 1;
    const entry = buildThreatEntry(hash, payload, reasons, layer, count);

    threatSignatures.set(hash, { reason: entry.reason, timestamp: entry.timestamp, count });

    const line = JSON.stringify(entry) + '\n';
    fs.appendFile(THREAT_FILE, line, (err) => {
        if (err) console.error('[THREAT STORE] Write error:', err.message);
    });

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
