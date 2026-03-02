import { ProofOfPromptValidator, AgentIntent } from './proof-of-prompt-validator';
import crypto from 'crypto';

export class GuardianNode {
    private nodeId: number;
    private keyShare: string; // Mock shard representation for FROST TSS
    private signatureLatency: number; // Simulated network delay per node

    constructor(nodeId: number, keyShare: string, simulatedLatencyMs: number = 0) {
        this.nodeId = nodeId;
        this.keyShare = keyShare;
        this.signatureLatency = simulatedLatencyMs;
    }

    public async evaluateRequest(intent: AgentIntent): Promise<{ signed: boolean; shardSignature?: string; reason?: string }> {
        console.log(`[Guardian Node ${this.nodeId}] Evaluating intent for DID: ${intent.agentDid}`);

        // Simulate internal processing/network latency
        if (this.signatureLatency > 0) {
            await new Promise(resolve => setTimeout(resolve, this.signatureLatency));
        }

        // Evaluate via the Policy Engine middleware
        const isValid = ProofOfPromptValidator.validate(intent);

        if (!isValid) {
            console.warn(`[Guardian Node ${this.nodeId}] REJECTED: Policy or Hash validation failed. Withholding signature shard.`);
            return { signed: false, reason: 'Validation failed' };
        }

        // Mock threshold signature generation (e.g. FROST partial signature using the assigned shard)
        // Generating deterministic fake sig based on the action and resource so they can be "combined"
        const payloadHash = crypto.createHash('sha256').update(intent.action + intent.resource).digest('hex').substring(0, 16);
        const mockSignature = `sig_shard_${this.nodeId}_[${this.keyShare}]_${payloadHash}`;

        console.log(`[Guardian Node ${this.nodeId}] APPROVED. Generating partial signature share: ${mockSignature}`);

        return {
            signed: true,
            shardSignature: mockSignature
        };
    }
}
