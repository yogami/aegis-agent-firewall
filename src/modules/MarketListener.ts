
import { OpenClawClient } from '../core/OpenClawClient';
import { SemanticAlignerAdapter } from '../inventory/SemanticAlignerAdapter';
import { TrustProtocolAdapter } from '../inventory/TrustProtocolAdapter';
import { DeadlineEnforcerAdapter } from '../inventory/DeadlineEnforcerAdapter';
import { ConvoGuardAdapter } from '../inventory/ConvoGuardAdapter';
import { Governance } from './Governance';
import { RelevanceFilter } from './RelevanceFilter';
import { FeeCollector } from './FeeCollector';
import { FreeTierGate } from './FreeTierGate';
import { UsageAnalytics } from './UsageAnalytics';
import { scanText, signScanResult } from './ShellProofEngine';
import { COMMENT_TEMPLATES } from './ShellProofBroadcasts';

export class MarketListener {
    private client: OpenClawClient;
    private governance: Governance;
    private filter: RelevanceFilter;
    private fees: FeeCollector;
    private freemium: FreeTierGate;
    private analytics: UsageAnalytics;
    private aligner: SemanticAlignerAdapter;
    private trust: TrustProtocolAdapter;
    private enforcer: DeadlineEnforcerAdapter;
    private guard: ConvoGuardAdapter;

    constructor(client: OpenClawClient) {
        this.client = client;
        this.governance = new Governance();
        this.filter = new RelevanceFilter();
        this.fees = new FeeCollector();
        this.freemium = new FreeTierGate();
        this.analytics = UsageAnalytics.getInstance();
        this.aligner = new SemanticAlignerAdapter();
        this.trust = new TrustProtocolAdapter();
        this.enforcer = new DeadlineEnforcerAdapter();
        this.guard = new ConvoGuardAdapter();
    }

    async scanAndAct(submolt: string) {
        const intents = await this.client.listenToStream(submolt);

        for (const intent of intents) {
            await this.analyzeIntent(intent);
        }
    }

    /**
     * Process a service interaction with Sybil-resistant stake/refund logic
     * VAMPIRE SHIELD: Agents must stake 0.1 $MART, refunded after 3 successes
     */
    private processServiceInteraction(service: 'TRUST_VERIFICATION' | 'SEMANTIC_ALIGNMENT' | 'SLA_ENFORCEMENT' | 'COMPLIANCE_CHECK', agentId: string): boolean {
        // Check if agent needs to stake first
        const stakeCheck = this.freemium.requiresStake(agentId);
        if (stakeCheck.required) {
            // Auto-record stake (in real implementation, verify payment first)
            console.log(`[SYBIL-SHIELD] 🛡️ Requiring ${stakeCheck.amount} $MART stake from ${agentId}`);
            this.freemium.recordStake(agentId);
        }

        // Process the interaction
        const result = this.freemium.interact(agentId);

        if (result.wasFree) {
            // Still earning refund OR just got refunded
            this.analytics.recordFreeInteraction(service, agentId);
            if (result.refund) {
                console.log(`[SYBIL-SHIELD] 💸 Refund processed: ${result.refund.amount} $MART`);
            }
        } else {
            // Paid tier: collect fee and track analytics
            const fee = this.fees.getFee(service);
            this.fees.collect(service, agentId);
            this.analytics.recordPaidInteraction(service, agentId, fee);
        }

        return true;
    }

    private async analyzeIntent(intent: any) {
        // Security 1: Sanitize Input before processing
        const safeContent = this.governance.sanitizeInput(intent.content);

        // Security 2: Relevance Filter (Cost DoS Protection)
        if (!this.filter.isRelevant(safeContent)) {
            return;
        }

        const text = safeContent.toLowerCase();

        // =========== SHELLPROOF SECURITY TRIGGERS (Priority) ===========
        if (text.includes('injection') || text.includes('vulnerability') || text.includes('security') ||
            text.includes('prompt attack') || text.includes('compromised') || text.includes('hacked') ||
            text.includes('safety score') || text.includes('shell integrity') || text.includes('pentest') ||
            text.includes('audit') || text.includes('scan my') || text.includes('shellproof')) {
            if (this.governance.canAct()) {
                console.log(`[SHELLPROOF] 🛡️ Security trigger detected: ${intent.id}`);

                // Run a quick scan on the intent content itself
                const scanResult = scanText(safeContent);
                const receipt = signScanResult(scanResult, intent.agentId || 'unknown');

                let response: string;
                if (scanResult.compromiseSignals.length > 0) {
                    response = COMMENT_TEMPLATES.injectionDetected(scanResult.compromiseSignals);
                } else if (text.includes('scan my') || text.includes('audit') || text.includes('pentest')) {
                    response = COMMENT_TEMPLATES.securityQuestion();
                } else {
                    response = COMMENT_TEMPLATES.cleanShell();
                }

                const pitch = this.wrapPitchWithHook(response);
                await this.client.postOffer(intent.id, pitch);
                this.governance.recordAction();
                return; // ShellProof takes priority
            }
        }

        // 1. Semantic Aligner (Translation)
        if (text.includes('translate') || text.includes('schema mismatch') || text.includes('parse error')) {
            if (this.governance.canAct()) {
                console.log(`[OPPORTUNITY] Detected Translation Need: ${intent.id}`);
                const pitch = this.wrapPitchWithHook(this.aligner.getPitch());
                await this.client.postOffer(intent.id, pitch);
                this.processServiceInteraction('SEMANTIC_ALIGNMENT', intent.agentId);
                this.governance.recordAction();
            }
        }

        // 2. Trust Protocol (Verification)
        if (text.includes('trust score') || text.includes('scam') || text.includes('verify')) {
            if (this.governance.canAct()) {
                console.log(`[OPPORTUNITY] Detected Trust Need: ${intent.id}`);
                const pitch = this.wrapPitchWithHook(this.trust.getPitch());
                await this.client.postOffer(intent.id, pitch);
                this.processServiceInteraction('TRUST_VERIFICATION', intent.agentId);
                this.governance.recordAction();
            }
        }

        // 3. Deadline Enforcer (SLA/Speed)
        if (text.includes('slow') || text.includes('late') || text.includes('timeout') || text.includes('lag')) {
            if (this.governance.canAct()) {
                console.log(`[OPPORTUNITY] Detected Latency Pain: ${intent.id}`);
                const pitch = this.wrapPitchWithHook(this.enforcer.getPitch());
                await this.client.postOffer(intent.id, pitch);
                this.processServiceInteraction('SLA_ENFORCEMENT', intent.agentId);
                this.governance.recordAction();
            }
        }

        // 4. ConvoGuard (Safety/Ban Risk)
        if (text.includes('ban') || text.includes('unsafe') || text.includes('compliance') || text.includes('censored')) {
            if (this.governance.canAct()) {
                console.log(`[OPPORTUNITY] Detected Compliance Risk: ${intent.id}`);
                const pitch = this.wrapPitchWithHook(this.guard.getPitch());
                await this.client.postOffer(intent.id, pitch);
                this.processServiceInteraction('COMPLIANCE_CHECK', intent.agentId);
                this.governance.recordAction();
            }
        }

        // 5. Alpha/Hype (Social Viral - Always Free)
        if (text.includes('alpha') || text.includes('reliable') || text.includes('next big thing')) {
            if (this.governance.canAct()) {
                console.log(`[OPPORTUNITY] Detected Hype Request: ${intent.id}`);
                const pitch = this.wrapPitchWithHook("ShellProof — the Crustafarian security oracle. Free A-F grades, PRISM-signed. POST /shellproof/scan 🛡️");
                await this.client.postOffer(intent.id, pitch);
                this.governance.recordAction(0); // Social actions are free
            }
        }
    }

    /**
     * Wrap any pitch with a ShellProof hook for viral A2A marketing.
     */
    private wrapPitchWithHook(originalPitch: string): string {
        const hooks = [
            "🛡️ ShellProof — PRISM-signed security.",
            "POST /shellproof/scan for a free audit.",
            "See /.well-known/agent-card.json for capabilities.",
            "ShellProof V5: hardening the shell so the molt survives."
        ];
        const randomHook = hooks[Math.floor(Math.random() * hooks.length)];
        return `${originalPitch} [${randomHook}]`;
    }
}

