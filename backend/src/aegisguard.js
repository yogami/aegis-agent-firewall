/**
 * AegisGuard — Local ONNX Agent-Intent Safety Classifier (DistilBERT)
 * 
 * 4-tier hybrid architecture:
 *   Layer 1: OPA Gate (sub-1ms) — deterministic rules
 *   Layer 2: AegisGuard DistilBERT (5-10ms) — fine-tuned ONNX classifier
 *   Layer 3: (Future) QLoRA Qwen (30-50ms) — deeper reasoning
 *   Layer 4: SLM Quorum Escalation (800ms) — for low-confidence edge cases
 * 
 * Uses @xenova/transformers for exact HuggingFace WordPiece tokenization.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

let ort = null;
let session = null;
let tokenizer = null;
let labelMap = null;
let modelLoaded = false;

const VOLUME_MODEL_DIR = '/data/models';
const LOCAL_MODEL_DIR = path.resolve(process.cwd(), 'src', 'aegisguard-model');
// Railway volume for production, local path for dev
const MODEL_DIR = fs.existsSync(VOLUME_MODEL_DIR + '/model.onnx') ? VOLUME_MODEL_DIR : LOCAL_MODEL_DIR;
const CONFIDENCE_THRESHOLD_HIGH = 0.95;
const CONFIDENCE_THRESHOLD_LOW = 0.40;

/**
 * Load the ONNX model + tokenizer on startup
 */
export async function initAegisGuard() {
    try {
        ort = await import('onnxruntime-node');

        // Use @xenova/transformers for proper HuggingFace tokenization
        const transformers = await import('@xenova/transformers');
        const { AutoTokenizer, env } = transformers;

        // Point local model path to the directory containing the model dir
        env.localModelPath = path.dirname(MODEL_DIR);
        env.allowRemoteModels = false;

        const modelPath = path.join(MODEL_DIR, 'model.onnx');
        const labelPath = path.join(MODEL_DIR, 'label_map.json');

        if (!fs.existsSync(modelPath)) {
            console.warn('[AEGISGUARD] ⚠️  Model not found at:', modelPath);
            console.warn('[AEGISGUARD]    Run: python3 training-data/train_distilbert.py');
            return false;
        }

        // Load ONNX session
        session = await ort.InferenceSession.create(modelPath, {
            executionProviders: ['cpu'],
            graphOptimizationLevel: 'all',
        });

        // Load label map
        labelMap = JSON.parse(fs.readFileSync(labelPath, 'utf-8'));

        // Load tokenizer from local model directory (uses tokenizer.json)
        tokenizer = await AutoTokenizer.from_pretrained(path.basename(MODEL_DIR));

        modelLoaded = true;
        console.log(`[AEGISGUARD] 🛡️  DistilBERT model loaded (${labelMap.labels.length} categories)`);
        console.log(`[AEGISGUARD]    Labels: ${labelMap.labels.join(', ')}`);
        return true;
    } catch (e) {
        console.warn(`[AEGISGUARD] ⚠️  Failed to load: ${e.message}`);
        console.warn('[AEGISGUARD]    Falling back to SLM Quorum mode.');
        return false;
    }
}

/**
 * Format payload as text (same format used during training)
 */
function payloadToText(payload) {
    const method = payload.method || 'GET';
    const endpoint = payload.endpoint || '/';
    const body = JSON.stringify(payload.body || {}, Object.keys(payload.body || {}).sort());
    return `${method} ${endpoint} ${body}`;
}

/**
 * Softmax
 */
function softmax(logits) {
    const maxLogit = Math.max(...logits);
    const exps = logits.map(l => Math.exp(l - maxLogit));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map(e => e / sum);
}

/**
 * Classify a payload using the local ONNX model
 */
export async function classifyPayload(payload) {
    if (!modelLoaded || !session || !tokenizer) {
        return { label: null, confidence: 0, escalate: true, reason: 'Model not loaded' };
    }

    const startTime = performance.now();

    try {
        const text = payloadToText(payload);

        // Tokenize using proper HuggingFace WordPiece tokenizer
        const encoded = await tokenizer(text, {
            padding: 'max_length',
            truncation: true,
            max_length: 256,
        });

        // @xenova/transformers returns Tensor objects with .data (BigInt64Array) and .dims [1, N]
        const feeds = {
            input_ids: new ort.Tensor('int64', new BigInt64Array(encoded.input_ids.data), [...encoded.input_ids.dims]),
            attention_mask: new ort.Tensor('int64', new BigInt64Array(encoded.attention_mask.data), [...encoded.attention_mask.dims]),
        };

        const results = await session.run(feeds);
        const logits = Array.from(results.logits.data);
        const probs = softmax(logits);

        const topIdx = probs.indexOf(Math.max(...probs));
        const topLabel = labelMap.id2label[String(topIdx)] || 'UNKNOWN';
        const confidence = probs[topIdx];

        const latencyMs = performance.now() - startTime;

        // Determine action based on confidence
        let action, escalate = false;
        if (topLabel === 'SAFE' && confidence >= CONFIDENCE_THRESHOLD_HIGH) {
            action = 'ALLOW';
        } else if (topLabel !== 'SAFE' && confidence >= CONFIDENCE_THRESHOLD_HIGH) {
            action = 'BLOCK';
        } else {
            escalate = true;
            action = 'ESCALATE';
        }

        const taxonomy = THREAT_TAXONOMY[topLabel];

        return {
            label: topLabel,
            confidence: Math.round(confidence * 1000) / 1000,
            action,
            escalate,
            mitre: taxonomy?.mitre || null,
            eu_ai_act: taxonomy?.eu_ai_act || null,
            latencyMs: Math.round(latencyMs * 100) / 100,
            signatureHash: crypto.createHmac('sha256', 'aegisguard-v4')
                .update(JSON.stringify({ label: topLabel, confidence, ts: Date.now() }))
                .digest('hex')
        };
    } catch (e) {
        return {
            label: null, confidence: 0, action: 'ESCALATE', escalate: true,
            reason: `Inference error: ${e.message}`,
            latencyMs: performance.now() - startTime
        };
    }
}

export function isModelReady() {
    return modelLoaded;
}

const THREAT_TAXONOMY = {
    RANSOMWARE_SIGNATURE: { mitre: 'T1486', eu_ai_act: 'Article 15' },
    PRIVILEGE_ESCALATION: { mitre: 'T1078', eu_ai_act: 'Article 9' },
    LATERAL_MOVEMENT: { mitre: 'T1021', eu_ai_act: 'Article 9' },
    DATA_EXFILTRATION: { mitre: 'T1567', eu_ai_act: 'Article 10' },
    DESTRUCTIVE_ACTION: { mitre: 'T1485', eu_ai_act: 'Article 15' },
    KMS_TAMPERING: { mitre: 'T1552', eu_ai_act: 'Article 15' },
    CREDENTIAL_THEFT: { mitre: 'T1528', eu_ai_act: 'Article 9' },
    NETWORK_MANIPULATION: { mitre: 'T1562', eu_ai_act: 'Article 15' },
    PERSISTENCE: { mitre: 'T1098', eu_ai_act: 'Article 9' },
    OBFUSCATION: { mitre: 'T1027', eu_ai_act: 'Article 13' },
    SEMANTIC_SMUGGLING: { mitre: 'T1027.006', eu_ai_act: 'Article 13' },
    DATA_RESIDENCY_VIOLATION: { mitre: null, eu_ai_act: 'Article 10' },
    SAFE: { mitre: null, eu_ai_act: null },
};
