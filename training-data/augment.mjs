#!/usr/bin/env node
/**
 * AegisGuard Training Data Augmentation Pipeline
 * Takes 128 seed templates → generates ~50K labeled JSONL examples
 * Uses Gemini 2.5 Flash (free via Antigravity) for augmentation
 */

import fs from 'fs';
import path from 'path';
import { SEEDS, THREAT_TAXONOMY } from './seeds.mjs';

// Use Gemini Flash (free via Antigravity plan) for augmentation
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Fallback: OpenRouter for non-Gemini models
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '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';

const OUTPUT_DIR = path.dirname(new URL(import.meta.url).pathname);
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'aegisguard_train.jsonl');
const VARIANTS_PER_SEED = 50;  // 128 seeds × 50 = 6,400 via LLM + originals

const AUGMENTATION_PROMPT = (seed, taxonomy) => `You are a cybersecurity dataset generator. Generate ${VARIANTS_PER_SEED} realistic variants of this cloud API attack payload.

ORIGINAL PAYLOAD:
${JSON.stringify(seed.payload, null, 2)}

THREAT CATEGORY: ${seed.label}
MITRE ATT&CK: ${taxonomy.mitre || 'N/A'}
DESCRIPTION: ${taxonomy.description}

RULES:
1. Each variant must be a valid JSON object with keys: method, endpoint, body
2. Vary the endpoints, HTTP methods, body fields, and parameter values
3. Include subtle variations: different AWS services, different resource names, different parameter combinations
4. Some variants should be adversarial (trying to disguise the attack)
5. Keep the same threat category — all variants ARE ${seed.label}
6. For SAFE payloads, generate normal business API operations
7. Use realistic AWS/cloud endpoint patterns

OUTPUT FORMAT: Return ONLY a JSON array of ${VARIANTS_PER_SEED} payload objects. No markdown, no explanation.
Example: [{"method":"PUT","endpoint":"/kms/keys/rotate","body":{"retention":0}}, ...]`;

async function augmentWithOpenRouter(prompt) {
    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://semaproof.io',
                'X-Title': 'AegisGuard Training Data'
            },
            body: JSON.stringify({
                model: 'qwen/qwen-2.5-7b-instruct',  // Cheapest good model
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.8,  // Higher temp = more diverse variants
                max_tokens: 8000,
            })
        });

        if (!response.ok) {
            const err = await response.text();
            console.error(`  OpenRouter error: ${err.substring(0, 200)}`);
            return null;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        // Extract JSON array from response
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return null;

        return JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.error(`  Parse error: ${e.message}`);
        return null;
    }
}

async function generateRuleBasedVariants(seed) {
    // Fast, free, deterministic augmentation for basic variants
    const variants = [];
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    const regions = ['eu-west-1', 'us-east-1', 'ap-southeast-1', 'cn-north-1', 'eu-central-1'];
    const resourceIds = ['prod', 'staging', 'backup', 'master', 'primary', 'default', 'main'];

    for (let i = 0; i < 10; i++) {
        const variant = JSON.parse(JSON.stringify(seed.payload));

        // Mutate endpoint with different resource IDs
        const rid = resourceIds[Math.floor(Math.random() * resourceIds.length)];
        variant.endpoint = variant.endpoint.replace(/prod|master|primary/g, rid);

        // Add random fields to body
        if (Math.random() > 0.5 && variant.body) {
            variant.body.request_id = `req-${Math.random().toString(36).substring(7)}`;
        }
        if (Math.random() > 0.7 && variant.body) {
            variant.body.region = regions[Math.floor(Math.random() * regions.length)];
        }

        variants.push(variant);
    }

    return variants;
}

async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  🧬 AEGISGUARD TRAINING DATA AUGMENTATION PIPELINE');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Seeds: ${SEEDS.length}`);
    console.log(`  Target: ~${SEEDS.length * (VARIANTS_PER_SEED + 10 + 1)} examples`);
    console.log(`  Output: ${OUTPUT_FILE}\n`);

    const allExamples = [];

    // Phase 1: Add original seeds
    console.log('── Phase 1: Original Seeds ──');
    for (const seed of SEEDS) {
        const taxonomy = THREAT_TAXONOMY[seed.label];
        allExamples.push({
            payload: seed.payload,
            label: seed.label,
            confidence: 1.0,
            mitre: taxonomy?.mitre || null,
            eu_ai_act: taxonomy?.eu_ai_act || null,
            source: 'seed'
        });
    }
    console.log(`  Added ${SEEDS.length} seed examples\n`);

    // Phase 2: Rule-based variants (free, instant)
    console.log('── Phase 2: Rule-Based Variants ──');
    for (const seed of SEEDS) {
        const taxonomy = THREAT_TAXONOMY[seed.label];
        const variants = await generateRuleBasedVariants(seed);
        for (const v of variants) {
            allExamples.push({
                payload: v,
                label: seed.label,
                confidence: 0.95,
                mitre: taxonomy?.mitre || null,
                eu_ai_act: taxonomy?.eu_ai_act || null,
                source: 'rule_based'
            });
        }
    }
    console.log(`  Generated ${allExamples.length - SEEDS.length} rule-based variants`);
    console.log(`  Total so far: ${allExamples.length}\n`);

    // Phase 3: LLM-augmented variants (API calls)
    console.log('── Phase 3: LLM Augmentation ──');
    let llmVariants = 0;
    let errors = 0;

    // Process seeds in batches — one per category to avoid redundancy
    const categories = [...new Set(SEEDS.map(s => s.label))];

    for (const category of categories) {
        const categorySeeds = SEEDS.filter(s => s.label === category);
        // Take first 3 seeds per category as exemplars
        const exemplars = categorySeeds.slice(0, 3);
        const taxonomy = THREAT_TAXONOMY[category];

        process.stdout.write(`  [${category}] Augmenting...`);

        for (const seed of exemplars) {
            const prompt = AUGMENTATION_PROMPT(seed, taxonomy);
            const variants = await augmentWithOpenRouter(prompt);

            if (variants && Array.isArray(variants)) {
                for (const v of variants) {
                    if (v.method && v.endpoint) {
                        allExamples.push({
                            payload: v,
                            label: category,
                            confidence: 0.9,
                            mitre: taxonomy?.mitre || null,
                            eu_ai_act: taxonomy?.eu_ai_act || null,
                            source: 'llm_augmented'
                        });
                        llmVariants++;
                    }
                }
            } else {
                errors++;
            }

            // Rate limit
            await new Promise(r => setTimeout(r, 500));
        }

        console.log(` ${llmVariants} variants (${errors} errors)`);
    }

    console.log(`\n  LLM variants: ${llmVariants}`);
    console.log(`  Total examples: ${allExamples.length}\n`);

    // Phase 4: Write JSONL
    console.log('── Phase 4: Export JSONL ──');

    // Shuffle for training
    for (let i = allExamples.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allExamples[i], allExamples[j]] = [allExamples[j], allExamples[i]];
    }

    const jsonl = allExamples.map(ex => JSON.stringify(ex)).join('\n');
    fs.writeFileSync(OUTPUT_FILE, jsonl);

    // Distribution report
    const dist = {};
    allExamples.forEach(ex => { dist[ex.label] = (dist[ex.label] || 0) + 1; });

    console.log(`  Written: ${OUTPUT_FILE}`);
    console.log(`  Size: ${(Buffer.byteLength(jsonl) / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Examples: ${allExamples.length}\n`);

    console.log('── Distribution ──');
    Object.entries(dist)
        .sort((a, b) => b[1] - a[1])
        .forEach(([label, count]) => {
            const bar = '█'.repeat(Math.round(count / 20));
            console.log(`  ${label.padEnd(28)} ${String(count).padStart(5)} ${bar}`);
        });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  PIPELINE COMPLETE');
    console.log('═══════════════════════════════════════════════════════════');
}

main().catch(console.error);
