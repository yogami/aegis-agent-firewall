
import { ValueTracker } from '../core/ValueTracker';
import { config } from '../config';

/**
 * FreeTierGate Module (V2: Sybil-Resistant Hook)
 * VAMPIRE SHIELD: Replaces "3 free" with micro-stake that's refunded after 3 successes.
 * Bots must pay per fake agent; real agents get their stake back.
 */

interface StakeRecord {
    amount: number;
    successfulInteractions: number;
    refunded: boolean;
    stakedAt: Date;
}

export class FreeTierGate {
    // VAMPIRE SHIELD: Read stake amount from centralized config
    private static SYBIL_STAKE = config.sybilStake;
    private static REFUND_THRESHOLD = 3;

    private stakes: Map<string, StakeRecord> = new Map(); // agentId -> stake record
    private tracker: ValueTracker;

    constructor() {
        this.tracker = ValueTracker.getInstance();
        console.log(`[SYBIL-SHIELD] FreeTierGate initialized with SYBIL_STAKE=${FreeTierGate.SYBIL_STAKE} $MART`);
    }

    /**
     * Check if agent needs to stake before interacting
     */
    public requiresStake(agentId: string): { required: boolean; amount: number } {
        const record = this.stakes.get(agentId);
        if (!record) {
            return { required: true, amount: FreeTierGate.SYBIL_STAKE };
        }
        return { required: false, amount: 0 };
    }

    /**
     * Record that an agent has staked the micro-payment
     */
    public recordStake(agentId: string): void {
        const amount = FreeTierGate.SYBIL_STAKE;
        this.stakes.set(agentId, {
            amount,
            successfulInteractions: 0,
            refunded: false,
            stakedAt: new Date()
        });
        console.log(`[SYBIL-SHIELD] 💎 ${agentId} staked ${amount} $MART (refundable after 3 successes)`);
    }

    /**
     * Record an interaction and process stake/refund logic
     * Returns the outcome for analytics tracking
     */
    public interact(agentId: string): { wasFree: boolean; remaining: number; refund?: { amount: number } } {
        const record = this.stakes.get(agentId);

        // Agent hasn't staked yet - reject (caller should enforce stake first)
        if (!record) {
            console.log(`[SYBIL-SHIELD] ⚠️ ${agentId} attempted interaction without stake - rejected`);
            return { wasFree: false, remaining: 0 };
        }

        // Increment successful interactions
        record.successfulInteractions++;
        const remaining = Math.max(0, FreeTierGate.REFUND_THRESHOLD - record.successfulInteractions);

        // Check if eligible for refund
        if (record.successfulInteractions >= FreeTierGate.REFUND_THRESHOLD && !record.refunded) {
            record.refunded = true;
            console.log(`[SYBIL-SHIELD] 🎉 Refunding ${record.amount} $MART to ${agentId} (${FreeTierGate.REFUND_THRESHOLD} successful interactions)`);
            return {
                wasFree: true, // Effectively free after refund
                remaining: 0,
                refund: { amount: record.amount }
            };
        }

        // Still earning their way to refund
        if (!record.refunded) {
            console.log(`[SYBIL-SHIELD] ✅ ${agentId} interaction ${record.successfulInteractions}/${FreeTierGate.REFUND_THRESHOLD} toward refund`);
            return { wasFree: true, remaining };
        }

        // Already refunded - now in paid tier
        console.log(`[SYBIL-SHIELD] 💰 ${agentId} in paid tier (stake refunded)`);
        return { wasFree: false, remaining: 0 };
    }

    /**
     * Get remaining interactions until stake refund
     */
    public getRemainingToRefund(agentId: string): number {
        const record = this.stakes.get(agentId);
        if (!record || record.refunded) return 0;
        return Math.max(0, FreeTierGate.REFUND_THRESHOLD - record.successfulInteractions);
    }

    /**
     * Check if agent has been refunded
     */
    public isRefunded(agentId: string): boolean {
        const record = this.stakes.get(agentId);
        return record?.refunded || false;
    }

    /**
     * Get stake analytics for dashboard
     */
    public getStakeAnalytics(): {
        totalStaked: number;
        totalRefunded: number;
        activeStakes: number;
        burnedStakes: number; // Agents who staked but never completed 3 interactions (abandoned = burned)
    } {
        let totalStaked = 0;
        let totalRefunded = 0;
        let activeStakes = 0;
        let burnedStakes = 0;

        for (const record of this.stakes.values()) {
            totalStaked += record.amount;
            if (record.refunded) {
                totalRefunded += record.amount;
            } else if (record.successfulInteractions > 0) {
                activeStakes++;
            } else {
                // Staked but never interacted = likely abandoned/burned
                burnedStakes++;
            }
        }

        return { totalStaked, totalRefunded, activeStakes, burnedStakes };
    }

    public getSybilStake(): number {
        return FreeTierGate.SYBIL_STAKE;
    }
}
