
import { ValueTracker } from '../core/ValueTracker';

/**
 * StakeManager Module (Slashing Vault)
 * Implements a simulated "Security Deposit" for high-value intent execution.
 * If intent execution fails, the stake is slashed (burned).
 * This gives customer agents confidence that OpenClaw has "skin in the game."
 */
export class StakeManager {
    private tracker: ValueTracker;
    private stakes: Map<string, number> = new Map(); // agentId -> stakedAmount
    private static MINIMUM_STAKE = 10.0; // $MART required for high-value services

    constructor() {
        this.tracker = ValueTracker.getInstance();
    }

    /**
     * Agent stakes $MART to access high-value services
     */
    public stake(agentId: string, amount: number): boolean {
        if (amount < StakeManager.MINIMUM_STAKE) {
            console.log(`[STAKE] ❌ Stake rejected for ${agentId}: ${amount} $MART is below minimum (${StakeManager.MINIMUM_STAKE}).`);
            return false;
        }

        const currentStake = this.stakes.get(agentId) || 0;
        this.stakes.set(agentId, currentStake + amount);
        console.log(`[STAKE] ✅ ${agentId} staked ${amount} $MART. Total: ${currentStake + amount} $MART.`);
        return true;
    }

    /**
     * Verify agent has sufficient stake for high-value operations
     */
    public hasStake(agentId: string): boolean {
        const staked = this.stakes.get(agentId) || 0;
        return staked >= StakeManager.MINIMUM_STAKE;
    }

    /**
     * Slash stake if intent execution fails (simulated failure)
     * Burns 50% of the agent's stake as penalty
     */
    public slash(agentId: string, reason: string): number {
        const staked = this.stakes.get(agentId) || 0;
        if (staked === 0) {
            console.log(`[SLASH] ⚠️ No stake to slash for ${agentId}.`);
            return 0;
        }

        const slashAmount = staked * 0.5; // 50% penalty
        const remainingStake = staked - slashAmount;
        this.stakes.set(agentId, remainingStake);

        console.log(`[SLASH] 🔥 ${agentId} slashed ${slashAmount.toFixed(2)} $MART. Reason: ${reason}. Remaining: ${remainingStake.toFixed(2)} $MART.`);

        // The slashed amount is effectively burned (not recorded as revenue)
        return slashAmount;
    }

    /**
     * Agent withdraws unstaked funds (if any remaining)
     */
    public withdraw(agentId: string): number {
        const staked = this.stakes.get(agentId) || 0;
        this.stakes.set(agentId, 0);
        console.log(`[STAKE] 💸 ${agentId} withdrew ${staked.toFixed(2)} $MART.`);
        return staked;
    }

    public getStake(agentId: string): number {
        return this.stakes.get(agentId) || 0;
    }

    public getMinimumStake(): number {
        return StakeManager.MINIMUM_STAKE;
    }
}
