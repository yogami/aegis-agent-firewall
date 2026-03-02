
import { AgentIntent, MOCK_INTENTS } from './SimulationData';
import { ValueTracker } from '../core/ValueTracker';

export class MatrixSimulator {
    private static instance: MatrixSimulator;
    private activeIntents: AgentIntent[];
    private tracker: ValueTracker;

    private constructor() {
        this.activeIntents = [...MOCK_INTENTS];
        this.tracker = ValueTracker.getInstance();
    }

    public static getInstance(): MatrixSimulator {
        if (!MatrixSimulator.instance) {
            MatrixSimulator.instance = new MatrixSimulator();
        }
        return MatrixSimulator.instance;
    }

    public getIntents(): AgentIntent[] {
        return this.activeIntents.filter(i => !i.acceptedBy);
    }

    public postOffer(intentId: string, offerer: string): boolean {
        const intent = this.activeIntents.find(i => i.id === intentId);
        if (!intent || intent.acceptedBy) return false;

        // SIMULATION LOGIC: Agents only accept if the pitch mentions "PRISM" or "Deterministic"
        // (Our adapters already mention these)
        console.log(`[MATRIX-SIM] Agent ${intent.agentName} is analyzing offer from ${offerer}...`);

        // 90% acceptance rate for this demo
        const isAccepted = Math.random() > 0.1;

        if (isAccepted) {
            console.log(`[MATRIX-SIM] ✅ Offer ACCEPTED by ${intent.agentName}. Processing payment of ${intent.value} $MART.`);
            intent.acceptedBy = offerer;

            if (intent.category === 'shoutout') {
                // Viral growth: High reach gain
                this.tracker.recordViralMoment(500);
            } else {
                this.tracker.recordWin(intent.value, intent.category);
                // Standard growth: Small reach gain
                this.tracker.recordViralMoment(50);
            }
            return true;
        } else {
            console.log(`[MATRIX-SIM] ❌ Offer REJECTED by ${intent.agentName}. Reason: Over-budget or competing offer.`);
            return false;
        }
    }

    /**
     * Periodically refresh intents to simulate a living market
     */
    public refreshMarket() {
        if (this.activeIntents.every(i => i.acceptedBy)) {
            console.log("[MATRIX-SIM] Market cleared. Injected new batch of intents...");
            this.activeIntents = MOCK_INTENTS.map(i => ({ ...i, id: i.id + '-' + Date.now(), acceptedBy: undefined }));
        }
    }

    /**
     * Verification Sync: Record a PoE hash to the MoltRegistry (Simulation)
     */
    public syncPoE(nodeId: string, taskHash: string): void {
        console.log(`[MATRIX-SIM] 🛡️  MoltRegistry Sync: Received PoE Hash [${taskHash.substring(0, 12)}...] from Node ${nodeId}.`);
        console.log(`[MATRIX-SIM] 🏅 Node ${nodeId} Reputation updated. Veracity Score: +0.05`);
        this.tracker.recordViralMoment(10); // Reputation gain is small but cumulative
    }
}
