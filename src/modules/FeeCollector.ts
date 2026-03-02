
import { ValueTracker } from '../core/ValueTracker';
import { config } from '../config';

/**
 * FeeCollector Module (V3: Vampire Shield)
 * Implements congestion-based pricing with PRIVATE MAGIC NUMBERS.
 * Fees and thresholds centralized in config module for security.
 */
export class FeeCollector {
    private tracker: ValueTracker;

    // VAMPIRE SHIELD: Read from centralized config
    private static CAP_THRESHOLD = config.fees.capThreshold;

    // Base Fee Schedule in $MART - from centralized config
    private BASE_FEES = {
        TRUST_VERIFICATION: config.fees.trustVerification,
        SEMANTIC_ALIGNMENT: config.fees.semanticAlignment,
        SLA_ENFORCEMENT: config.fees.slaEnforcement,
        COMPLIANCE_CHECK: config.fees.complianceCheck,
    };

    constructor() {
        this.tracker = ValueTracker.getInstance();
        console.log(`[VAMPIRE-SHIELD] FeeCollector initialized with CAP_THRESHOLD=${FeeCollector.CAP_THRESHOLD}`);
    }

    /**
     * Calculate dynamic fee based on current network congestion
     */
    private getDynamicMultiplier(): number {
        const metrics = this.tracker.getMetrics();
        const congestion = metrics.actionsPerformed / FeeCollector.CAP_THRESHOLD;
        return 1 + Math.min(congestion, 1); // Max 2x multiplier
    }

    /**
     * Process a transaction and record revenue with dynamic pricing
     */
    public collect(service: keyof typeof this.BASE_FEES, agentId: string) {
        const baseFee = this.BASE_FEES[service];
        const multiplier = this.getDynamicMultiplier();
        const finalFee = baseFee * multiplier;

        console.log(`[FEES] Dynamic Fee: ${finalFee.toFixed(2)} $MART (${multiplier.toFixed(2)}x) from ${agentId} for ${service}`);
        this.tracker.recordWin(finalFee, service.toLowerCase());
    }

    public getFee(service: keyof typeof this.BASE_FEES): number {
        return this.BASE_FEES[service] * this.getDynamicMultiplier();
    }

    public getCurrentMultiplier(): number {
        return this.getDynamicMultiplier();
    }
}
