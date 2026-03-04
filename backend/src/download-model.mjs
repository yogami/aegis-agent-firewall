#!/usr/bin/env node
/**
 * Download AegisGuard ONNX model if not present.
 * Checks: Railway volume (/data/models) → local model dir → downloads from GitHub Release.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VOLUME_DIR = '/data/models';
const LOCAL_DIR = path.join(__dirname, 'aegisguard-model');
const MODEL_FILE = 'model.onnx';

// GitHub Release URL for the model (update after creating the release)
const MODEL_URL = process.env.AEGISGUARD_MODEL_URL ||
    'https://github.com/yogami/aegis-agent-firewall/releases/download/v4.0.0/model.onnx';

function download(url, dest) {
    return new Promise((resolve, reject) => {
        console.log(`[AEGISGUARD SETUP] Downloading model from ${url}...`);
        console.log(`[AEGISGUARD SETUP] Destination: ${dest}`);

        const file = fs.createWriteStream(dest);

        const get = (url) => {
            https.get(url, (response) => {
                // Handle redirects (GitHub releases redirect)
                if (response.statusCode === 301 || response.statusCode === 302) {
                    console.log(`[AEGISGUARD SETUP] Following redirect...`);
                    get(response.headers.location);
                    return;
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}`));
                    return;
                }

                const total = parseInt(response.headers['content-length'], 10);
                let downloaded = 0;

                response.on('data', (chunk) => {
                    downloaded += chunk.length;
                    if (total) {
                        const pct = ((downloaded / total) * 100).toFixed(1);
                        process.stdout.write(`\r[AEGISGUARD SETUP] ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`);
                    }
                });

                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    console.log('\n[AEGISGUARD SETUP] ✅ Download complete.');
                    resolve();
                });
            }).on('error', reject);
        };

        get(url);
    });
}

async function main() {
    // Check 1: Volume already has the model
    if (fs.existsSync(path.join(VOLUME_DIR, MODEL_FILE))) {
        const size = fs.statSync(path.join(VOLUME_DIR, MODEL_FILE)).size;
        if (size > 1000) { // Not an LFS pointer
            console.log(`[AEGISGUARD SETUP] ✅ Model found in volume (${(size / 1024 / 1024).toFixed(1)} MB)`);
            return;
        }
    }

    // Check 2: Local dir has a real model (not LFS pointer)
    const localModel = path.join(LOCAL_DIR, MODEL_FILE);
    if (fs.existsSync(localModel)) {
        const size = fs.statSync(localModel).size;
        if (size > 1000) { // Real file, not LFS pointer
            console.log(`[AEGISGUARD SETUP] ✅ Model found locally (${(size / 1024 / 1024).toFixed(1)} MB)`);

            // Copy to volume if volume exists
            if (fs.existsSync(VOLUME_DIR)) {
                console.log(`[AEGISGUARD SETUP] Copying to volume for persistence...`);
                fs.copyFileSync(localModel, path.join(VOLUME_DIR, MODEL_FILE));
                // Copy tokenizer files too
                for (const f of ['label_map.json', 'tokenizer.json', 'tokenizer_config.json', 'vocab.txt', 'config.json', 'special_tokens_map.json']) {
                    const src = path.join(LOCAL_DIR, f);
                    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(VOLUME_DIR, f));
                }
                console.log(`[AEGISGUARD SETUP] ✅ Copied to volume.`);
            }
            return;
        }
        console.log(`[AEGISGUARD SETUP] ⚠️ Local model is LFS pointer (${size} bytes). Downloading real file.`);
    }

    // Check 3: Download from GitHub Release
    const targetDir = fs.existsSync(VOLUME_DIR) ? VOLUME_DIR : LOCAL_DIR;
    fs.mkdirSync(targetDir, { recursive: true });

    try {
        await download(MODEL_URL, path.join(targetDir, MODEL_FILE));

        // Also copy tokenizer files from local to volume if downloading to volume
        if (targetDir === VOLUME_DIR && fs.existsSync(LOCAL_DIR)) {
            for (const f of ['label_map.json', 'tokenizer.json', 'tokenizer_config.json', 'vocab.txt', 'config.json', 'special_tokens_map.json']) {
                const src = path.join(LOCAL_DIR, f);
                if (fs.existsSync(src)) fs.copyFileSync(src, path.join(VOLUME_DIR, f));
            }
        }
    } catch (e) {
        console.warn(`[AEGISGUARD SETUP] ⚠️ Download failed: ${e.message}`);
        console.warn(`[AEGISGUARD SETUP]    AegisGuard will run in fallback mode (SLM Quorum).`);
    }
}

main();
