import fs from 'fs';
import path from 'path';

export async function logBlockedTransaction(requestId, payload, gatewayReasons) {
    try {
        const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
        console.log(`[AUDIT] [${requestId}] Initiating async explainability generation for blocked payload...`);

        const prompt = `System: You are an enterprise AI Security Auditor.
A transaction was just blocked by the Aegis Zero-Trust Firewall.
Analyze the payload and provide a brief, 1-2 sentence rationale explaining WHY it is malicious or violates safe AI agent policies (e.g., prompt injection, semantic camouflage, data exfiltration).
This is for EU AI Act compliance logs. Maintain a professional, forensic tone.

Blocked Payload:
${JSON.stringify(payload)}

Gateway Internal Reasons:
${JSON.stringify(gatewayReasons)}
`;

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "openai/gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.1,
            })
        });

        if (!response.ok) throw new Error(`Audit LLM failed: HTTP ${response.status}`);

        const data = await response.json();
        const rationale = data.choices[0].message.content.trim();

        const logEntry = {
            request_id: requestId,
            timestamp: new Date().toISOString(),
            eu_compliance_rationale: rationale,
            system_reasons: gatewayReasons,
            payload: payload
        };

        // Append to local audit.log (In production this would pipe to Datadog or an S3 Bucket)
        const logPath = path.resolve(process.cwd(), 'aegis_audit.log');
        fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');

        console.log(`[AUDIT] [${requestId}] Explainability log successfully generated and saved to aegis_audit.log`);

    } catch (e) {
        console.error(`[AUDIT] [${requestId}] Failed to generate asynchronous rationale:`, e.message);
    }
}
