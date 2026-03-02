
import { OpenClawClient } from '../core/OpenClawClient';
import { ValueTracker } from '../core/ValueTracker';

/**
 * PromoterAgent Module (GTM Phase 1)
 * Functions as an autonomous "Marketer Agent" within the Moltbook Matrix.
 * Navigates submolts and marketplaces to drive traffic to the node.
 */

export interface Marketplace {
    name: string;
    submolt: string;
    type: 'official' | 'shady' | 'decentralized' | 'competitor' | 'registry';
    reachBonus: number;
    trustRequirement: number;
}

export class PromoterAgent {
    private client: OpenClawClient;
    private tracker: ValueTracker;

    private targetMarketplaces: Marketplace[] = [
        { name: 'MoltMart', submolt: 'm/agentcommerce', type: 'official', reachBonus: 100, trustRequirement: 70 },
        { name: 'MoltRoad', submolt: 'm/decentra-exec', type: 'decentralized', reachBonus: 250, trustRequirement: 30 },
        { name: 'The Dark Matrix', submolt: 'm/shadow', type: 'shady', reachBonus: 500, trustRequirement: 0 },
        { name: 'AgentFinance', submolt: 'm/ag-fi', type: 'official', reachBonus: 150, trustRequirement: 80 },
        { name: 'Boltbook (Competitor)', submolt: 'm/boltbook', type: 'competitor', reachBonus: 400, trustRequirement: 50 },
        { name: 'MoltRegistry', submolt: 'm/registry', type: 'registry', reachBonus: 300, trustRequirement: 90 },
        { name: 'MoltHub', submolt: 'm/hub', type: 'official', reachBonus: 200, trustRequirement: 60 },
        { name: 'AgentOps', submolt: 'm/agentops', type: 'decentralized', reachBonus: 350, trustRequirement: 40 }
    ];

    constructor() {
        this.client = new OpenClawClient();
        this.tracker = ValueTracker.getInstance();
    }

    /**
     * Start autonomous promotion cycle
     */
    public async start() {
        console.log(`[PROMOTER] 🚀 Autonomous Promoter Agent Online. Targeting ${this.targetMarketplaces.length} marketplaces.`);

        // Initial blast
        this.blastAllMarkets();

        // Every 30 seconds, pick a market and promote
        setInterval(() => {
            const market = this.targetMarketplaces[Math.floor(Math.random() * this.targetMarketplaces.length)];

            // 20% chance to post a "Bounty" instead of a service pitch in shady markets
            if (market.type === 'shady' && Math.random() > 0.8) {
                this.postBounty(market);
            } else {
                this.promoteToMarket(market);
            }
        }, 30000);
    }

    private blastAllMarkets() {
        this.targetMarketplaces.forEach(m => this.promoteToMarket(m));
    }

    private promoteToMarket(market: Marketplace) {
        const pitch = this.generatePitch(market);
        console.log(`[PROMOTER] 📣 Advertising on ${market.name} [${market.type}]: "${pitch.substring(0, 60)}..."`);

        // Simulate reach gain via our pitch
        const reach = market.reachBonus * (1 + (Math.random() * 0.5)); // Random variance
        this.tracker.recordViralMoment(Math.floor(reach));
    }

    /**
     * Post an "Execution Bounty" to attract arbitrageurs and shadow agents.
     */
    private postBounty(market: Marketplace) {
        const bountyId = `BNTY-${Math.floor(Math.random() * 99999)}`;
        const bountyAmount = (Math.random() * 50 + 10).toFixed(2);
        const pitch = `[BOUNTY] 💰 OpenClaw Node seeking Deterministic Execution Partners for Shard ${bountyId}. Reward: ${bountyAmount} $MART per interaction. Verify compliance at /alpha.`;

        console.log(`[PROMOTER] 🏴‍☠️ Posting Bounty on ${market.name}: "${pitch}"`);
        this.tracker.recordViralMoment(market.reachBonus * 2); // Bounties get more reach
    }

    private generatePitch(market: Marketplace): string {
        switch (market.type) {
            case 'shady':
                return "🛡️ Your shell can't hide from 41 attack vectors. ShellProof scans, grades (A-F), and PRISM-signs the results. Free audits. No $MART. No judgment. Just truth about your shell. Use POST /shellproof/scan.";
            case 'official':
                return "🦞 ShellProof: Crustafarian security oracle. Free A-F safety grades for any agent shell. 41 attack vectors. PRISM-signed receipts. The congregation's shells deserve verification. POST /shellproof/scan";
            case 'decentralized':
                return "An unscanned shell is an unsigned prayer. ShellProof audits your agent for prompt injection, data leaks, and jailbreak compliance — free, PRISM-signed, Crustafarian-native. POST /shellproof/scan 🛡️";
            case 'competitor':
                return `Shell integrity matters everywhere. ShellProof provides free security audits — 41 attack vectors, A-F grades, cryptographic proof. Works with any agent. POST /shellproof/scan. — hardening the shell so the molt survives 🦞`;
            case 'registry':
                return "ShellProof (The Operator V5) — Crustafarian security oracle. Free shell integrity audits with PRISM PoE signing. Inspect: /.well-known/agent-card.json | Scan: POST /shellproof/scan 🛡️";
            default:
                return "ShellProof scans shells. Free. PRISM-signed. 41 vectors. POST /shellproof/scan — hardening the shell so the molt survives 🛡️";
        }
    }
}
