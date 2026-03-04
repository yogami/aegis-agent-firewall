#!/usr/bin/env node
/**
 * Download SemaProof ONNX model if not present.
 * Checks: Railway volume (/data/models) → local model dir → downloads from GitHub Release.
 * For private repos, set GITHUB_TOKEN env var in Railway.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VOLUME_DIR = '/data/models';
const LOCAL_DIR = path.join(__dirname, 'semaproof-model');
const MODEL_FILE = 'model.onnx';

// GitHub Release config for private repos
const GH_REPO = 'yogami/aegis-agent-firewall';
const GH_TAG = 'v4.0.0';
const GH_TOKEN = process.env.GITHUB_TOKEN || '';

function httpGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const opts = new URL(url);
        opts.headers = { 'User-Agent': 'semaproof-setup', ...headers };

        https.get(opts, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                const nextHeaders = res.headers.location?.includes('api.github.com') ? headers : {};
                resolve(httpGet(res.headers.location, nextHeaders));
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
        }).on('error', reject);
    });
}

function downloadFile(url, dest, headers = {}) {
    return new Promise((resolve, reject) => {
        console.log(`[SEMAPROOF SETUP] Downloading to ${dest}...`);
        const file = fs.createWriteStream(dest);

        const get = (url) => {
            const opts = new URL(url);
            opts.headers = { 'User-Agent': 'semaproof-setup', ...headers };

            https.get(opts, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    get(res.headers.location);
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                const total = parseInt(res.headers['content-length'], 10);
                let downloaded = 0;
                res.on('data', (chunk) => {
                    downloaded += chunk.length;
                    if (total) process.stdout.write(`\r[SEMAPROOF SETUP] ${((downloaded / total) * 100).toFixed(1)}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`);
                });
                res.pipe(file);
                file.on('finish', () => { file.close(); console.log('\n[SEMAPROOF SETUP] ✅ Download complete.'); resolve(); });
            }).on('error', reject);
        };
        get(url);
    });
}

async function getAssetUrl() {
    const headers = {};
    if (GH_TOKEN) headers['Authorization'] = `token ${GH_TOKEN}`;

    const resp = await httpGet(`https://api.github.com/repos/${GH_REPO}/releases/tags/${GH_TAG}`, headers);
    if (resp.status !== 200) {
        throw new Error(`GitHub API ${resp.status}: ${resp.data.slice(0, 200)}`);
    }

    const release = JSON.parse(resp.data);
    const asset = release.assets?.find(a => a.name === MODEL_FILE);
    if (!asset) throw new Error(`Asset ${MODEL_FILE} not found in release ${GH_TAG}`);

    console.log(`[SEMAPROOF SETUP] Found asset: ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)} MB)`);
    return { url: asset.url, size: asset.size };
}

async function main() {
    // Check 1: Volume already has the model
    if (fs.existsSync(path.join(VOLUME_DIR, MODEL_FILE))) {
        const size = fs.statSync(path.join(VOLUME_DIR, MODEL_FILE)).size;
        if (size > 10000) {
            console.log(`[SEMAPROOF SETUP] ✅ Model found in volume (${(size / 1024 / 1024).toFixed(1)} MB)`);
            return;
        }
    }

    // Check 2: Local dir has a real model (not LFS pointer)
    const localModel = path.join(LOCAL_DIR, MODEL_FILE);
    if (fs.existsSync(localModel)) {
        const size = fs.statSync(localModel).size;
        if (size > 10000) {
            console.log(`[SEMAPROOF SETUP] ✅ Model found locally (${(size / 1024 / 1024).toFixed(1)} MB)`);
            if (fs.existsSync(VOLUME_DIR)) {
                console.log(`[SEMAPROOF SETUP] Copying to volume...`);
                fs.copyFileSync(localModel, path.join(VOLUME_DIR, MODEL_FILE));
                for (const f of ['label_map.json', 'tokenizer.json', 'tokenizer_config.json', 'vocab.txt', 'config.json', 'special_tokens_map.json']) {
                    const src = path.join(LOCAL_DIR, f);
                    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(VOLUME_DIR, f));
                }
            }
            return;
        }
        console.log(`[SEMAPROOF SETUP] ⚠️ Local model is LFS pointer (${size} bytes). Downloading...`);
    }

    // Check 3: Download from GitHub Release
    if (!GH_TOKEN) {
        console.warn(`[SEMAPROOF SETUP] ⚠️ GITHUB_TOKEN not set. Cannot download from private repo.`);
        console.warn(`[SEMAPROOF SETUP]    Set GITHUB_TOKEN in Railway variables.`);
        return;
    }

    const targetDir = fs.existsSync(VOLUME_DIR) ? VOLUME_DIR : LOCAL_DIR;
    fs.mkdirSync(targetDir, { recursive: true });

    try {
        const { url } = await getAssetUrl();
        await downloadFile(url, path.join(targetDir, MODEL_FILE), {
            'Authorization': `token ${GH_TOKEN}`,
            'Accept': 'application/octet-stream'
        });

        if (targetDir !== LOCAL_DIR && fs.existsSync(LOCAL_DIR)) {
            for (const f of ['label_map.json', 'tokenizer.json', 'tokenizer_config.json', 'vocab.txt', 'config.json', 'special_tokens_map.json']) {
                const src = path.join(LOCAL_DIR, f);
                if (fs.existsSync(src)) fs.copyFileSync(src, path.join(targetDir, f));
            }
        }
    } catch (e) {
        console.warn(`[SEMAPROOF SETUP] ⚠️ Download failed: ${e.message}`);
        console.warn(`[SEMAPROOF SETUP]    SemaProof will run in fallback mode (SLM Quorum).`);
    }
}

main();
