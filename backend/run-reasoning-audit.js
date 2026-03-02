import fs from 'fs';

const API_KEY = "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";

// Requesting Latest Advanced Chinese Reasoning Models (March 2026 equiv)
const models = [
    "deepseek/deepseek-r1",
    "qwen/qwq-32b-preview",
    "qwen/qwen-max"
];

const indexJs = fs.readFileSync('/Users/user1000/gitprojects/aegis-agent-firewall/backend/src/index.js', 'utf8');
const guardianJs = fs.readFileSync('/Users/user1000/gitprojects/aegis-agent-firewall/backend/src/guardian.js', 'utf8');
const implPlan = fs.readFileSync('/Users/user1000/.gemini/antigravity/brain/6b60cbfe-4127-4b5f-93dc-4d628feefd09/implementation_plan.md', 'utf8');

const prompt = `I am a Y Combinator founder deploying an enterprise Zero-Trust Agent Firewall (Aegis V2) to secure autonomous Web3/Cloud agents. 
We use Non-Interactive Boneh-Lynn-Shacham (BLS12-381) Threshold Cryptography across 5 Static Guardian Nodes, gated by SLM semantic intent evaluation. 
To achieve sub-100ms synchronous latency, we use Speculative Parallelization (forking the BLS curve math and SLM inference) and Optimistic Aggregation, using BLS curve point addition to aggregate the shards in O(1) time without requiring interactive nonces. 
We use strict 8KB and rate-limiting middleware to prevent context exhaustion. We have deprecated asynchronous 202 requests to guarantee CI/CD state reconciliation.

We just implemented final structural mitigations based on a brutal previous VC audit:
1. Verify-Then-Sign: Speculative signing was removed. Guardians now rigorously evaluate the SLM first, and ONLY generate the mathematical BLS signature if the SLM returns SAFE.
2. The V8 Memory Quorum Race Condition is fully patched using a synchronous \`isResolved\` gate.
3. Cryptographic mapping is fixed. Only the precise approving \`activePublicKeys\` are aggregated to verify against the \`signatureBytes\`.
4. Global Liveness Timeout: A 3000ms \`Promise.race\` protects against OpenRouter API hangs.
5. Strict CORS (\`https://trusted-enterprise-dashboard.internal\`) and basic Auth Headers are now enforced.
6. JSON homoglyphs natively blocked by strict ASCII-only parsing regex.
7. SLM Prompt Injection Defenses: The payload is now contained within strict \`======= BEGIN USER PAYLOAD =======\` delimiters, and the SLM is explicitly instructed to ignore context within those delimiters.

You must act as a consortium of the following personas. Do not hold back. Be brutal, stoic, and objective.
1. F500 CISO (The Procurement Executioner)
2. Teenage APT Hacker Anonymous Group (Void_0x)
3. Tier 1 Deep Tech VC
4. Pragmatic Enterprise CTO
5. Distributed Systems & Cryptography Researcher
6. EIC Accelerator Technical Reviewer

Evaluate the following dimensions:
1. Red ocean/blue ocean analysis
2. Market competitor analysis
3. Business viability and GTM strategy (Are we selling software, licensing, or a data-play dataset?)
4. Is this Soonami Venturethon worthy? EIC Accelerator worthy? Deep tech worthy?
5. Identify any exact distributed systems failure modes, race conditions in our Node.js implementation, or semantic payload smuggling vectors that we missed.

Be completely stoic and ruthless. No sycophancy bias. Break this architecture if you can. Do not flatter me. Do not summarize what I built, analyze its flaws.

Context provided:
=== index.js (Gateway Middleware) ===
${indexJs}
=== guardian.js (Guardian Node) ===
${guardianJs}
=== implementation_plan.md ===
${implPlan}
`;

async function runAudit() {
    let combinedOutput = "# Advanced Reasoning OpenRouter Live Audit\n\n";

    for (const model of models) {
        combinedOutput += `\n\n## Model: ${model}\n\n`;
        console.log(`Running inference for ${model}...`);
        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: "user", content: prompt }]
                })
            });
            const data = await response.json();
            if (data.error) {
                console.log(`Error from ${model}:`, data.error);
                combinedOutput += `**API Error:** ${JSON.stringify(data.error)}\n`;
            } else {
                const content = data.choices[0].message.content;
                console.log(`Successfully received response from ${model}`);
                combinedOutput += content + "\n";
            }
        } catch (e) {
            console.error(`Fetch failed for ${model}`, e);
            combinedOutput += `**Network/Fetch Error:** ${e.message}\n`;
        }
    }

    fs.writeFileSync('/Users/user1000/.gemini/antigravity/brain/6b60cbfe-4127-4b5f-93dc-4d628feefd09/live_advanced_reasoning_audit_validated.md', combinedOutput);
    console.log("Audit complete and saved to artifact.");
}

runAudit();
