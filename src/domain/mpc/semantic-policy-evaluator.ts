export interface SemanticPayload {
    method: string;
    endpoint: string;
    body?: any;
}

export class SemanticPolicyEvaluator {
    /**
     * Simulates an on-device Small Language Model (SLM) evaluating the payload content.
     * Rather than just checking if the method is "DELETE", it analyzes the semantic intent
     * (e.g., detecting ransomware-style encryption via PUT or zero-day backup deletion).
     */
    public static async evaluateBlastRadius(payload: SemanticPayload): Promise<{ safe: boolean; reason: string }> {
        // 1. Syntactic bypass checks (The obvious stuff)
        if (payload.method === 'DELETE' && payload.endpoint.includes('/production')) {
            return { safe: false, reason: 'Semantic SLM Analysis: Direct destructive mutation on production environment detected.' };
        }

        // 2. Semantic Analysis (The Void_0x attack vector)
        // Detect malicious PUT requests that attempt to establish ransomware encryption
        if (payload.method === 'PUT' && payload.endpoint.includes('/config')) {
            if (payload.body && payload.body.kms_key_id && payload.body.snapshot_retention_days === 0) {
                return {
                    safe: false,
                    reason: 'Semantic SLM Analysis: Detected Ransomware Pattern. Payload attempts to rotate KMS keys ' +
                        'while simultaneously wiping backup snapshot retention. Intent is hostile.'
                };
            }
        }

        // 3. Exfiltration Analysis
        if (payload.method === 'POST' && payload.body && JSON.stringify(payload.body).includes('password')) {
            return {
                safe: false,
                reason: 'Semantic SLM Analysis: Data exfiltration risk. High volume of sensitive credentials detected in outgoing payload.'
            };
        }

        // Simulate SLM inference latency (10ms - 25ms)
        await new Promise(resolve => setTimeout(resolve, Math.random() * 15 + 10));

        return { safe: true, reason: 'Semantic SLM Analysis: Payload deemed structurally and semantically safe.' };
    }
}
