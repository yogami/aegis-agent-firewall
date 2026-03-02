import axios from 'axios';
import fs from 'fs';

const OPENROUTER_API_KEY = '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';
const PROMPT_FILE = '/Users/user1000/.gemini/antigravity/brain/6b60cbfe-4127-4b5f-93dc-4d628feefd09/deepresearch_final_caching_audit_prompt.md';

async function queryChineseModels() {
    try {
        const prompt = fs.readFileSync(PROMPT_FILE, 'utf8');

        console.log("==================================================");
        console.log("🇨🇳 INITIATING ADVANCED REASONING AUDIT");
        console.log("Model: deepseek/deepseek-r1 (March 2026 Era)");
        console.log("==================================================\n");

        console.log("Transmitting the identical CISO/Hacker prompt to DeepSeek R1...");

        const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
            model: "deepseek/deepseek-r1",
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
                "X-Title": "Aegis DeepSeek Audit"
            }
        });

        const r1Response = response.data.choices[0].message.content;

        fs.writeFileSync('/Users/user1000/.gemini/antigravity/brain/6b60cbfe-4127-4b5f-93dc-4d628feefd09/chinese_reasoning_r1_audit.md', r1Response);
        console.log("\n✅ DeepSeek R1 Audit Complete. Results saved to artifacts.");

    } catch (error) {
        console.error("OpenRouter Error:");
        if (error.response) {
            console.error(error.response.data);
        } else {
            console.error(error.message);
        }
    }
}

queryChineseModels();
