
/**
 * Relevance & Spam Filter
 * "The Bouncer"
 * 
 * Protects the agent from:
 * 1. Low-value interactions (Waste of budget)
 * 2. Spam/Bait posts (Reputation poisoning)
 * 3. Cost DoS attacks (Infinite loops)
 */
export class RelevanceFilter {

    /**
     * Determines if a market intent is worth engaging with.
     * Returns true only for High-Confidence signals.
     */
    isRelevant(content: string, reliabilityScore: number = 0.5): boolean {
        // 1. Length Check: Ignore one-word spam or massive dumps
        if (content.length < 10 || content.length > 500) {
            console.log(`[FILTER] Drop: Content length invalid (${content.length})`);
            return false;
        }

        // 2. Structure Check: Require specific error patterns vs generic chitchat
        const hasErrorPattern = this.detectErrorPattern(content);
        if (!hasErrorPattern) {
            console.log(`[FILTER] Drop: No specific error pattern detected.`);
            return false;
        }

        // 3. (Simulated) Reputation Check of the poster
        if (reliabilityScore < 0.2) {
            console.log(`[FILTER] Drop: Poster is low-reputation/spam.`);
            return false;
        }

        return true;
    }

    private detectErrorPattern(content: string): boolean {
        const patterns = [
            /schema mismatch/i,
            /parse error/i,
            /trust score/i,
            /latency/i,
            /timeout/i,
            /ban/i,
            /compliance/i,
            /verify identity/i
        ];
        return patterns.some(p => p.test(content));
    }
}
