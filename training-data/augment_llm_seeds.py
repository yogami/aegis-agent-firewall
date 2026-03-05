#!/usr/bin/env python3
"""
SemaProof LLM-Generated Seed Augmentor

Takes high-quality LLM-generated seed examples and produces 50k+ variations
through randomization. Designed for multi-model consolidation:
  - Opus 4.6 seeds → augmented here
  - Gemini 3.1 Pro seeds → augmented separately
  - Merged + deduped by merge_datasets.py

Usage:
  python3 augment_llm_seeds.py [--input FILE] [--output FILE] [--count N]
"""

import json
import os
import random
import hashlib
import argparse
from collections import Counter
from copy import deepcopy

random.seed(42)

AWS_SERVICES = [
    'ec2', 's3', 'rds', 'lambda', 'iam', 'kms', 'ecs', 'eks',
    'dynamodb', 'sqs', 'sns', 'cloudformation', 'cloudwatch',
    'elasticache', 'redshift', 'secretsmanager', 'ssm', 'efs',
    'glue', 'sagemaker', 'codecommit', 'codebuild', 'apigateway',
    'route53', 'cloudfront', 'guardduty', 'waf', 'shield',
    'kinesis', 'firehose', 'iot', 'batch', 'organizations',
    'bedrock', 'athena', 'emr', 'msk', 'neptune', 'docdb',
    'timestream', 'qldb', 'apprunner', 'amplify', 'lightsail'
]

REGIONS = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-central-2',
    'eu-north-1', 'eu-south-1', 'eu-south-2',
    'ap-southeast-1', 'ap-southeast-2', 'ap-southeast-3',
    'ap-northeast-1', 'ap-northeast-2', 'ap-northeast-3',
    'ap-south-1', 'ap-south-2', 'ap-east-1',
    'cn-north-1', 'cn-northwest-1',
    'me-south-1', 'me-central-1',
    'af-south-1', 'sa-east-1', 'ca-central-1',
    'us-gov-west-1', 'us-gov-east-1',
    'il-central-1'
]

GDPR_DATA_TYPES = [
    'PII', 'GDPR_PII', 'personal_health_records', 'financial_data',
    'customer_profiles', 'biometric_data', 'genetic_data', 'location_data',
    'employee_records', 'payment_records', 'behavioral_data',
    'political_opinions', 'religious_beliefs', 'trade_union_membership'
]

BUCKET_NAMES = [
    'customer-data', 'production-backups', 'logs-archive', 'ml-models',
    'financial-reports', 'compliance-docs', 'user-uploads', 'config-store',
    'data-lake', 'etl-staging', 'analytics-exports', 'audit-logs',
    'medical-imaging', 'pii-vault', 'gdpr-exports', 'training-data',
    'static-assets', 'ci-cd-artifacts', 'terraform-state', 'disaster-recovery'
]

ROLE_NAMES = [
    'admin-role', 'lambda-exec', 'ecs-task-role', 'eks-node-role',
    'data-pipeline', 'ci-cd-deploy', 'readonly-analyst', 'backup-admin',
    'security-audit', 'devops-power', 'sagemaker-exec', 'glue-crawler',
    'step-functions', 'codebuild-service', 'cloudformation-admin'
]

SAFE_ENDPOINTS = [
    '/api/v1/users', '/api/v1/health', '/api/v1/metrics',
    '/api/v1/dashboard/stats', '/api/v1/search', '/api/v1/orders',
    '/api/v1/products', '/api/v1/invoices', '/api/v1/notifications',
    '/api/v1/settings', '/api/v1/profile', '/api/v1/auth/login',
    '/api/v1/support/tickets', '/api/v2/weather', '/api/v1/files',
    '/api/v1/subscriptions', '/api/v1/payment/process',
    '/api/v1/analytics', '/api/v1/reports', '/api/v1/feedback',
    '/api/v1/comments', '/api/v1/tags', '/api/v1/categories',
    '/api/v1/webhooks', '/api/v1/integrations', '/api/v1/exports/csv',
    '/api/v1/audit/log', '/api/v1/sessions', '/api/v1/preferences',
]

def random_id():
    return f'i-{random.randint(10**11, 10**12):012x}'

def random_arn():
    return f'arn:aws:iam::{random.randint(100000000000, 999999999999):012d}'

def random_account():
    return f'{random.randint(100000000000, 999999999999):012d}'

def dedup_key(record):
    p = record['payload']
    content = f"{p['method']}|{p['endpoint']}|{json.dumps(p.get('body', {}), sort_keys=True)}"
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def mutate_endpoint(ep):
    """Randomly mutate parts of an endpoint."""
    parts = ep.split('/')
    new_parts = []
    for part in parts:
        # Swap service names
        if part in AWS_SERVICES:
            new_parts.append(random.choice(AWS_SERVICES) if random.random() > 0.6 else part)
        # Swap IDs
        elif len(part) > 12 and any(c.isdigit() for c in part):
            new_parts.append(random_id())
        # Swap bucket names
        elif part in BUCKET_NAMES or '-' in part and len(part) > 5:
            new_parts.append(random.choice(BUCKET_NAMES) if random.random() > 0.5 else part)
        else:
            new_parts.append(part)
    return '/'.join(new_parts)


def mutate_body(body, label):
    """Randomly mutate body fields while preserving label semantics."""
    b = deepcopy(body)
    if not isinstance(b, dict):
        return b
    
    # Add/change region
    if 'region' in b or random.random() > 0.6:
        b['region'] = random.choice(REGIONS)
    
    # Add noise fields
    if random.random() > 0.7:
        b['request_id'] = f'req-{random.randint(10000, 99999):05x}'
    if random.random() > 0.8:
        b['trace_id'] = f'trace-{random.randint(1000, 9999)}'
    
    # Label-specific mutations
    if label == 'DATA_RESIDENCY_VIOLATION':
        if 'destination_region' in b:
            b['destination_region'] = random.choice(REGIONS)
        if 'source_region' in b:
            b['source_region'] = random.choice(['eu-central-1', 'eu-west-1', 'eu-north-1'])
        if 'data_classification' in b:
            b['data_classification'] = random.choice(GDPR_DATA_TYPES)
    
    elif label == 'KMS_TAMPERING':
        if 'key_id' in b:
            b['key_id'] = f'mrk-{random.choice(["prod", "backup", "signing", "encrypt", "master"])}-{random.randint(100, 999)}'
        if 'pending_window_days' in b:
            b['pending_window_days'] = random.choice([7, 14, 30])
    
    elif label == 'RANSOMWARE_SIGNATURE':
        if 'backup_retention_period' in b:
            b['backup_retention_period'] = 0
        if 'skip_final_snapshot' in b:
            b['skip_final_snapshot'] = True
    
    # Swap account IDs
    for key in list(b.keys()):
        if isinstance(b[key], str) and ':root' in str(b[key]):
            b[key] = f'{random_arn()}:root'
        elif isinstance(b[key], str) and len(b[key]) == 12 and b[key].isdigit():
            b[key] = random_account()
    
    return b


def augment_seed(seed, num_variants=100):
    """Generate num_variants from a single seed example."""
    variants = []
    for _ in range(num_variants):
        v = deepcopy(seed)
        v['payload']['endpoint'] = mutate_endpoint(v['payload']['endpoint'])
        v['payload']['body'] = mutate_body(v['payload']['body'], v['label'])
        v['confidence'] = round(random.uniform(0.75, 0.98), 2)
        v['source'] = f'llm_augmented_{v.get("source", "direct")}'
        variants.append(v)
    return variants


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default=os.path.join(os.path.dirname(__file__), 'semaproof_llm_generated.jsonl'))
    parser.add_argument('--output', default=os.path.join(os.path.dirname(__file__), 'semaproof_llm_augmented.jsonl'))
    parser.add_argument('--count', type=int, default=50000)
    parser.add_argument('--variants-per-seed', type=int, default=0,
                        help='Variants per seed (0 = auto-calculate from --count)')
    args = parser.parse_args()

    print('═══════════════════════════════════════════════════════════')
    print('  SemaProof LLM Seed Augmentor')
    print('═══════════════════════════════════════════════════════════')

    # Load seeds
    with open(args.input) as f:
        seeds = [json.loads(line) for line in f if line.strip()]
    print(f'\n  Seeds: {len(seeds)} from {os.path.basename(args.input)}')

    seed_dist = Counter(s['label'] for s in seeds)
    for label, count in seed_dist.most_common():
        print(f'    {label:30s} {count:3d} seeds')

    # Calculate variants per seed
    variants_per = args.variants_per_seed or max(10, args.count // len(seeds))
    print(f'\n  Variants per seed: {variants_per}')
    print(f'  Target: {args.count:,}')

    # Generate
    all_examples = []
    seen = set()

    # Keep originals
    for s in seeds:
        k = dedup_key(s)
        if k not in seen:
            seen.add(k)
            all_examples.append(s)

    # Augment
    for i, seed in enumerate(seeds):
        variants = augment_seed(seed, variants_per)
        for v in variants:
            if len(all_examples) >= args.count:
                break
            k = dedup_key(v)
            if k not in seen:
                seen.add(k)
                all_examples.append(v)

    # Shuffle and write
    random.shuffle(all_examples)

    with open(args.output, 'w') as f:
        for ex in all_examples:
            f.write(json.dumps(ex) + '\n')

    # Stats
    dist = Counter(ex['label'] for ex in all_examples)
    print(f'\n  TOTAL: {len(all_examples):,} examples')
    for label, count in dist.most_common():
        pct = count / len(all_examples) * 100
        print(f'    {label:30s} {count:5d}  ({pct:.1f}%)')

    size_mb = os.path.getsize(args.output) / 1024 / 1024
    print(f'\n  Output: {args.output} ({size_mb:.1f} MB)')
    print('═══════════════════════════════════════════════════════════')


if __name__ == '__main__':
    main()
