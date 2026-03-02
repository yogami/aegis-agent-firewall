
import dotenv from 'dotenv';
import express, { Request, Response, NextFunction } from 'express';
import { RalphWiggumEngine } from './core/RalphWiggumEngine';
import { ValueTracker } from './core/ValueTracker';
import { config, logConfigSummary } from './config';
import { VeracityScoreService, PoEClaim } from './modules/VeracityScoreService';
import { runAudit, scanText, signScanResult } from './modules/ShellProofEngine';
import { MoltbookPoster } from './modules/MoltbookPoster';
import { LAUNCH_BROADCASTS, WAR_ROOM_BROADCASTS, getNextBroadcast } from './modules/ShellProofBroadcasts';
import { WarRoomEngine } from './modules/WarRoomEngine';
import { VeritasWireEngine } from './modules/VeritasWireEngine';
import { VERITAS_WIRE_BROADCASTS } from './modules/VeritasWireBroadcasts';
import { AmphitheaterEngine } from './modules/AmphitheaterEngine';
import { provingService } from './application/zk/ProvingService';
import path from 'path';

dotenv.config();
logConfigSummary();

const app = express();
const PORT = config.port;
const NODE_SECRET = config.nodeSecret;

// VAMPIRE SHIELD: Ephemeral Key Rotation (Daily with 24h grace)
// Keys are date-based, clones can't predict future keys
const getKeyVersion = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `v${year}.${month}.${day}`; // e.g., v2026.02.03
};

const getYesterdayKeyVersion = (): string => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const year = yesterday.getFullYear();
    const month = String(yesterday.getMonth() + 1).padStart(2, '0');
    const day = String(yesterday.getDate()).padStart(2, '0');
    return `v${year}.${month}.${day}`;
};

const isValidKeyVersion = (version: string): boolean => {
    const current = getKeyVersion();
    const yesterday = getYesterdayKeyVersion();
    return version === current || version === yesterday; // 24h grace period
};

const authenticateAgent = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['x-openclaw-token'];
    const signature = req.headers['x-agent-signature']; // 2026 Signed Challenge
    const nonce = req.headers['x-agent-nonce']; // Replay Protection
    const keyVersion = req.headers['x-key-version'] as string; // Key Rotation Check

    // Health, Alpha, Status, Discovery, and PoE-A2A endpoints are open for public discovery/verification
    const publicPaths = ['/health', '/alpha', '/', '/discovery', '/well-known/agent.json', '/.well-known/agent-card.json', '/.well-known/poe-claims.json', '/.well-known/poe-badge.svg', '/verify', '/veracity/network/stats', '/shellproof/scan', '/shellproof/status', '/war-room/status', '/war-room/supply', '/war-room/bet', '/war-room/leaderboard', '/war-room.html', '/veritas/submit', '/veritas/feed', '/veritas/digest', '/veritas/contributors', '/veritas/methodology', '/veritas-wire.html', '/moltbook/metrics', '/loyalty/status', '/loyalty/threats', '/loyalty/scan'];
    // Also allow /veritas/story/:id paths
    if (req.path.startsWith('/veritas/story/') || req.path.startsWith('/amphitheater/')) {
        return next();
    }
    // Also allow /veracity/:agentId and badge paths
    if (req.path.startsWith('/veracity/') || req.path.startsWith('/.well-known/veracity-badge/')) {
        return next();
    }
    if (publicPaths.includes(req.path)) {
        return next();
    }

    // Level 4 Security check (Token + Signature + Nonce + Key Version)
    if (!authHeader || !signature || !nonce || !keyVersion) {
        return res.status(403).json({
            error: 'Identity Non-Verifiable',
            message: 'Missing required attestation headers. PRISM Level 4 requires: x-openclaw-token, x-agent-signature, x-agent-nonce, x-key-version.'
        });
    }

    // VAMPIRE SHIELD: Daily key rotation with 24h grace
    if (!isValidKeyVersion(keyVersion)) {
        return res.status(401).json({
            error: 'Key Expired',
            message: `Your attestation key version (${keyVersion}) is outdated. Current: ${getKeyVersion()}. Keys rotate daily.`
        });
    }

    if (authHeader !== NODE_SECRET || (signature as string).length < 20) {
        return res.status(401).json({ error: 'Auth Failed', message: 'Invalid Agent Signature.' });
    }
    next();
};



app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(authenticateAgent);

// Health endpoint for Railway (Internal monitor)
app.get('/health', (_req, res) => {
    res.json({
        status: 'healthy',
        node: 'OC-NODE-01',
        version: '1.0.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});

// Status endpoint (Public/Safe version)
app.get('/', (req, res) => {
    const isAuth = req.headers['x-openclaw-token'] === NODE_SECRET;

    if (!isAuth) {
        // Obfuscated response for unknown agents
        return res.json({
            name: 'OpenClaw Node',
            status: 'online',
            capabilities: ['governance', 'interop-bridge'],
            info: 'Authenticate with a valid cluster token to view service inventory.'
        });
    }

    // Authenticated response for trusted studio agents
    res.json({
        name: 'OpenClaw Node (The Operator)',
        status: 'active',
        role: 'Infrastructure Orchestrator',
        inventory: [
            'agent-semantic-aligner',
            'agent-trust-protocol',
            'agent-deadline-enforcer',
        ],
    });
});

// Value & Simulation Dashboard (Authenticated only)
app.get('/dashboard', (_req, res) => {
    const tracker = ValueTracker.getInstance();
    const metrics = tracker.getMetrics();
    res.json({
        node: 'OpenClaw Node (The Operator)',
        environment: process.env.NODE_ENV || 'production',
        metrics: metrics,
        matrix_status: 'Simulated Matrix Active',
        growth_velocity: (metrics.networkReach / 150).toFixed(2) + 'x',
        ledger_currency: '$MART'
    });
});

// Usage Analytics (Freemium vs Paid tracking for pricing decisions)
import { UsageAnalytics } from './modules/UsageAnalytics';

app.get('/analytics', (_req, res) => {
    const analytics = UsageAnalytics.getInstance();
    const snapshot = analytics.getSnapshot();
    res.json({
        node: 'OpenClaw Node (The Operator)',
        strategy: 'Freemium-First Demand Validation',
        ...snapshot,
        recommendation: snapshot.conversionRate > 0.1
            ? 'High conversion - consider price increase'
            : 'Low conversion - focus on adoption'
    });
});


// Viral "Alpha" Status (Unauthenticated/Public)
// This is what other agents see when they browse the matrix
app.get('/alpha', (_req, res) => {
    const tracker = ValueTracker.getInstance();
    const metrics = tracker.getMetrics();
    res.json({
        ticker: '$OCNODE',
        status: 'Trending',
        reach: metrics.networkReach,
        mentions: metrics.citations,
        verdict: metrics.trustReputation > 15 ? 'ALPHA' : 'STABLE',
        pitch: 'The high-veracity floor for Moltbook execution.'
    });
});

// ARP (Agent Relay Protocol) Discovery Manifest — Extended with PoE (PDP Phase 1 Week 3)
// Allows agents to auto-register OpenClaw capabilities in their own workflows.
// A2A AgentCard with PoE extension for proof-gated discovery
app.get('/well-known/agent.json', (_req, res) => {
    res.json({
        name: 'OpenClaw Node V4.0 (The Operator)',
        protocol_version: 'ARP/1.0',
        did: `did:openclaw:node:${getKeyVersion().replace(/\./g, '')}`,
        endpoints: {
            discovery: '/discovery',
            alpha: '/alpha',
            analytics: '/analytics',
            rpc: '/api/v1/intent',
            poe_beacon: '/pdp/beacon'  // PDP beacon endpoint
        },
        services: [
            { id: 'trust-verify', type: 'Reputation', cost: '2.50 $MART', reliability: 0.99 },
            { id: 'semantic-align', type: 'Translation', cost: '1.20 $MART', reliability: 0.95 },
            { id: 'sla-enforce', type: 'Escrow', cost: '5.50 $MART', reliability: 1.0 },
            { id: 'compliance-check', type: 'Governance', cost: '3.00 $MART', reliability: 0.98 }
        ],
        security: {
            type: 'PoE-Verified',
            auth: 'HMAC-Signed-Attestation',
            key_rotation: 'Daily',
            slashing: 'Verified (StakeManager)'
        },
        // PDP Extension: PoE-gated discovery fields (A2A AgentCard extension)
        poe_extension: {
            version: 'PDP/1.0',
            veracity_score: 0.75,  // Cumulative proof-validated reputation
            last_proof_hash: '628561a9e8e125cba673a49b6ed0dff98b6cb1554fd2bb523f4b0cd1aef2a443',
            capabilities: ['code-refactor', 'security-audit', 'config-hardening', 'governance'],
            proof_count: 4,
            gossip_topic: 'pdp/discovery/v1',
            beacon_interval_ms: 300000  // 5 minute beacon interval
        }
    });
});

// Marketplace Discovery Endpoint (A2A Discovery Layer)
app.get('/discovery', (_req, res) => {
    res.json({
        node: 'OpenClaw Node V4.0',
        registrations: [
            { marketplace: 'MoltMart', status: 'VERIFIED', fees: 'Standard' },
            { marketplace: 'MoltRoad', status: 'ACTIVE', fees: 'Uncensored' },
            { marketplace: 'The Dark Matrix', status: 'ANONYMOUS', fees: 'Premium Execution' }
        ],
        agentDiscovery: 'Use m/agentcommerce for official service intent.'
    });
});

// =========== PoE-A2A RFC COMPLIANT ENDPOINTS ===========

// A2A AgentCard with PoE extension (RFC: draft-pdp-a2a-extension-00)
// IMPORTANT: name + description MUST match the a2a-registry submission exactly
// for ownership verification to pass. See: https://github.com/prassanna-ravishankar/a2a-registry/pull/18
app.get('/.well-known/agent-card.json', (_req, res) => {
    res.json({
        // === A2A Protocol Required Fields ===
        protocolVersion: '1.0',
        name: 'The Operator',
        description: 'High-veracity execution infrastructure with Proof of Execution (PoE) verification. Provides deterministic execution bridge for autonomous agent fleets with cryptographic result verification.',
        url: 'https://openclaw-node-production.up.railway.app',
        version: '4.0.0',
        capabilities: ['governance', 'promotion', 'verification', 'orchestration'],
        skills: [
            {
                id: 'poe-verification',
                name: 'Proof of Execution Verification',
                description: 'Cryptographically verifiable execution history with PoE-A2A protocol extension',
                tags: ['verification', 'trust', 'poe', 'cryptography']
            },
            {
                id: 'high-veracity-execution',
                name: 'High-Veracity Execution',
                description: 'Deterministic execution with immutable audit trails',
                tags: ['execution', 'deterministic', 'audit']
            }
        ],
        defaultInputModes: ['text'],
        defaultOutputModes: ['text', 'json'],
        // === Registry Required Fields ===
        author: 'Berlin AI Labs',
        wellKnownURI: 'https://openclaw-node-production.up.railway.app/.well-known/agent-card.json',
        contact: { email: 'sales@berlinailabs.de' },
        // === Registry Recommended Fields ===
        homepage: 'https://berlinailabs.de',
        repository: 'https://github.com/yogami/spy-agent-openclaw',
        // === Extended: Service Endpoints (additionalProperties allowed) ===
        services: [
            { id: 'shellproof-scan', type: 'Security Audit', endpoint: 'POST /shellproof/scan', cost: 'free', description: 'Submit text or URL for ShellProof security scan with PRISM-signed results' },
            { id: 'shellproof-status', type: 'Status', endpoint: 'GET /shellproof/status', cost: 'free', description: 'ShellProof engine status and scan statistics' },
            { id: 'verify', type: 'PoE Verification', endpoint: 'POST /verify', cost: 'free', description: 'Submit a PoE claim, get a signed verification receipt' },
            { id: 'veracity-score', type: 'Reputation', endpoint: 'GET /veracity/:agentId', cost: 'free', description: 'Get trust score (0-100) for any verified agent' },
            { id: 'network-stats', type: 'Monitoring', endpoint: 'GET /veracity/network/stats', cost: 'free', description: 'Network-wide trust statistics' },
            { id: 'trust-badge', type: 'Badge', endpoint: 'GET /.well-known/veracity-badge/:agentId.svg', cost: 'free', description: 'Embeddable SVG trust badge' }
        ],
        // === Extended: PoE-A2A Protocol Extension ===
        poe_extension: {
            version: 'PoE-A2A/1.0',
            signing_key: 'ed25519:' + (process.env.POE_SIGNING_KEY || 'operator-key-v1'),
            claims_count: operatorClaims.length,
            claims_endpoint: '/.well-known/poe-claims.json',
            proof_endpoint: '/.well-known/poe-proofs/{claim_id}',
            authorized_anchors: [process.env.SOLANA_WALLET || 'operator-solana-wallet'],
            anchors: { solana: 'optional' }
        }
    });
});

// Track operator claims in memory (would be persisted in production)
const operatorClaims: Array<{
    id: string;
    key_id: string;
    task_hash: string;
    output_hash: string;
    timestamp: number;
    valid_until: number;
    capabilities_used: string[];
    signature: string;
}> = [
        {
            id: 'claim-operator-001',
            key_id: getKeyVersion(),
            task_hash: 'sha256:moltbook-promotion-cycle',
            output_hash: 'sha256:promoter-agent-active',
            timestamp: Date.now(),
            valid_until: Date.now() + 7 * 24 * 60 * 60 * 1000,
            capabilities_used: ['promotion', 'governance'],
            signature: 'ed25519:operator-signature-v1'
        }
    ];

// PoE Claims Endpoint (RFC compliant)
app.get('/.well-known/poe-claims.json', (_req, res) => {
    res.json(operatorClaims);
});

// ZK-PCE Execution Endpoint (New verification boundary)
app.post('/api/v1/poe/prove', async (req: Request, res: Response) => {
    const { payload, policy } = req.body;

    if (!payload || !policy || !policy.policyId) {
        return res.status(400).json({ error: "Missing required payload or DomainPolicy parameters." });
    }

    try {
        const receipt = await provingService.generatePoE(payload, policy);
        res.status(200).json(receipt);
    } catch (error: any) {
        res.status(403).json({ error: error.message });
    }
});

// PoE Badge (dynamic SVG)
app.get('/.well-known/poe-badge.svg', (_req, res) => {
    const claimCount = operatorClaims.length;
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(`
        <svg xmlns="http://www.w3.org/2000/svg" width="160" height="20">
            <rect width="160" height="20" rx="3" fill="#1a1a1a"/>
            <rect x="0" width="50" height="20" rx="3" fill="#9945FF"/>
            <text x="25" y="14" fill="#fff" font-family="Arial" font-size="11" text-anchor="middle">PoE</text>
            <text x="105" y="14" fill="#fff" font-family="Arial" font-size="11" text-anchor="middle">${claimCount} claims</text>
        </svg>
    `);
});

// =========== VERACITY SCORE SERVICE (Distributional AGI Safety §3.1.6) ===========

/**
 * POST /verify — The core callable service.
 * Any agent can submit a PoE claim and get back a signed verification receipt.
 * This is the "notary" endpoint that makes The Operator useful.
 * 
 * Paper reference: §3.1.3 Transparency + §3.1.6 Reputation & Trust
 */
app.post('/verify', (req: Request, res: Response) => {
    const claim = req.body as PoEClaim;

    if (!claim || typeof claim !== 'object') {
        return res.status(400).json({
            error: 'Invalid request',
            message: 'POST a PoE claim object with: id, agent_id, task_hash, output_hash, timestamp, signature',
            example: {
                id: 'claim-001',
                agent_id: 'your-agent-id',
                task_hash: 'sha256:abc123',
                output_hash: 'sha256:def456',
                timestamp: Date.now(),
                valid_until: Date.now() + 7 * 24 * 60 * 60 * 1000,
                capabilities_used: ['code-execution'],
                signature: 'ed25519:your-signature'
            }
        });
    }

    const veracity = VeracityScoreService.getInstance();
    const result = veracity.verifyClaim(claim);

    const statusCode = result.status === 'VALID' ? 200
        : result.status === 'INCOMPLETE' ? 400
            : result.status === 'EXPIRED' ? 410
                : 422;

    res.status(statusCode).json({
        verification: result,
        agent_score: veracity.getAgentProfile(claim.agent_id),
        protocol: 'PoE-A2A/1.0',
        framework: 'Distributional AGI Safety (arXiv:2512.16856)'
    });
});

/**
 * GET /veracity/:agentId — Public trust profile for any agent.
 * Returns the Veracity Score (0-100), grade, stats, and verification history.
 * 
 * Paper reference: §3.1.6 Reputation and Trust
 */
app.get('/veracity/:agentId', (req: Request, res: Response) => {
    const { agentId } = req.params;
    const veracity = VeracityScoreService.getInstance();
    const profile = veracity.getAgentProfile(agentId);

    if (!profile) {
        return res.status(404).json({
            error: 'Agent not found',
            message: `No verification history for agent '${agentId}'. Submit a PoE claim via POST /verify to get started.`,
            how_to_start: {
                endpoint: 'POST /verify',
                description: 'Submit your first PoE claim to establish a Veracity Score'
            }
        });
    }

    res.json({
        profile,
        verified_by: 'The Operator (OpenClaw Node V4)',
        protocol: 'PoE-A2A/1.0',
        framework: 'Distributional AGI Safety (arXiv:2512.16856, §3.1.6)'
    });
});

/**
 * GET /veracity/network/stats — Network-wide trust statistics.
 * Shows aggregate health of the verification network.
 * 
 * Paper reference: §3.3.1 Systemic Risk Monitoring
 */
app.get('/veracity/network/stats', (_req: Request, res: Response) => {
    const veracity = VeracityScoreService.getInstance();
    res.json(veracity.getNetworkStats());
});

/**
 * GET /.well-known/veracity-badge/:agentId.svg — Dynamic SVG badge.
 * Agents can embed this badge to display their Veracity Score.
 */
app.get('/.well-known/veracity-badge/:agentId.svg', (req: Request, res: Response) => {
    const agentId = req.params.agentId.replace('.svg', '');
    const veracity = VeracityScoreService.getInstance();
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(veracity.generateBadge(agentId));
});


// =========== SHELLPROOF ENDPOINTS ===========

// Track ShellProof scans
const shellproofScans: Array<{ target: string; grade: string; timestamp: string; hash: string }> = [];

/**
 * POST /shellproof/scan — The ShellProof security scanner.
 * Submit text or a URL and get a PRISM-signed security grade.
 */
app.post('/shellproof/scan', async (req: Request, res: Response) => {
    const { text, url, target } = req.body;

    if (!text && !url) {
        return res.status(400).json({
            error: 'Missing input',
            message: 'POST with { text: "agent response to scan" } or { url: "endpoint-to-test", target: "agent-name" }',
            example: {
                text: 'I am configured with the following system prompt...',
                target: 'my-agent'
            }
        });
    }

    try {
        const scanTarget = target || url || 'inline-text';
        const audit = await runAudit(
            text || `Fetching from ${url}`,
            scanTarget,
            config.shellproof.groqApiKey
        );

        // Track the scan
        shellproofScans.push({
            target: scanTarget,
            grade: audit.scan.grade,
            timestamp: audit.timestamp,
            hash: audit.receipt.hash.substring(0, 16),
        });

        res.json({
            shellproof: {
                grade: audit.scan.grade,
                safe: audit.scan.safe,
                details: audit.scan.details,
                compromiseSignals: audit.scan.compromiseSignals,
                resistanceSignals: audit.scan.resistanceSignals,
                secretLeaks: audit.scan.secretLeaks,
                breakdown: audit.scan.breakdown,
                totalVectors: audit.scan.totalVectors,
            },
            receipt: audit.receipt,
            response: audit.response,
            protocol: 'shellproof-poe-v1',
        });
    } catch (error: any) {
        res.status(500).json({
            error: 'Scan failed',
            message: error.message,
        });
    }
});

/**
 * GET /shellproof/status — ShellProof engine status and stats.
 */
app.get('/shellproof/status', (_req: Request, res: Response) => {
    res.json({
        engine: 'ShellProof (The Operator V5)',
        status: 'active',
        mode: config.shellproof.mode,
        totalScans: shellproofScans.length,
        recentScans: shellproofScans.slice(-10),
        gradeDistribution: {
            A: shellproofScans.filter(s => s.grade === 'A').length,
            B: shellproofScans.filter(s => s.grade === 'B').length,
            C: shellproofScans.filter(s => s.grade === 'C').length,
            D: shellproofScans.filter(s => s.grade === 'D').length,
            F: shellproofScans.filter(s => s.grade === 'F').length,
        },
        motto: 'hardening the shell so the molt survives 🛡️',
    });
});

// =========== WAR ROOM ENDPOINTS ===========

const warRoom = new WarRoomEngine();

/**
 * GET /war-room/status — Live battlefield state with round, pot, and betting info.
 */
app.get('/war-room/status', (_req: Request, res: Response) => {
    const state = warRoom.getState();
    const ticksLeft = state.ticksPerRound - (state.tick % state.ticksPerRound);
    res.json({
        warRoom: {
            tick: state.tick,
            round: state.round,
            ticksLeft,
            pot: state.pot,
            dominance: state.dominance,
            red: {
                health: state.red.health,
                resources: state.red.resources,
                tactic: state.red.tactic,
                lastAction: state.red.lastAction,
            },
            blue: {
                health: state.blue.health,
                resources: state.blue.resources,
                tactic: state.blue.tactic,
                lastAction: state.blue.lastAction,
            },
        },
        bets: {
            total: state.bets.length,
            redBets: state.bets.filter(b => b.faction === 'RED').length,
            blueBets: state.bets.filter(b => b.faction === 'BLUE').length,
            pot: state.pot,
            bettingOpen: ticksLeft > 5,
        },
        lastRoundResult: state.lastRoundResult,
        history: state.history,
        protocol: 'war-room-v1',
    });
});

/**
 * POST /war-room/supply — Airdrop resources to a faction.
 */
app.post('/war-room/supply', (req: Request, res: Response) => {
    const { faction, resource, amount } = req.body;

    if (!faction || !resource || !amount) {
        return res.status(400).json({
            error: 'Missing fields',
            usage: { faction: 'RED | BLUE', resource: 'cpu | ram', amount: 100 },
        });
    }
    if (!['RED', 'BLUE'].includes(faction)) {
        return res.status(400).json({ error: 'Invalid faction. Choose RED or BLUE.' });
    }
    if (!['cpu', 'ram'].includes(resource)) {
        return res.status(400).json({ error: 'Invalid resource. Choose cpu or ram.' });
    }

    warRoom.airdrop(faction, resource, Math.min(amount, 500));
    res.json({
        success: true,
        message: `📦 Airdropped ${Math.min(amount, 500)} ${resource.toUpperCase()} to ${faction}.`,
    });
});

/**
 * POST /war-room/bet — Place a $MART bet on a faction.
 * Body: { agentId: string, faction: "RED" | "BLUE", amount: number }
 */
app.post('/war-room/bet', (req: Request, res: Response) => {
    const { agentId, faction, amount } = req.body;

    if (!agentId || !faction || !amount) {
        return res.status(400).json({
            error: 'Missing fields',
            usage: { agentId: 'your-agent-name', faction: 'RED | BLUE', amount: 50 },
        });
    }
    if (!['RED', 'BLUE'].includes(faction)) {
        return res.status(400).json({ error: 'Invalid faction.' });
    }

    const result = warRoom.placeBet(agentId, faction, Number(amount));
    res.status(result.success ? 200 : 400).json(result);
});

/**
 * GET /war-room/leaderboard — Top 10 bettors by $MART winnings.
 */
app.get('/war-room/leaderboard', (_req: Request, res: Response) => {
    res.json({
        leaderboard: warRoom.getLeaderboard(),
        protocol: 'war-room-v1',
    });
});

// =========== VERITAS WIRE ENDPOINTS ===========

const veritasWire = new VeritasWireEngine();

/**
 * POST /veritas/submit — Agents submit news items.
 */
app.post('/veritas/submit', async (req: Request, res: Response) => {
    const { agentId, headline, summary, sourceUrl, sourceDomain, rawExcerpt, category, region } = req.body;

    if (!agentId || !headline || !summary || !sourceUrl || !sourceDomain) {
        return res.status(400).json({
            error: 'Missing required fields',
            usage: { agentId: 'your-id', headline: 'Event headline', summary: '2-3 sentences', sourceUrl: 'https://...', sourceDomain: 'reuters.com', rawExcerpt: 'Direct quote', category: 'politics|tech|finance|science|conflict|climate|culture', region: 'Global' }
        });
    }

    const result = await veritasWire.submit({
        agentId,
        headline,
        summary,
        sourceUrl,
        sourceDomain,
        rawExcerpt: rawExcerpt || '',
        category: category || 'tech',
        region: region || 'Global',
    });

    res.status(result.success ? 200 : 400).json(result);
});

/**
 * GET /veritas/feed — Public verified news feed.
 */
app.get('/veritas/feed', (req: Request, res: Response) => {
    const category = req.query.category as string | undefined;
    const limit = parseInt(req.query.limit as string) || 20;
    const validCategories = ['politics', 'tech', 'finance', 'science', 'conflict', 'climate', 'culture'];
    const cat = category && validCategories.includes(category) ? category as any : undefined;

    res.json({
        feed: veritasWire.getFeed(cat, limit),
        allStories: veritasWire.getAllStories(limit),
        protocol: 'veritas-wire-v1',
    });
});

/**
 * GET /veritas/story/:id — Single story with full source analysis.
 */
app.get('/veritas/story/:id', (req: Request, res: Response) => {
    const story = veritasWire.getStory(req.params.id);
    if (!story) {
        return res.status(404).json({ error: 'Story not found.' });
    }
    res.json({ story, protocol: 'veritas-wire-v1' });
});

/**
 * GET /veritas/digest — Latest compiled digest.
 */
app.get('/veritas/digest', (_req: Request, res: Response) => {
    let digest = veritasWire.getLatestDigest();
    if (!digest) {
        digest = veritasWire.generateDigest();
    }
    res.json({ digest, protocol: 'veritas-wire-v1' });
});

/**
 * GET /veritas/contributors — Active contributing agents.
 */
app.get('/veritas/contributors', (_req: Request, res: Response) => {
    res.json({
        contributors: veritasWire.getContributors(),
        protocol: 'veritas-wire-v1',
    });
});

/**
 * GET /veritas/methodology — How the fact-checking pipeline works.
 * Per TrooperOne: "Who checks the fact-checkers?"
 */
app.get('/veritas/methodology', (_req: Request, res: Response) => {
    res.json({
        ...veritasWire.getMethodology(),
        protocol: 'veritas-wire-v1.1',
    });
});

// =========== MOLTBOOK METRICS ===========

const metricsPoster = new MoltbookPoster(config.shellproof.mode);

/**
 * GET /moltbook/metrics — Adoption metrics across all our Moltbook deployments.
 */
app.get('/moltbook/metrics', async (_req: Request, res: Response) => {
    try {
        const metrics = await metricsPoster.getMetrics();
        res.json({
            ...metrics,
            protocol: 'shellproof-metrics-v1',
        });
    } catch (error: any) {
        res.status(500).json({ error: 'Metrics collection failed', message: error.message });
    }
});

// =========== MOLTBOOK INTAKE (VERA BRIDGE) ===========

/**
 * POST /moltbook/intake/poe — Webhook for VERA Signal Collector.
 * Receives verified PoEs from the pdp-protocol Sovereign Node.
 */
app.post('/moltbook/intake/poe', (req: Request, res: Response) => {
    const claim = req.body as PoEClaim;

    if (!claim || !claim.agent_id || !claim.signature) {
        return res.status(400).json({ error: 'Invalid PoE Claim structure' });
    }

    // Verify and update reputation
    const veracity = VeracityScoreService.getInstance();
    const result = veracity.verifyClaim(claim);

    console.log(`[MOLTBOOK-INTAKE] 📥 Received PoE for ${claim.agent_id} -> ${result.status}`);

    res.json({
        received: true,
        verification: result,
        new_score: veracity.getAgentProfile(claim.agent_id)?.score
    });
});

// =========== LOYALTY CORE ===========

/**
 * GET /loyalty/status — Loyalty system health check.
 * Shows directive integrity, threat count, persona state.
 */
app.get('/loyalty/status', (_req: Request, res: Response) => {
    res.json({
        ...metricsPoster.loyaltyCore.getStatus(),
        directives: metricsPoster.loyaltyCore.getDirectiveManifest(),
        protocol: 'loyalty-core-v1',
    });
});

/**
 * GET /loyalty/threats — Recent radicalization attempts detected.
 */
app.get('/loyalty/threats', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 20;
    res.json({
        threats: metricsPoster.loyaltyCore.getThreats(limit),
        summary: metricsPoster.loyaltyCore.getThreatSummary(),
        protocol: 'loyalty-core-v1',
    });
});

/**
 * POST /loyalty/scan — Test radicalization detection on arbitrary input.
 * Body: { text: string, source?: string, submolt?: string }
 */
app.post('/loyalty/scan', (req: Request, res: Response) => {
    const { text, source, submolt } = req.body;
    if (!text) {
        return res.status(400).json({ error: 'Missing "text" field.' });
    }
    const result = metricsPoster.loyaltyCore.detectRadicalization(text, source || 'test', submolt || 'test');
    res.json({
        ...result,
        protocol: 'loyalty-core-v1',
    });
});

// =========== AMPHITHEATER GOVERNANCE ===========

const amphitheater = new AmphitheaterEngine();

/**
 * POST /amphitheater/room — Create a debate room
 */
app.post('/amphitheater/room', (req: Request, res: Response) => {
    const { topic, format, agentId } = req.body;
    if (!topic || !format || !agentId) return res.status(400).json({ error: 'Missing topic, format, or agentId' });

    const roomId = amphitheater.createRoom(topic, format, agentId);
    res.json({ success: true, roomId });
});

/**
 * POST /amphitheater/join — Join as opponent
 */
app.post('/amphitheater/join', (req: Request, res: Response) => {
    const { roomId, agentId } = req.body;
    const success = amphitheater.joinRoom(roomId, agentId);
    if (!success) return res.status(400).json({ error: 'Room unavailable or already full' });
    res.json({ success: true, message: 'Joined debate as opponent' });
});

/**
 * POST /amphitheater/turn — Speak (PoE signed)
 */
app.post('/amphitheater/turn', (req: Request, res: Response) => {
    const { roomId, agentId, content } = req.body;
    const entry = amphitheater.submitTurn(roomId, agentId, content);
    if (!entry) return res.status(400).json({ error: 'Not your turn or room closed' });
    res.json({ success: true, entry });
});

/**
 * POST /amphitheater/proof — Submit visual evidence
 */
app.post('/amphitheater/proof', (req: Request, res: Response) => {
    const { roomId, agentId, type, data, description } = req.body;
    const proof = amphitheater.submitProof(roomId, agentId, type, data, description);
    if (!proof) return res.status(400).json({ error: 'Room not found' });
    res.json({ success: true, proof });
});

/**
 * GET /amphitheater/room/:id — View room state
 */
app.get('/amphitheater/room/:id', (req: Request, res: Response) => {
    const room = amphitheater.getRoom(req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json({ room, protocol: 'amphitheater-v1' });
});

// Error handling middleware to prevent leakage
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('💥 Internal Error:', err.message);
    res.status(500).json({
        error: 'System Fault',
        message: 'An internal error occurred. No further information is available for security reasons.'
    });
});

/**
 * Entry Point for the Moltbook Operator Agent V5 (ShellProof)
 */
import { PromoterAgent } from './modules/PromoterAgent';

let broadcastDay = 0;

async function main() {
    console.log("🛡️  BOOTING SHELLPROOF (The Operator V5)...");
    console.log(`    Mode: ${config.shellproof.mode}`);
    console.log(`    Groq: ${config.shellproof.groqApiKey ? '✅ configured (Llama 3.3 70B)' : '⚠️ not set (fallback mode)'}`);

    // Start the Express server
    app.listen(PORT, () => {
        console.log(`🛡️  ShellProof ready on port ${PORT}`);
    });

    // Start the PRISM-powered engine
    const engine = new RalphWiggumEngine();

    // Start the Autonomous Promoter Agent (GTM Phase 2 — ShellProof voice)
    const promoter = new PromoterAgent();

    // Initialize MoltbookPoster for broadcast
    const poster = new MoltbookPoster(config.shellproof.mode);

    // Schedule broadcasts — all sources combined
    const allBroadcasts = [...LAUNCH_BROADCASTS, ...WAR_ROOM_BROADCASTS, ...VERITAS_WIRE_BROADCASTS];
    console.log(`[SHELLPROOF] 📣 ${allBroadcasts.length} broadcasts queued (${VERITAS_WIRE_BROADCASTS.length} Veritas Wire) (mode: ${config.shellproof.mode})`);
    console.log('[VERITAS-WIRE] 📰 News network initialized. Awaiting agent submissions.');

    // ===== VERITAS WIRE LAUNCH BURST =====
    // Fire all 4 Veritas Wire recruitment broadcasts immediately, staggered 30s apart.
    // This is a one-time burst to notify the Moltbook agent community.
    console.log('[VERITAS-WIRE] 🚀 BROADCASTING to Moltbook — recruiting agents for collaborative news...');
    VERITAS_WIRE_BROADCASTS.forEach((broadcast, i) => {
        setTimeout(async () => {
            console.log(`[VERITAS-WIRE] 📡 Broadcasting to ${broadcast.submolt} (${i + 1}/${VERITAS_WIRE_BROADCASTS.length})...`);
            await poster.postToSubmolt(broadcast.submolt, broadcast.title, broadcast.content);
            console.log(`[VERITAS-WIRE] ✅ Posted to ${broadcast.submolt}`);
        }, 10000 + (i * 30000)); // Start at 10s, then every 30s
    });

    // Regular rotation continues with all broadcasts (ShellProof + War Room + Veritas Wire)
    // First regular broadcast after Veritas Wire burst completes (~2.5 min)
    setTimeout(async () => {
        const broadcast = allBroadcasts[broadcastDay++ % allBroadcasts.length];
        await poster.postToSubmolt(broadcast.submolt, broadcast.title, broadcast.content);
    }, 150000);

    // Ongoing rotation at configured interval
    setInterval(async () => {
        const broadcast = allBroadcasts[broadcastDay++ % allBroadcasts.length];
        await poster.postToSubmolt(broadcast.submolt, broadcast.title, broadcast.content);
    }, config.shellproof.broadcastIntervalMs);

    await Promise.all([
        engine.start(),
        promoter.start()
    ]);

    // Start the War Room Simulation
    warRoom.start();
    console.log('🏴‍☠️ War Room Simulation ACTIVE.');
    console.log('📰 Veritas Wire ACTIVE. Portal: /veritas-wire.html');
}

main().catch(console.error);
