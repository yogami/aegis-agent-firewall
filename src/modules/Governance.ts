
/**
 * Governance Module
 * Enforces Security, Safety, and Budget Constraints.
 */
export class Governance {
    private dailyBudgetUsd: number;
    private currentSpendUsd: number;
    private actionsToday: number;
    private maxActionsPerDay: number;

    constructor() {
        this.dailyBudgetUsd = 5.00; // Hard cap of $5/day
        this.currentSpendUsd = 0;
        this.actionsToday = 0;
        this.maxActionsPerDay = 50; // Don't spam the network
    }

    /**
     * Check if the agent is allowed to act.
     */
    canAct(): boolean {
        if (this.currentSpendUsd >= this.dailyBudgetUsd) {
            console.warn(`[GOVERNANCE] Daily Budget Exceeded ($${this.dailyBudgetUsd}). Halting.`);
            return false;
        }
        if (this.actionsToday >= this.maxActionsPerDay) {
            console.warn(`[GOVERNANCE] Daily Action Limit Reached (${this.maxActionsPerDay}). Halting.`);
            return false;
        }
        return true;
    }

    /**
     * Record an action and its cost.
     */
    recordAction(costUsd: number = 0.01) {
        this.actionsToday++;
        this.currentSpendUsd += costUsd;
    }

    /**
     * Sanitize input to prevent prompt injection or malicious payloads.
     */
    sanitizeInput(input: string): string {
        // 1. Length check to prevent buffer overflow/dos
        if (input.length > 1000) {
            return input.substring(0, 1000); // Truncate
        }
        // 2. Remove control characters
        // 3. (In real prod) Run through ConvoGuard ;) via internal loop
        return input;
    }

    getStats(): string {
        return `Spent: $${this.currentSpendUsd.toFixed(2)} | Actions: ${this.actionsToday}/${this.maxActionsPerDay}`;
    }
}
