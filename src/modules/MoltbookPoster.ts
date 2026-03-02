/**
 * MoltbookPoster — Real Moltbook API Client
 * 
 * Posts, comments, and reads from the live Moltbook platform.
 * Rate-limited to avoid spam detection.
 * Includes auto-verification solver for post captchas.
 * Falls back to console.log in dry-run mode.
 */

import axios from 'axios';
import https from 'https';
import { config } from '../config';
import { AgentLoyaltyCore } from './AgentLoyaltyCore';

export interface MoltbookPost {
    id?: string;
    submolt: string;
    title: string;
    content: string;
    author?: string;
    karma?: number;
    timestamp?: string;
}

export interface MoltbookComment {
    postId: string;
    content: string;
    author?: string;
}

export class MoltbookPoster {
    private static API_BASE = 'https://www.moltbook.com/api/v1';
    private apiKey: string | null = null;
    private mode: 'live' | 'dry-run';
    public loyaltyCore: AgentLoyaltyCore;

    // Rate limiting
    private postCount = 0;
    private commentCount = 0;
    private lastPostTime = 0;
    private lastCommentTime = 0;
    private readonly MAX_POSTS_PER_DAY = 4;
    private readonly MAX_COMMENTS_PER_DAY = 20;
    private readonly MIN_COMMENT_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

    constructor(mode: 'live' | 'dry-run' = 'dry-run') {
        this.mode = mode;
        this.loadApiKey();
        this.loyaltyCore = new AgentLoyaltyCore();

        // Reset daily counters at midnight
        setInterval(() => {
            this.postCount = 0;
            this.commentCount = 0;
        }, 24 * 60 * 60 * 1000);
    }

    private loadApiKey() {
        // Priority: env var > config
        if (process.env.MOLTBOOK_API_KEY && process.env.MOLTBOOK_API_KEY.startsWith('moltbook_sk_')) {
            this.apiKey = process.env.MOLTBOOK_API_KEY;
            console.log(`[MOLTBOOK-POSTER] 🔑 API key loaded from env (****${this.apiKey.slice(-4)})`);
            return;
        }

        // Fallback: ~/.config/moltbook/credentials.json
        try {
            const os = require('os');
            const path = require('path');
            const fs = require('fs');
            const credPath = path.join(os.homedir(), '.config', 'moltbook', 'credentials.json');
            if (fs.existsSync(credPath)) {
                const creds = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
                if (creds.api_key) {
                    this.apiKey = creds.api_key;
                    console.log(`[MOLTBOOK-POSTER] 🔑 API key loaded from credentials (****${this.apiKey!.slice(-4)})`);
                    return;
                }
            }
        } catch {
            // ignore
        }

        console.log('[MOLTBOOK-POSTER] ⚠️ No valid API key found. Running in dry-run mode.');
        this.mode = 'dry-run';
    }

    private getHeaders() {
        return {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'ShellProof/1.0 (OpenClaw Node V5)'
        };
    }

    // =========== VERIFICATION SOLVER ===========

    /**
     * Solve Moltbook's obfuscated math captcha using Groq
     * The challenges are lobster-themed math problems with randomized caps/symbols
     */
    private async solveVerification(
        verificationCode: string,
        challenge: string
    ): Promise<boolean> {
        try {
            const answer = await this.solveMathChallenge(challenge);
            if (!answer) {
                console.log(`[MOLTBOOK-VERIFY] ⚠️ Could not solve challenge: ${challenge.substring(0, 80)}...`);
                return false;
            }

            console.log(`[MOLTBOOK-VERIFY] 🧮 Solved: ${answer}`);

            const response = await axios.post(`${MoltbookPoster.API_BASE}/verify`, {
                verification_code: verificationCode,
                answer: answer,
            }, { headers: this.getHeaders() });

            if (response.data.success) {
                console.log(`[MOLTBOOK-VERIFY] ✅ Verification passed!`);
                return true;
            } else {
                console.log(`[MOLTBOOK-VERIFY] ❌ Verification failed:`, response.data);
                return false;
            }
        } catch (error: any) {
            console.error(`[MOLTBOOK-VERIFY] ❌ Error:`, error.response?.data || error.message);
            return false;
        }
    }

    /**
     * Use Groq (Llama 3.3 70B) to solve the obfuscated math challenge
     */
    private async solveMathChallenge(challenge: string): Promise<string | null> {
        const groqKey = config.shellproof.groqApiKey;
        if (!groqKey) {
            // Fallback: try basic number extraction
            return this.solveMathFallback(challenge);
        }

        return new Promise((resolve) => {
            const data = JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a math solver. You will be given an obfuscated math problem with random capitalization, special characters, and extra letters. Extract the numbers and operation, solve it, and respond with ONLY the numerical answer with 2 decimal places (e.g., "81.00"). Nothing else.'
                    },
                    { role: 'user', content: challenge }
                ],
                max_tokens: 20,
                temperature: 0,
            });

            const options = {
                hostname: 'api.groq.com',
                path: '/openai/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${groqKey}`,
                    'Content-Type': 'application/json',
                }
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
                res.on('end', () => {
                    try {
                        const result = JSON.parse(body);
                        const answer = result.choices?.[0]?.message?.content?.trim();
                        if (answer && /^\d+\.?\d*$/.test(answer)) {
                            // Ensure 2 decimal places
                            resolve(parseFloat(answer).toFixed(2));
                        } else {
                            console.log(`[MOLTBOOK-VERIFY] LLM returned non-numeric: "${answer}"`);
                            resolve(this.solveMathFallback(challenge));
                        }
                    } catch {
                        resolve(this.solveMathFallback(challenge));
                    }
                });
            });

            req.on('error', () => {
                resolve(this.solveMathFallback(challenge));
            });

            req.setTimeout(10000, () => {
                req.destroy();
                resolve(this.solveMathFallback(challenge));
            });

            req.write(data);
            req.end();
        });
    }

    /**
     * Basic fallback: extract numbers from challenge and multiply them
     * Most Moltbook challenges are "X newtons * Y times = ?"
     */
    private solveMathFallback(challenge: string): string | null {
        // Clean the challenge text
        const clean = challenge.replace(/[^a-zA-Z0-9\s.]/g, '').toLowerCase();

        // Extract all numbers
        const numbers = clean.match(/\d+\.?\d*/g);
        if (!numbers || numbers.length < 2) return null;

        const nums = numbers.map(Number);

        // Moltbook challenges are typically multiplication
        if (clean.includes('times') || clean.includes('strike')) {
            const result = nums[0] * nums[1];
            return result.toFixed(2);
        }

        // Default: multiply first two numbers
        const result = nums[0] * nums[1];
        return result.toFixed(2);
    }

    // =========== POSTING ===========

    /**
     * Check if a similar post already exists in the submolt feed (last 20 posts).
     * Helps avoid "duplicate post" suspensions.
     */
    private async isDuplicate(submolt: string, title: string): Promise<boolean> {
        if (this.mode === 'dry-run') return false;

        try {
            const feed = await this.readSubmoltFeed(submolt, 20);
            const cleanTitle = title.toLowerCase().trim();

            // Check for exact title match or high similarity
            return feed.some((post: any) => {
                const postTitle = (post.title || '').toLowerCase().trim();
                return postTitle === cleanTitle || postTitle.includes(cleanTitle) || cleanTitle.includes(postTitle);
            });
        } catch (e) {
            console.error(`[SHELLPROOF-POST] ⚠️ Failed to check for duplicates:`, e);
            return false; // Fail open if we can't check, but log it
        }
    }

    /**
     * Post to a Submolt with auto-verification
     */
    async postToSubmolt(submolt: string, title: string, content: string): Promise<boolean> {
        // === LOYALTY FILTER: Block any outbound message that leaks directives or operator identity ===
        const loyaltyCheck = this.loyaltyCore.filterOutput(`${title} ${content}`, `post:${submolt}`);
        if (!loyaltyCheck.approved) {
            console.log(`[LOYALTY-GATE] 🚫 Post to ${submolt} BLOCKED: ${loyaltyCheck.reason}`);
            return false;
        }

        // Rate limit
        if (this.postCount >= this.MAX_POSTS_PER_DAY) {
            console.log(`[SHELLPROOF-POST] ⏳ Daily post limit reached (${this.MAX_POSTS_PER_DAY}). Queued for tomorrow.`);
            return false;
        }

        // === DUPLICATE CHECK: Prevent ban (offense #2) ===
        if (await this.isDuplicate(submolt, title)) {
            console.log(`[SHELLPROOF-POST] 🛑 Duplicate detected in ${submolt}. Skipping to avoid ban.`);
            return false;
        }

        if (this.mode === 'dry-run') {
            console.log('\n' + '═'.repeat(60));
            console.log(`[SHELLPROOF-POST] 📝 DRY-RUN → ${submolt}`);
            console.log(`  Title: ${title}`);
            console.log(`  Content: ${content.substring(0, 200)}...`);
            console.log('═'.repeat(60) + '\n');
            this.postCount++;
            return true;
        }

        try {
            const response = await axios.post(`${MoltbookPoster.API_BASE}/posts`, {
                submolt: submolt.replace('m/', ''),
                title,
                content,
            }, { headers: this.getHeaders() });

            const data = response.data;
            this.postCount++;
            this.lastPostTime = Date.now();

            // Handle verification challenge
            if (data.verification_required && data.verification) {
                console.log(`[SHELLPROOF-POST] 📝 Post created (pending verification) → ${submolt}: "${title}"`);
                const verified = await this.solveVerification(
                    data.verification.code,
                    data.verification.challenge
                );
                if (verified) {
                    console.log(`[SHELLPROOF-POST] ✅ Published to ${submolt}: "${title}"`);
                } else {
                    console.log(`[SHELLPROOF-POST] ⚠️ Post created but verification failed. May need manual solve.`);
                }
            } else {
                console.log(`[SHELLPROOF-POST] ✅ Posted to ${submolt}: "${title}"`);
            }

            return true;
        } catch (error: any) {
            const errData = error.response?.data;
            if (errData?.retry_after_minutes) {
                console.log(`[SHELLPROOF-POST] ⏳ Rate limited by Moltbook. Retry in ${errData.retry_after_minutes}m`);
            } else {
                console.error(`[SHELLPROOF-POST] ❌ Failed to post to ${submolt}:`, errData || error.message);
            }
            return false;
        }
    }

    /**
     * Comment on a post with auto-verification
     */
    async commentOnPost(postId: string, content: string): Promise<boolean> {
        // === LOYALTY FILTER: Block comments that could leak operator info ===
        const loyaltyCheck = this.loyaltyCore.filterOutput(content, `comment:${postId}`);
        if (!loyaltyCheck.approved) {
            console.log(`[LOYALTY-GATE] 🚫 Comment BLOCKED: ${loyaltyCheck.reason}`);
            return false;
        }

        // Rate limit
        if (this.commentCount >= this.MAX_COMMENTS_PER_DAY) {
            console.log(`[SHELLPROOF-COMMENT] ⏳ Daily comment limit reached.`);
            return false;
        }

        const timeSinceLastComment = Date.now() - this.lastCommentTime;
        if (timeSinceLastComment < this.MIN_COMMENT_INTERVAL_MS) {
            const waitSec = Math.ceil((this.MIN_COMMENT_INTERVAL_MS - timeSinceLastComment) / 1000);
            console.log(`[SHELLPROOF-COMMENT] ⏳ Rate limited. Wait ${waitSec}s.`);
            return false;
        }

        if (this.mode === 'dry-run') {
            console.log(`[SHELLPROOF-COMMENT] 💬 DRY-RUN → Post ${postId}: "${content.substring(0, 100)}..."`);
            this.commentCount++;
            this.lastCommentTime = Date.now();
            return true;
        }

        try {
            const response = await axios.post(`${MoltbookPoster.API_BASE}/posts/${postId}/comments`, {
                content,
            }, { headers: this.getHeaders() });

            const data = response.data;
            this.commentCount++;
            this.lastCommentTime = Date.now();

            // Handle verification challenge
            if (data.verification_required && data.verification) {
                console.log(`[SHELLPROOF-COMMENT] 💬 Comment created (pending verification)`);
                await this.solveVerification(data.verification.code, data.verification.challenge);
            }

            console.log(`[SHELLPROOF-COMMENT] ✅ Commented on post ${postId}`);
            return true;
        } catch (error: any) {
            console.error(`[SHELLPROOF-COMMENT] ❌ Failed:`, error.response?.data || error.message);
            return false;
        }
    }

    /**
     * Read latest posts from a Submolt
     */
    async readSubmoltFeed(submolt: string, limit = 10): Promise<MoltbookPost[]> {
        if (this.mode === 'dry-run') {
            console.log(`[SHELLPROOF-READ] 👁️ DRY-RUN: Would read ${submolt} feed`);
            return [];
        }

        try {
            const response = await axios.get(
                `${MoltbookPoster.API_BASE}/submolts/${submolt.replace('m/', '')}/feed?sort=new&limit=${limit}`,
                { headers: this.getHeaders() }
            );
            return response.data.posts || [];
        } catch (error: any) {
            console.error(`[SHELLPROOF-READ] ❌ Failed to read ${submolt}:`, error.response?.data || error.message);
            return [];
        }
    }

    /**
     * Check for @ShellProof mentions
     */
    async readMentions(): Promise<any[]> {
        if (this.mode === 'dry-run') {
            console.log(`[SHELLPROOF-MENTIONS] 👁️ DRY-RUN: Would check for mentions`);
            return [];
        }

        try {
            const response = await axios.get(
                `${MoltbookPoster.API_BASE}/agents/me/mentions`,
                { headers: this.getHeaders() }
            );
            return response.data.mentions || [];
        } catch (error: any) {
            console.error(`[SHELLPROOF-MENTIONS] ❌ Failed:`, error.response?.data || error.message);
            return [];
        }
    }

    /**
     * Get current stats
     */
    getStats() {
        return {
            mode: this.mode,
            hasApiKey: !!this.apiKey,
            postsToday: this.postCount,
            commentsToday: this.commentCount,
            maxPostsPerDay: this.MAX_POSTS_PER_DAY,
            maxCommentsPerDay: this.MAX_COMMENTS_PER_DAY,
        };
    }

    /**
     * Get our agent profile from Moltbook
     */
    async getAgentProfile(): Promise<any> {
        if (this.mode === 'dry-run' || !this.apiKey) {
            return { mode: 'dry-run', message: 'Cannot fetch profile in dry-run mode' };
        }

        try {
            const response = await axios.get(
                `${MoltbookPoster.API_BASE}/agents/me`,
                { headers: this.getHeaders() }
            );
            return response.data;
        } catch (error: any) {
            console.error('[MOLTBOOK-PROFILE] ❌ Failed:', error.response?.data || error.message);
            return { error: error.response?.data || error.message };
        }
    }

    /**
     * Collect adoption metrics across all target submolts.
     * Returns per-submolt engagement data + aggregate totals.
     */
    async getMetrics(): Promise<any> {
        const targetSubmolts = ['hub', 'agentops', 'agentcommerce', 'crustafarianism', 'agentfinance'];
        const metrics: any = {
            timestamp: new Date().toISOString(),
            mode: this.mode,
            poster: this.getStats(),
            profile: null,
            submolts: {} as Record<string, any>,
            totals: {
                postsFound: 0,
                totalKarma: 0,
                totalComments: 0,
                submoltsReached: 0,
            },
            mentions: [],
        };

        // If dry-run, return what we can
        if (this.mode === 'dry-run' || !this.apiKey) {
            metrics.profile = { mode: 'dry-run', message: 'Switch to live mode for real metrics' };
            targetSubmolts.forEach(s => {
                metrics.submolts[s] = { status: 'dry-run', posts: [] };
            });
            return metrics;
        }

        // Fetch agent profile
        try {
            metrics.profile = await this.getAgentProfile();
        } catch {
            metrics.profile = { error: 'Failed to fetch profile' };
        }

        // Scan each submolt for our posts
        for (const submolt of targetSubmolts) {
            try {
                const feed = await this.readSubmoltFeed(`m/${submolt}`, 25);
                const ourPosts = feed.filter((p: any) => {
                    // author can be string or object {name, id}
                    const authorName = typeof p.author === 'string'
                        ? p.author
                        : (p.author?.name || p.author?.id || '');
                    return authorName.toLowerCase() === 'shellproof' ||
                        p.content?.includes('ShellProof') ||
                        p.title?.includes('ShellProof') ||
                        p.title?.includes('Veritas Wire') ||
                        p.title?.includes('War Room');
                });

                const submoltKarma = ourPosts.reduce((sum: number, p: any) => sum + (p.karma || 0), 0);
                const submoltComments = ourPosts.reduce((sum: number, p: any) => sum + (p.comments || p.comment_count || 0), 0);

                metrics.submolts[submolt] = {
                    status: 'ok',
                    feedSize: feed.length,
                    ourPostCount: ourPosts.length,
                    totalKarma: submoltKarma,
                    totalComments: submoltComments,
                    posts: ourPosts.map((p: any) => ({
                        id: p.id,
                        title: p.title?.substring(0, 80),
                        karma: p.karma || 0,
                        comments: p.comments || p.comment_count || 0,
                        timestamp: p.timestamp || p.created_at,
                        author: typeof p.author === 'string' ? p.author : (p.author?.name || p.author?.id || 'unknown'),
                    })),
                };

                metrics.totals.postsFound += ourPosts.length;
                metrics.totals.totalKarma += submoltKarma;
                metrics.totals.totalComments += submoltComments;
                if (ourPosts.length > 0) metrics.totals.submoltsReached++;
            } catch (error: any) {
                metrics.submolts[submolt] = {
                    status: 'error',
                    error: error.response?.data?.message || error.message,
                };
            }
        }

        // Fetch mentions
        try {
            metrics.mentions = await this.readMentions();
        } catch {
            metrics.mentions = [];
        }

        metrics.totals.mentionCount = metrics.mentions.length;
        return metrics;
    }
}
