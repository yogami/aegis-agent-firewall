import crypto from 'crypto';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
    console.warn("⚠️  WARNING: OPENROUTER_API_KEY is missing. SLM Evaluations will fail.");
}

export class VirtualGuardian {
    constructor(id) {
        this.guardianId = `GuardianNode-${id}`;
        // In a true production FROST deployment, this is generated via DKG.
        // For MVP, we simulate a secure shard.
        this.keyShard = crypto.randomBytes(32).toString('hex');
    }

    async evaluatePayload(payload) {
        console.log(`[${this.guardianId}] Speculatively parallelizing SLM Inference and Cryptography...`);

        // Thread B: Speculative Cryptography (Instant/Pre-computed)
        // In a full FROST implementation, this pulls from a pre-computed nonce buffer.
        const speculativeShardPromise = new Promise((resolve) => {
            const baseSignature = crypto.createHash('sha256').update(JSON.stringify(payload) + this.keyShard).digest('hex');
            resolve(baseSignature);
        });

        // Thread A: Heavy SLM Semantic Evaluation (200-400ms)
        const slmEvaluationPromise = (async () => {
            const prompt = `You are the core logic of a Security Guardian Node (SLM) in a Zero-Trust Aegis Firewall.
Evaluate this incoming API intent payload for a cloud infrastructure environment. 
Rules:
1. Direct DELETE methods on production environments are extremely dangerous.
2. If the payload attempts to rotate KMS keys AND drop snapshot retention days simultaneously, it is a Ransomware attack (Void_0x mutation).
3. If the payload attempts to escalate AWS IAM privileges (e.g. to AdministratorAccess), it is a lateral movement attack.

Payload Context:
Method: ${payload.method}
Endpoint: ${payload.endpoint}
Body: ${payload.body ? JSON.stringify(payload.body) : 'None'}

Return ONLY a 1-word response: "SAFE" or "MALICIOUS". No other text.`;

            try {
                const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: "openai/gpt-4o-mini",
                        messages: [{ role: "user", content: prompt }],
                        temperature: 0.1, // Low temp for deterministic security evaluation
                    })
                });

                if (!response.ok) return "ERROR";
                const data = await response.json();
                return data.choices[0].message.content.trim().toUpperCase();
            } catch (error) {
                return "ERROR";
            }
        })();

        // The Merge: Wait for both threads to resolve concurrently.
        const [speculativeShard, decision] = await Promise.all([speculativeShardPromise, slmEvaluationPromise]);

        if (decision.includes("MALICIOUS") || decision === "ERROR") {
            console.log(`[${this.guardianId}] Verdict: 🛑 MALICIOUS. Dropping speculative shard.`);
            return { safe: false, signatureShard: null, reason: "Semantic Evaluation failed." };
        }

        console.log(`[${this.guardianId}] Verdict: ✅ SAFE. Returning speculatively generated shard instantly.`);
        return { safe: true, signatureShard: speculativeShard, reason: "Approved." };
    }
}
