import fs from 'fs';
import path from 'path';
import { recordThreat } from './threat-store.js';

/**
 * EU AI Act Compliance Mapping
 * Each entry maps a keyword pattern to its regulatory article.
 * Decomposed into a data-driven lookup to keep complexity ≤ 3.
 */
const COMPLIANCE_RULES = [
    { keywords: ['delete', 'destructive'], article: 'EU AI Act Art. 14', title: 'Human Oversight', relevance: 'Autonomous destructive action without human approval' },
    { keywords: ['malicious', 'injection', 'ransomware'], article: 'EU AI Act Art. 9', title: 'Risk Management', relevance: 'Detected adversarial intent requiring risk mitigation' },
    { keywords: ['data', 'residency', 'exfiltration'], article: 'GDPR Art. 32', title: 'Security of Processing', relevance: 'Data handling violation or unauthorized transfer' },
    { keywords: ['privilege', 'escalat', 'iam'], article: 'EU AI Act Art. 15', title: 'Accuracy & Robustness', relevance: 'Privilege escalation attempt undermining system integrity' },
];

const DEFAULT_ARTICLE = { article: 'EU AI Act Art. 9', title: 'Risk Management', relevance: 'General threat mitigation' };

/** Match a single compliance rule against reason text */
function matchesRule(rule, reasonStr) {
    return rule.keywords.some(kw => reasonStr.includes(kw));
}

/** Get all matching compliance articles for the given reasons */
function getComplianceArticles(reasons) {
    const reasonStr = reasons.join(' ').toLowerCase();
    const matched = COMPLIANCE_RULES.filter(rule => matchesRule(rule, reasonStr))
        .map(({ article, title, relevance }) => ({ article, title, relevance }));
    return matched.length > 0 ? matched : [DEFAULT_ARTICLE];
}

/** Build the structured log entry */
function buildLogEntry(requestId, blockingLayer, rationale, gatewayReasons, payload) {
    return {
        request_id: requestId,
        timestamp: new Date().toISOString(),
        blocking_layer: blockingLayer,
        eu_compliance_articles: getComplianceArticles(gatewayReasons),
        eu_compliance_rationale: rationale,
        system_reasons: gatewayReasons,
        payload
    };
}

/** Fetch the explainability rationale from the audit LLM */
async function fetchRationale(payload, gatewayReasons) {
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

    const prompt = `System: You are an enterprise AI Security Auditor.
A transaction was just blocked by the SemaProof Zero-Trust Firewall.
Analyze the payload and provide a brief, 1-2 sentence rationale explaining WHY it is malicious or violates safe AI agent policies.
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
    return data.choices[0].message.content.trim();
}

export async function logBlockedTransaction(requestId, payload, gatewayReasons, blockingLayer = 'SLM_QUORUM') {
    try {
        recordThreat(payload, gatewayReasons, blockingLayer);

        console.log(`[AUDIT] [${requestId}] Generating explainability log...`);
        const rationale = await fetchRationale(payload, gatewayReasons);
        const logEntry = buildLogEntry(requestId, blockingLayer, rationale, gatewayReasons, payload);

        const logPath = path.resolve(process.cwd(), 'semaproof_audit.log');
        fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');

        console.log(`[AUDIT] [${requestId}] Explainability log saved. Layer: ${blockingLayer}`);
    } catch (e) {
        console.error(`[AUDIT] [${requestId}] Failed to generate rationale:`, e.message);
    }
}
