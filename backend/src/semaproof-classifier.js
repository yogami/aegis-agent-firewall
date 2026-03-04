/**
 * SemaProof — Local ONNX Agent-Intent Safety Classifier (DistilBERT)
 * 
 * 4-tier hybrid architecture:
 *   Layer 1: OPA Gate (sub-1ms) — deterministic rules
 *   Layer 2: SemaProof DistilBERT (5-10ms) — fine-tuned ONNX classifier
 *   Layer 3: (Future) QLoRA Qwen (30-50ms) — deeper reasoning
 *   Layer 4: SLM Quorum Escalation (800ms) — for low-confidence edge cases
 * 
 * Uses @xenova/transformers for exact HuggingFace WordPiece tokenization.
 * On Railway: auto-downloads model from GitHub Release into persistent volume.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';

let ort = null;
let session = null;
let tokenizer = null;
let labelMap = null;
let modelLoaded = false;
let _transformersEnv = null;

const VOLUME_MODEL_DIR = '/data/models';
const LOCAL_MODEL_DIR = path.resolve(process.cwd(), 'src', 'semaproof-model');
const CONFIDENCE_THRESHOLD_HIGH = 0.95;
const CONFIDENCE_THRESHOLD_LOW = 0.40;

// GitHub Release config (for auto-download on Railway)
const GH_REPO = 'yogami/aegis-agent-firewall';
const GH_TAG = 'v4.0.0';

/**
 * Determine which model directory to use
 */
function resolveModelDir() {
    // Check volume first (Railway persistent storage)
    const volumeModel = path.join(VOLUME_MODEL_DIR, 'model.onnx');
    if (fs.existsSync(volumeModel) && fs.statSync(volumeModel).size > 10000) {
        return VOLUME_MODEL_DIR;
    }
    // Check local
    const localModel = path.join(LOCAL_MODEL_DIR, 'model.onnx');
    if (fs.existsSync(localModel) && fs.statSync(localModel).size > 10000) {
        return LOCAL_MODEL_DIR;
    }
    return null;
}

/**
 * Download a file via HTTPS with redirect support
 */
function downloadFile(url, dest, headers = {}) {
    return new Promise((resolve, reject) => {
        const get = (url) => {
            const opts = new URL(url);
            opts.headers = { 'User-Agent': 'semaproof', ...headers };
            https.get(opts, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    get(res.headers.location);
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                const file = fs.createWriteStream(dest);
                const total = parseInt(res.headers['content-length'], 10);
                let downloaded = 0;
                res.on('data', (chunk) => {
                    downloaded += chunk.length;
                    if (total && downloaded % (10 * 1024 * 1024) < chunk.length) {
                        console.log(`[SEMAPROOF] ⬇️  ${((downloaded / total) * 100).toFixed(0)}% (${(downloaded / 1024 / 1024).toFixed(0)} MB)`);
                    }
                });
                res.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
            }).on('error', reject);
        };
        get(url);
    });
}

/**
 * Download model from GitHub Release (for Railway deploy)
 */
async function downloadModelFromRelease(targetDir) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        console.warn('[SEMAPROOF] ⚠️  GITHUB_TOKEN not set. Cannot download model.');
        return false;
    }

    try {
        // Get release asset URL
        const apiResp = await new Promise((resolve, reject) => {
            const opts = new URL(`https://api.github.com/repos/${GH_REPO}/releases/tags/${GH_TAG}`);
            opts.headers = { 'User-Agent': 'semaproof', 'Authorization': `token ${token}` };
            https.get(opts, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ status: res.statusCode, data }));
            }).on('error', reject);
        });

        if (apiResp.status !== 200) throw new Error(`GitHub API ${apiResp.status}`);

        const release = JSON.parse(apiResp.data);
        const asset = release.assets?.find(a => a.name === 'model.onnx');
        if (!asset) throw new Error('model.onnx not found in release');

        console.log(`[SEMAPROOF] ⬇️  Downloading model (${(asset.size / 1024 / 1024).toFixed(0)} MB) from GitHub Release...`);

        fs.mkdirSync(targetDir, { recursive: true });
        await downloadFile(asset.url, path.join(targetDir, 'model.onnx'), {
            'Authorization': `token ${token}`,
            'Accept': 'application/octet-stream'
        });

        // Copy tokenizer files from local dir to target
        for (const f of ['label_map.json', 'tokenizer.json', 'tokenizer_config.json', 'vocab.txt', 'config.json', 'special_tokens_map.json']) {
            const src = path.join(LOCAL_MODEL_DIR, f);
            if (fs.existsSync(src)) fs.copyFileSync(src, path.join(targetDir, f));
        }

        console.log('[SEMAPROOF] ✅  Model downloaded successfully!');
        return true;
    } catch (e) {
        console.warn(`[SEMAPROOF] ⚠️  Download failed: ${e.message}`);
        return false;
    }
}

/**
 * Load the ONNX model from a given directory
 */
async function loadModel(modelDir) {
    const modelPath = path.join(modelDir, 'model.onnx');
    const labelPath = path.join(modelDir, 'label_map.json');

    session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
    });

    labelMap = JSON.parse(fs.readFileSync(labelPath, 'utf-8'));

    // Set up tokenizer path
    _transformersEnv.localModelPath = path.dirname(modelDir);
    _transformersEnv.allowRemoteModels = false;

    const { AutoTokenizer } = await import('@xenova/transformers');
    tokenizer = await AutoTokenizer.from_pretrained(path.basename(modelDir));

    modelLoaded = true;
    console.log(`[SEMAPROOF] 🛡️  DistilBERT model loaded from ${modelDir} (${labelMap.labels.length} categories)`);
    console.log(`[SEMAPROOF]    Labels: ${labelMap.labels.join(', ')}`);
}

/**
 * Initialize SemaProof — returns immediately, downloads model in background if needed
 */
export async function initSemaProof() {
    try {
        ort = await import('onnxruntime-node');
        const transformers = await import('@xenova/transformers');
        _transformersEnv = transformers.env;

        // Try to find a valid model
        const modelDir = resolveModelDir();

        if (modelDir) {
            // Model found — load it
            await loadModel(modelDir);
            return true;
        }

        // No valid model found — attempt async download (don't block server startup)
        console.log('[SEMAPROOF] ⚠️  No valid model found. Attempting background download...');

        // Fire-and-forget download
        const targetDir = fs.existsSync(VOLUME_MODEL_DIR) ? VOLUME_MODEL_DIR : LOCAL_MODEL_DIR;
        downloadModelFromRelease(targetDir).then(async (ok) => {
            if (ok) {
                try {
                    await loadModel(targetDir);
                    console.log('[SEMAPROOF] 🔥  Hot-swapped to V4! SemaProof now active.');
                } catch (e) {
                    console.warn(`[SEMAPROOF] ⚠️  Post-download load failed: ${e.message}`);
                }
            }
        }).catch(e => console.warn(`[SEMAPROOF] ⚠️  Background download error: ${e.message}`));

        return false; // Server starts in V3 mode, will hot-swap later
    } catch (e) {
        console.warn(`[SEMAPROOF] ⚠️  Failed to load: ${e.message}`);
        console.warn('[SEMAPROOF]    Falling back to SLM Quorum mode.');
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
        const encoded = await tokenizer(text, { padding: 'max_length', truncation: true, max_length: 256 });

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
            action, escalate,
            mitre: taxonomy?.mitre || null,
            eu_ai_act: taxonomy?.eu_ai_act || null,
            latencyMs: Math.round(latencyMs * 100) / 100,
            signatureHash: crypto.createHmac('sha256', 'semaproof-v4')
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

export function isModelReady() { return modelLoaded; }

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
