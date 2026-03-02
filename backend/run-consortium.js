import fs from 'fs';

const OPENROUTER_API_KEY = "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";

const context = `Aegis is an API firewall designed specifically to stop "Rogue AI Agents" from executing logically destructive actions (like rotating AWS KMS keys or deleting backups). It works by placing an API Gateway in front of enterprise resources. 5 independent "Virtual Guardian" nodes evaluate the *semantic intent* of the JSON payload payload using an SLM (Small Language Model). If 3 out of 5 nodes vote the intent is safe, they combine cryptographic shards to sign the payload and forward it. The latest live benchmark against OpenRouter Llama3/gpt-4o-mini showed a 100% True Positive Rate and <400ms latency. The company is pitching at the Soonami Venturethon for $125k to train a proprietary, local 2B parameter security SLM deployed on enterprise edges to drop latency to <15ms. The deployment model is strictly Bring-Your-Own-Cloud (BYOC) Air-gapped to avoid liability.`;

const personas = [
    {
        id: "CISO",
        model: "anthropic/claude-3-haiku:beta",
        prompt: `You are a Fortune 500 CISO. Be ruthless and sycophancy-free. Evaluate the Aegis Agent Firewall. Focus on integration friction, compliance (SOC2/HIPAA), enterprise liability, the False Positive vs False Negative risk, and if the BYOC deployment model actually shields you. Keep your response to 2 paragraphs.\n\nContext: ${context}`
    },
    {
        id: "Hacker",
        model: "meta-llama/llama-3.2-3b-instruct",
        prompt: `You are a Teenage APT Hacker. Be ruthless. Evaluate how to bypass the Aegis Agent Firewall's semantic SLM evaluators. How do you poison the context? What happens when you use polyglot injections, esoteric languages, or cram 50k tokens of junk logging data to push the malicious payload out of the SLM's attention window? Keep your response to 2 paragraphs.\n\nContext: ${context}`
    },
    {
        id: "VC",
        model: "openai/gpt-4o-mini",
        prompt: `You are a Tier 1 VC Partner at Sequoia. Be brutal. Evaluate the Aegis Agent Firewall market classification (Red/Blue/Dead Ocean). Determine business viability, defensibility against incumbents (Cloudflare, Palo Alto), and if a $125k investment into a customized local SLM is actually a moat. Give a hard GO or NO-GO. Keep your response to 2 paragraphs.\n\nContext: ${context}`
    },
    {
        id: "Legal",
        model: "google/gemini-2.0-flash-lite-preview-02-05:free",
        prompt: `You are an Enterprise Legal & Compliance Officer. Be ruthless. Evaluate Aegis Agent Firewall's liability stance. If an enterprise gives Aegis's open-source gateway access to its infrastructure and a rogue payload slips through (False Negative), who is sued? Does the BYOC (Bring Your Own Cloud) licensing model actually protect the Aegis startup from catastrophic liability? Keep your response to 2 paragraphs.\n\nContext: ${context}`
    },
    {
        id: "CTO",
        model: "deepseek/deepseek-chat:free",
        prompt: `You are a Pragmatic, highly technical CTO. Be brutal. Evaluate the Aegis Agent Firewall MPC/TSS architecture. Is 3-of-5 threshold signing synchronous API traffic scalable? Does the proposed local 2B parameter SLM sidecar actually fix the 400ms latency issue, or does it introduce cold-start and memory-bloat problems on the enterprise edge? Keep your response to 2 paragraphs.\n\nContext: ${context}`
    }
];

async function runConsortium() {
    console.log("Starting Live OpenRouter Consortium Audit...\n");
    let markdownOutput = "# Live LLM Consortium Audit (OpenRouter Frontier Models)\n\n";

    for (const persona of personas) {
        console.log(`[Querying ${persona.model}] as The ${persona.id}...`);

        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: persona.model,
                    messages: [{ role: "user", content: persona.prompt }],
                    temperature: 0.7,
                })
            });

            if (!response.ok) {
                console.error(`Error querying ${persona.model}: ${response.statusText}`);
                markdownOutput += `## The ${persona.id} (${persona.model})\n\n*Error: API Request Failed*\n\n`;
                continue;
            }

            const data = await response.json();
            const text = data.choices[0].message.content;

            markdownOutput += `## The ${persona.id} (${persona.model})\n\n${text}\n\n---\n\n`;
            console.log(`✅ Received response from ${persona.id}\n`);

        } catch (e) {
            console.error(`Network error for ${persona.model}:`, e);
            markdownOutput += `## The ${persona.id} (${persona.model})\n\n*Error: Network Failure*\n\n`;
        }
    }

    fs.writeFileSync('/Users/user1000/.gemini/antigravity/brain/6b60cbfe-4127-4b5f-93dc-4d628feefd09/live_openrouter_consortium_audit.md', markdownOutput);
    console.log("Consortium Audit Complete! Saved to live_openrouter_consortium_audit.md");
}

runConsortium();
