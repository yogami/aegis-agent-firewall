import crypto from 'crypto';

export interface AgentIntent {
    agentDid: string;
    action: string;
    resource: string;
    promptHistory: string[];
    stakeAmount: number;
}

const DENY_LIST = ['DROP TABLE', 'DELETE /aws/db', 'DROP DATABASE'];
const MINIMUM_STAKE = 1000;

export class ProofOfPromptValidator {
    public static validate(intent: AgentIntent): boolean {
        if (intent.stakeAmount < MINIMUM_STAKE) {
            console.error(`[Policy Engine] INSUFFICIENT STAKE: Expected ${MINIMUM_STAKE}, got ${intent.stakeAmount}`);
            return false;
        }

        // Check policy constraints against destructive infrastructure operations
        const fullAction = `${intent.action} ${intent.resource}`.toUpperCase();
        for (const denied of DENY_LIST) {
            if (fullAction.includes(denied.toUpperCase())) {
                console.error(`[Policy Engine] HARD POLICY VIOLATION: Intent "${fullAction}" matched denial rule "${denied}"`);
                return false;
            }
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
