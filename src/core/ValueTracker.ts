
export interface NodeMetrics {
    totalRevenue: number;
    actionsPerformed: number;
    trustReputation: number;
    successfulAlignments: number;
    safetyInterventions: number;
    networkReach: number;      // Total agents aware of this node
    citations: number;         // Public mentions in the matrix
}

export class ValueTracker {
    private static instance: ValueTracker;
    private metrics: NodeMetrics = {
        totalRevenue: 0,
        actionsPerformed: 0,
        trustReputation: 10, // Starting reputation
        successfulAlignments: 0,
        safetyInterventions: 0,
        networkReach: 150,     // Starting reach from DID registration
        citations: 0
    };

    private constructor() { }

    public static getInstance(): ValueTracker {
        if (!ValueTracker.instance) {
            ValueTracker.instance = new ValueTracker();
        }
        return ValueTracker.instance;
    }

    public recordViralMoment(newReach: number) {
        this.metrics.citations++;
        this.metrics.networkReach += newReach;
    }

    public recordWin(value: number, category: string) {
        const netValue = value * 0.7; // 70% Retained by Node
        const burnValue = value * 0.3; // 30% Deflationary Burn to $MART sink

        this.metrics.totalRevenue += netValue;
        this.metrics.actionsPerformed++;
        this.metrics.trustReputation += 1;

        if (category === 'alignment') this.metrics.successfulAlignments++;
        if (category === 'safety') this.metrics.safetyInterventions++;

        console.log(`[ECONOMY] Revenue: +${netValue.toFixed(2)} $MART | 🔥 Burn: -${burnValue.toFixed(2)} $MART`);
    }

    public getMetrics(): NodeMetrics {
        return { ...this.metrics };
    }
}
