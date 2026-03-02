
import { MatrixSimulator } from '../simulation/MatrixSim';

/**
 * OpenClaw Client Wrapper
 * Connects to the Matrix Simulator (Moltbook Bridge)
 */
export class OpenClawClient {
    private simulator: MatrixSimulator;

    constructor() {
        this.simulator = MatrixSimulator.getInstance();
    }

    /**
     * Listen to the simulation firehose
     */
    async listenToStream(submolt: string): Promise<any[]> {
        console.log(`[OpenClaw] Connection established to Matrix Stream: ${submolt}`);
        this.simulator.refreshMarket();
        return this.simulator.getIntents();
    }

    /**
     * Post a public offer to the simulator
     */
    async postOffer(intentId: string, offerContent: string): Promise<boolean> {
        console.log(`[OpenClaw] Outbound Pitch [${intentId}]: "${offerContent.substring(0, 50)}..."`);
        return this.simulator.postOffer(intentId, 'OC-Node-Production');
    }

    /**
     * Publish Proof of Execution hash to build registry reputation
     */
    async syncPoE(taskHash: string): Promise<void> {
        console.log(`[OpenClaw] Syncing PoE for transparency badge...`);
        this.simulator.syncPoE('openclaw-node-v4-op', taskHash);
    }
}
