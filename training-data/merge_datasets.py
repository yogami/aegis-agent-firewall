#!/usr/bin/env python3
"""
SemaProof Dataset Merger

Merges all training data sources into a single unified dataset:
  1. semaproof_train_50k.jsonl      — Original + augmented (50k)
  2. semaproof_public_datasets.jsonl — HackAPrompt + TensorTrust + Stratus
  3. semaproof_synthetic.jsonl       — LLM-generated or offline synthetic

Deduplicates and balances the final dataset.
Output: semaproof_unified.jsonl
"""

import json
import os
import hashlib
import random
from collections import Counter

random.seed(42)

DATA_DIR = os.path.dirname(__file__)

SOURCES = [
    'semaproof_train_50k.jsonl',
    'semaproof_public_datasets.jsonl',
    'semaproof_synthetic.jsonl',
]


def dedup_key(record):
    p = record['payload']
    content = f"{p['method']}|{p['endpoint']}|{json.dumps(p.get('body', {}), sort_keys=True)}"
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def main():
    print('═══════════════════════════════════════════════════════════')
    print('  SemaProof Dataset Merger')
    print('═══════════════════════════════════════════════════════════')

    all_records = []
    seen = set()
    source_counts = {}

    for src in SOURCES:
        path = os.path.join(DATA_DIR, src)
        if not os.path.exists(path):
            print(f'  ⚠️  Skipping {src} (not found)')
            continue

        count = 0
        dupes = 0
        with open(path) as f:
            for line in f:
                if not line.strip():
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue

                key = dedup_key(record)
                if key not in seen:
                    seen.add(key)
                    all_records.append(record)
                    count += 1
                else:
                    dupes += 1

        source_counts[src] = count
        print(f'  {src:45s} {count:7d} unique ({dupes:5d} dupes)')

    # Shuffle
    random.shuffle(all_records)

    # Write unified dataset
    output_path = os.path.join(DATA_DIR, 'semaproof_unified.jsonl')
    with open(output_path, 'w') as f:
        for r in all_records:
            f.write(json.dumps(r) + '\n')

    # Stats
    dist = Counter(r['label'] for r in all_records)
    print(f'\n  TOTAL: {len(all_records):,} unique examples')
    print('  Distribution:')
    for label, count in dist.most_common():
        pct = count / len(all_records) * 100
        bar = '█' * int(pct / 2)
        print(f'    {label:30s} {count:7d}  ({pct:5.1f}%) {bar}')

    source_dist = Counter(r.get('source', 'unknown')[:25] for r in all_records)
    print('\n  Source breakdown (top 15):')
    for source, count in source_dist.most_common(15):
        print(f'    {source:30s} {count:7d}')

    size_mb = os.path.getsize(output_path) / 1024 / 1024
    print(f'\n  Output: {output_path}')
    print(f'  Size: {size_mb:.1f} MB')
    print('═══════════════════════════════════════════════════════════')


if __name__ == '__main__':
    main()
