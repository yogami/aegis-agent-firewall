import fs from 'fs';

const API_KEY = "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";

const models = [
    "openai/o3-mini",
    "anthropic/claude-3-5-sonnet",
    "deepseek/deepseek-chat"
];

const indexJs = fs.readFileSync('/Users/user1000/gitprojects/aegis-agent-firewall/backend/src/index.js', 'utf8');
const guardianJs = fs.readFileSync('/Users/user1000/gitprojects/aegis-agent-firewall/backend/src/guardian.js', 'utf8');
const implPlan = fs.readFileSync('/Users/user1000/.gemini/antigravity/brain/6b60cbfe-4127-4b5f-93dc-4d628feefd09/implementation_plan.md', 'utf8');
const analysis = fs.readFileSync('/Users/user1000/.gemini/antigravity/brain/6b60cbfe-4127-4b5f-93dc-4d628feefd09/aegis_survivorship_analysis.md', 'utf8');

const prompt = `I am a Y Combinator founder deploying an enterprise Zero-Trust Agent Firewall (Aegis V2) to secure autonomous Web3/Cloud agents. 
We use Multi-Party Computation (FROST 3-of-5) across Static Guardian Nodes, gated by SLM semantic intent evaluation. 
To achieve sub-100ms synchronous latency, we use Speculative Parallelization (forking the math and SLM inference) and Optimistic Aggregation. 
We use strict 8KB and regex Layer-7 middleware to prevent context exhaustion and nonce-draining. We have deprecated asynchronous 202 requests to guarantee CI/CD state reconciliation.

You must act as a consortium of the following personas:
1. F500 CISO (The Procurement Executioner)
2. Teenage APT Hacker Anonymous Group (Void_0x)
3. Tier 1 Deep Tech VC
4. Pragmatic Enterprise CTO
5. Distributed Systems & Cryptography Researcher

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
=== aegis_survivorship_analysis.md ===
${analysis}
`;

async function runAudit() {
    let combinedOutput = "# Live OpenRouter Final Architect Audit\n\n";

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

    fs.writeFileSync('/Users/user1000/.gemini/antigravity/brain/6b60cbfe-4127-4b5f-93dc-4d628feefd09/live_o3_claude_audit.md', combinedOutput);
    console.log("Audit complete and saved to artifact.");
}

runAudit();
