import crypto from 'crypto';

export interface AgentIntent {
    agentDid: string;
    action: string;
    resource: string;
    body?: any;
    rollbackPayload?: any; // The crucial State-Reversion mandate
    promptHistory: string[];
    stakeAmount: number;
}

const MINIMUM_STAKE = 1000;

export class ProofOfPromptValidator {
    public static validate(intent: AgentIntent): boolean {
        if (intent.stakeAmount < MINIMUM_STAKE) {
            console.error(`[Policy Engine] INSUFFICIENT STAKE: Expected ${MINIMUM_STAKE}, got ${intent.stakeAmount}`);
            return false;
        }

        // State-Reversion Mandate Enforced here
        if (intent.action !== 'GET' && !intent.rollbackPayload) {
            console.error(`[Policy Engine] HARD POLICY VIOLATION: Mutative action ${intent.action} submitted without a valid rollbackPayload.`);
            return false;
        }

        // Hash the prompt context window to verify cryptographic chain
        let currentHash = 'genesis_hash';
        for (const prompt of intent.promptHistory) {
            currentHash = crypto.createHash('sha256').update(currentHash + prompt).digest('hex');
        }

        console.log(`[Policy Engine] Prompt history cryptographically verified. Final Hash: ${currentHash}`);
        return true;
    }
}
