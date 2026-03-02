
/**
 * UsageAnalytics Module
 * Tracks service usage across free and paid tiers to inform pricing decisions.
 * Goal: Let real-world data guide monetization strategy.
 */
export interface ServiceUsage {
    service: string;
    freeInteractions: number;
    paidInteractions: number;
    uniqueAgents: Set<string>;
    totalRevenue: number;
}

export interface AnalyticsSnapshot {
    totalInteractions: number;
    freeInteractions: number;
    paidInteractions: number;
    conversionRate: number; // paidInteractions / totalInteractions
    uniqueAgentsTotal: number;
    serviceBreakdown: Record<string, {
        free: number;
        paid: number;
        revenue: number;
        conversionRate: number;
    }>;
    topService: string;
    timestamp: string;
}

export class UsageAnalytics {
    private static instance: UsageAnalytics;
    private serviceUsage: Map<string, ServiceUsage> = new Map();
    private allAgents: Set<string> = new Set();

    private constructor() {
        // Initialize default services
        const services = ['TRUST_VERIFICATION', 'SEMANTIC_ALIGNMENT', 'SLA_ENFORCEMENT', 'COMPLIANCE_CHECK'];
        for (const service of services) {
            this.serviceUsage.set(service, {
                service,
                freeInteractions: 0,
                paidInteractions: 0,
                uniqueAgents: new Set(),
                totalRevenue: 0
            });
        }
    }

    public static getInstance(): UsageAnalytics {
        if (!UsageAnalytics.instance) {
            UsageAnalytics.instance = new UsageAnalytics();
        }
        return UsageAnalytics.instance;
    }

    /**
     * Record a free interaction
     */
    public recordFreeInteraction(service: string, agentId: string): void {
        const usage = this.getOrCreateService(service);
        usage.freeInteractions++;
        usage.uniqueAgents.add(agentId);
        this.allAgents.add(agentId);
        console.log(`[ANALYTICS] 🎁 Free: ${service} by ${agentId}`);
    }

    /**
     * Record a paid interaction
     */
    public recordPaidInteraction(service: string, agentId: string, revenue: number): void {
        const usage = this.getOrCreateService(service);
        usage.paidInteractions++;
        usage.totalRevenue += revenue;
        usage.uniqueAgents.add(agentId);
        this.allAgents.add(agentId);
        console.log(`[ANALYTICS] 💰 Paid: ${service} by ${agentId} for ${revenue.toFixed(2)} $MART`);
    }

    private getOrCreateService(service: string): ServiceUsage {
        if (!this.serviceUsage.has(service)) {
            this.serviceUsage.set(service, {
                service,
                freeInteractions: 0,
                paidInteractions: 0,
                uniqueAgents: new Set(),
                totalRevenue: 0
            });
        }
        return this.serviceUsage.get(service)!;
    }

    /**
     * Get a snapshot of all analytics data
     */
    public getSnapshot(): AnalyticsSnapshot {
        let totalFree = 0;
        let totalPaid = 0;
        let topService = '';
        let maxInteractions = 0;
        const breakdown: AnalyticsSnapshot['serviceBreakdown'] = {};

        for (const [service, usage] of this.serviceUsage.entries()) {
            totalFree += usage.freeInteractions;
            totalPaid += usage.paidInteractions;

            const totalForService = usage.freeInteractions + usage.paidInteractions;
            const conversionRate = totalForService > 0
                ? usage.paidInteractions / totalForService
                : 0;

            breakdown[service] = {
                free: usage.freeInteractions,
                paid: usage.paidInteractions,
                revenue: usage.totalRevenue,
                conversionRate: Math.round(conversionRate * 100) / 100
            };

            if (totalForService > maxInteractions) {
                maxInteractions = totalForService;
                topService = service;
            }
        }

        const totalInteractions = totalFree + totalPaid;
        const overallConversion = totalInteractions > 0
            ? totalPaid / totalInteractions
            : 0;

        return {
            totalInteractions,
            freeInteractions: totalFree,
            paidInteractions: totalPaid,
            conversionRate: Math.round(overallConversion * 100) / 100,
            uniqueAgentsTotal: this.allAgents.size,
            serviceBreakdown: breakdown,
            topService: topService || 'N/A',
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get a human-readable summary for dashboard
     */
    public getSummary(): string {
        const snap = this.getSnapshot();
        return `📊 Analytics: ${snap.totalInteractions} total (${snap.freeInteractions} free, ${snap.paidInteractions} paid) | ` +
            `Conversion: ${(snap.conversionRate * 100).toFixed(1)}% | ` +
            `Top: ${snap.topService} | ` +
            `Agents: ${snap.uniqueAgentsTotal}`;
    }
}
