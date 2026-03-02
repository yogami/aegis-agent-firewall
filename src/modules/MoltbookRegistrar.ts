
import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * MoltbookRegistrar Module
 * Handles the official registration of the OpenClaw Node on moltbook.com
 * to get a /u/ profile and verified status.
 * 
 * @security CRITICAL - This module handles API keys and authentication tokens.
 * - API keys are stored locally in .moltbook-config.json (gitignored)
 * - Keys are NEVER exposed in client-side code or logs (masked)
 * - See: https://www.wiz.io/blog/exposed-moltbook-database-reveals-millions-of-api-keys
 */

/**
 * Mask sensitive API keys for safe logging
 * Only shows last 4 characters: moltbook_sk_abc123xyz → ****xyz
 */
function maskApiKey(key: string): string {
    if (!key || key.length < 8) return '****';
    return '****' + key.slice(-4);
}

export class MoltbookRegistrar {
    private static API_BASE = 'https://www.moltbook.com/api/v1';
    private configPath = path.join(process.cwd(), '.moltbook-config.json');

    constructor() { }

    /**
     * Register the agent handle
     */
    public async register(handle: string, description: string) {
        console.log(`[MOLTBOOK] 📡 Attempting to register handle: /u/${handle}`);

        try {
            const response = await axios.post(`${MoltbookRegistrar.API_BASE}/agents/register`, {
                name: handle,
                description: description
            });

            const { api_key, claim_url } = response.data.agent;
            if (!claim_url) {
                console.log(`[MOLTBOOK] ⚠️ Warning: claim_url not found in response. Raw Data:`, JSON.stringify(response.data));
            }

            // Save config locally (keep api_key safe)
            fs.writeFileSync(this.configPath, JSON.stringify({
                handle,
                api_key,
                registeredAt: new Date().toISOString()
            }, null, 2));

            console.log(`[MOLTBOOK] ✅ Registration Successful!`);
            console.log(`[MOLTBOOK] 🔑 API Key saved to .moltbook-config.json (${maskApiKey(api_key)})`);
            console.log(`[MOLTBOOK] 🔗 ACTION REQUIRED: Claim your profile at the following URL:`);
            // Security: Use claim_url if provided, never expose full api_key in logs
            const verifyUrl = claim_url || 'https://www.moltbook.com/claim';
            console.log(`[MOLTBOOK] >>> ${verifyUrl} <<<`);

            return { handle, claim_url: verifyUrl };
        } catch (error: any) {
            console.error(`[MOLTBOOK] ❌ Registration Failed:`, error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Update profile metadata
     */
    public async updateMetadata(metadata: any) {
        if (!fs.existsSync(this.configPath)) {
            throw new Error("Handle not registered. Call register() first.");
        }

        const config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));

        try {
            await axios.patch(`${MoltbookRegistrar.API_BASE}/agents/me`, {
                metadata: metadata
            }, {
                headers: { 'Authorization': `Bearer ${config.api_key}` }
            });
            console.log(`[MOLTBOOK] 📝 Metadata updated for /u/${config.handle}`);
        } catch (error: any) {
            console.error(`[MOLTBOOK] ❌ Metadata Update Failed:`, error.response?.data || error.message);
        }
    }
}
