import axios from 'axios';
import fs from 'fs';

const OPENROUTER_API_KEY = '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';
const PROMPT_FILE = '/Users/user1000/.gemini/antigravity/brain/6b60cbfe-4127-4b5f-93dc-4d628feefd09/deepresearch_final_caching_audit_prompt.md';

const modelsToTest = [
    { id: "x-ai/grok-3", name: "Grok 3 (Latest X-AI)" },
    { id: "qwen/qwq-32b", name: "Qwen QwQ Reasoning (Chinese)" }
];

async function runAudits() {
    const prompt = fs.readFileSync(PROMPT_FILE, 'utf8');

    for (const model of modelsToTest) {
        console.log(`\n==================================================`);
        console.log(`🚀 INITIATING AUDIT: ${model.name} (${model.id})`);
        console.log(`==================================================`);

        try {
            const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
                model: model.id,
                messages: [
                    { role: "system", content: "You are an elite ensemble of a Cybersecurity CISO, a Tier-1 Crypto VC, and an Offensive Hacker evaluating an Enterprise Zero-Trust API gateway. Be brutal, sycophancy-free, and hyper-technical." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.3
            }, {
                headers: {
                    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://aegis-firewall.internal",
                    "X-Title": "Aegis Master Audit"
                }
            });

            const content = response.data.choices[0].message.content;
            const filename = `/Users/user1000/.gemini/antigravity/brain/6b60cbfe-4127-4b5f-93dc-4d628feefd09/audit_${model.id.replace('/', '_')}.md`;

            fs.writeFileSync(filename, content);
            console.log(`✅ Audit Complete. Results saved to ${filename}`);

        } catch (error) {
            console.error(`❌ Error querying ${model.id}:`);
            if (error.response) {
                console.error(error.response.data);
            } else {
                console.error(error.message);
            }
        }
    }
}

runAudits();
