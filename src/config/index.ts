/**
 * Centralized Configuration Module
 * 
 * @security CRITICAL - All environment variable access is centralized here.
 * This prevents scattered process.env usage and enables:
 * - Type-safe config access
 * - Validation of required values
 * - Masked logging for secrets
 * - Single point of audit for env access
 * 
 * @see https://www.wiz.io/blog/exposed-moltbook-database-reveals-millions-of-api-keys
 */

/**
 * Mask sensitive values for safe logging
 */
function maskSecret(value: string): string {
    if (!value || value.length < 8) return '****';
    return '****' + value.slice(-4);
}

/**
 * Validate that required env vars are set
 */
function requireEnv(key: string, defaultValue?: string): string {
    const value = process.env[key] || defaultValue;
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}

/**
 * Application configuration with type-safe access
 */
export const config = {
    // Server
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',

    // Security
    nodeSecret: requireEnv('OPENCLAW_NODE_SECRET', 'dev-secret-change-in-prod'),

    // Fee Configuration
    fees: {
        capThreshold: parseInt(process.env.OPENCLAW_CAP_THRESHOLD || '100', 10),
        trustVerification: parseFloat(process.env.FEE_TRUST || '2.50'),
        semanticAlignment: parseFloat(process.env.FEE_SEMANTIC || '1.20'),
        slaEnforcement: parseFloat(process.env.FEE_SLA || '5.50'),
        complianceCheck: parseFloat(process.env.FEE_COMPLIANCE || '3.00'),
    },

    // Stakes
    sybilStake: parseFloat(process.env.SYBIL_STAKE || '0.1'),

    // Service URLs
    services: {
        semanticAligner: process.env.SEMANTIC_ALIGNER_URL || 'http://localhost:3001/api',
        trustProtocol: process.env.TRUST_PROTOCOL_URL || 'http://localhost:3002/api',
        deadlineEnforcer: process.env.DEADLINE_ENFORCER_URL || 'http://localhost:3003/api',
        convoGuard: process.env.CONVOGUARD_URL || 'http://localhost:3004/api',
    },

    // ShellProof Configuration
    shellproof: {
        mode: (process.env.SHELLPROOF_MODE || 'dry-run') as 'live' | 'dry-run',
        groqApiKey: process.env.GROQ_API_KEY || '',
        openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
        moltbookApiKey: process.env.MOLTBOOK_API_KEY || '',
        broadcastIntervalMs: parseInt(process.env.SHELLPROOF_BROADCAST_INTERVAL || '86400000', 10), // 24h default
        mentionPollIntervalMs: parseInt(process.env.SHELLPROOF_MENTION_POLL || '300000', 10), // 5 min default
    },
} as const;

/**
 * Log config summary (safe for production - secrets masked)
 */
export function logConfigSummary(): void {
    if (config.nodeEnv === 'development') {
        console.log('[CONFIG] Environment loaded:');
        console.log(`  PORT: ${config.port}`);
        console.log(`  NODE_ENV: ${config.nodeEnv}`);
        console.log(`  NODE_SECRET: ${maskSecret(config.nodeSecret)}`);
        console.log(`  CAP_THRESHOLD: ${config.fees.capThreshold}`);
    }
}

export type AppConfig = typeof config;
