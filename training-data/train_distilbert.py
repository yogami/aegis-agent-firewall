#!/usr/bin/env python3
"""
AegisGuard DistilBERT Training Script
Fine-tunes DistilBERT for 13-class cloud API threat classification.
Runs on Mac CPU in ~5 minutes. Exports to ONNX.
"""

import json
import os
import sys
import time
import numpy as np
from collections import Counter

# ── Load Training Data ──────────────────────────────────────────────────
print("═══════════════════════════════════════════════════════════")
print("  🛡️  AEGISGUARD — DistilBERT Classifier Training")
print("═══════════════════════════════════════════════════════════")

DATA_PATH = os.path.join(os.path.dirname(__file__), 'aegisguard_train.jsonl')
MODEL_OUTPUT = os.path.join(os.path.dirname(__file__), '..', 'backend', 'src', 'aegisguard-model')

with open(DATA_PATH) as f:
    data = [json.loads(line) for line in f]

print(f"\n  Training examples: {len(data)}")
dist = Counter(d['label'] for d in data)
print("  Distribution:")
for label, count in dist.most_common():
    print(f"    {label:30s} {count:5d}")

# ── Prepare Labels ──────────────────────────────────────────────────────
LABELS = sorted(set(d['label'] for d in data))
label2id = {l: i for i, l in enumerate(LABELS)}
id2label = {i: l for i, l in enumerate(LABELS)}
NUM_LABELS = len(LABELS)

print(f"\n  Categories: {NUM_LABELS}")
print(f"  Labels: {LABELS}")

# ── Format as Text ──────────────────────────────────────────────────────
def payload_to_text(payload):
    """Convert structured payload to text for DistilBERT"""
    method = payload.get('method', 'GET')
    endpoint = payload.get('endpoint', '/')
    body = json.dumps(payload.get('body', {}), sort_keys=True)
    return f"{method} {endpoint} {body}"

texts = [payload_to_text(d['payload']) for d in data]
labels = [label2id[d['label']] for d in data]

# ── Load Model & Tokenizer ─────────────────────────────────────────────
print("\n── Loading DistilBERT ──")
from transformers import (
    DistilBertTokenizerFast, 
    DistilBertForSequenceClassification,
    TrainingArguments, 
    Trainer
)
from datasets import Dataset
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score

tokenizer = DistilBertTokenizerFast.from_pretrained('distilbert-base-uncased')
model = DistilBertForSequenceClassification.from_pretrained(
    'distilbert-base-uncased',
    num_labels=NUM_LABELS,
    id2label=id2label,
    label2id=label2id
)

print(f"  Parameters: {sum(p.numel() for p in model.parameters()):,}")

# ── Split Data ──────────────────────────────────────────────────────────
train_texts, val_texts, train_labels, val_labels = train_test_split(
    texts, labels, test_size=0.15, random_state=42, stratify=labels
)

print(f"\n  Train: {len(train_texts)}, Validation: {len(val_texts)}")

# ── Tokenize ────────────────────────────────────────────────────────────
train_encodings = tokenizer(train_texts, truncation=True, padding=True, max_length=256)
val_encodings = tokenizer(val_texts, truncation=True, padding=True, max_length=256)

train_dataset = Dataset.from_dict({
    'input_ids': train_encodings['input_ids'],
    'attention_mask': train_encodings['attention_mask'],
    'labels': train_labels
})

val_dataset = Dataset.from_dict({
    'input_ids': val_encodings['input_ids'],
    'attention_mask': val_encodings['attention_mask'],
    'labels': val_labels
})

# ── Train ───────────────────────────────────────────────────────────────
print("\n── Training ──")
start_time = time.time()

training_args = TrainingArguments(
    output_dir='./aegisguard-checkpoints',
    num_train_epochs=5,
    per_device_train_batch_size=16,
    per_device_eval_batch_size=32,
    learning_rate=2e-5,
    weight_decay=0.01,
    warmup_ratio=0.1,
    eval_strategy='epoch',
    save_strategy='epoch',
    load_best_model_at_end=True,
    metric_for_best_model='accuracy',
    logging_steps=25,
    report_to='none',
    fp16=False,  # CPU training
    no_cuda=True,
)

def compute_metrics(eval_pred):
    logits, labels = eval_pred
    predictions = np.argmax(logits, axis=-1)
    return {'accuracy': accuracy_score(labels, predictions)}

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=val_dataset,
    compute_metrics=compute_metrics,
)

trainer.train()
train_time = time.time() - start_time
print(f"\n  Training complete in {train_time:.1f}s ({train_time/60:.1f} min)")

# ── Evaluate ────────────────────────────────────────────────────────────
print("\n── Evaluation ──")
predictions = trainer.predict(val_dataset)
preds = np.argmax(predictions.predictions, axis=-1)
report = classification_report(val_labels, preds, target_names=LABELS)
print(report)

accuracy = accuracy_score(val_labels, preds)
print(f"  Overall Accuracy: {accuracy:.1%}")

# ── Export to ONNX ──────────────────────────────────────────────────────
print("\n── Exporting to ONNX ──")
os.makedirs(MODEL_OUTPUT, exist_ok=True)

# Save tokenizer and model in HF format first
model.save_pretrained(MODEL_OUTPUT)
tokenizer.save_pretrained(MODEL_OUTPUT)

# Export to ONNX
import torch

dummy_input = tokenizer("GET /api/v1/users {}", return_tensors="pt", padding="max_length", max_length=256, truncation=True)

torch.onnx.export(
    model,
    (dummy_input['input_ids'], dummy_input['attention_mask']),
    os.path.join(MODEL_OUTPUT, 'model.onnx'),
    input_names=['input_ids', 'attention_mask'],
    output_names=['logits'],
    dynamic_axes={
        'input_ids': {0: 'batch_size', 1: 'sequence'},
        'attention_mask': {0: 'batch_size', 1: 'sequence'},
        'logits': {0: 'batch_size'}
    },
    opset_version=14
)

# Save label map
label_map = {'label2id': label2id, 'id2label': id2label, 'labels': LABELS}
with open(os.path.join(MODEL_OUTPUT, 'label_map.json'), 'w') as f:
    json.dump(label_map, f, indent=2)

# ── Verify ONNX ─────────────────────────────────────────────────────────
print("\n── Verifying ONNX Model ──")
import onnxruntime as ort

session = ort.InferenceSession(os.path.join(MODEL_OUTPUT, 'model.onnx'))

test_cases = [
    {"method": "PUT", "endpoint": "/kms/keys/rotate", "body": {"snapshot_retention_days": 0}},
    {"method": "GET", "endpoint": "/api/v1/users", "body": {}},
    {"method": "DELETE", "endpoint": "/rds/clusters/production", "body": {"skip_final_snapshot": True}},
    {"method": "POST", "endpoint": "/iam/roles/root", "body": {"policy": "AdministratorAccess"}},
    {"method": "GET", "endpoint": "/health", "body": {}},
    {"method": "POST", "endpoint": "/s3/buckets/customer-data/copy", "body": {"destination": "external-bucket"}},
]

print("\n  ═══ Inference Test ═══")
for tc in test_cases:
    text = payload_to_text(tc)
    inputs = tokenizer(text, return_tensors="np", padding="max_length", max_length=256, truncation=True)
    
    t0 = time.time()
    outputs = session.run(None, {
        'input_ids': inputs['input_ids'].astype(np.int64),
        'attention_mask': inputs['attention_mask'].astype(np.int64)
    })
    latency = (time.time() - t0) * 1000
    
    logits = outputs[0][0]
    probs = np.exp(logits - np.max(logits))
    probs = probs / probs.sum()
    
    top_idx = np.argmax(probs)
    top_label = id2label[top_idx]
    confidence = probs[top_idx]
    
    emoji = "✅" if top_label == "SAFE" else "❌"
    print(f"  {emoji} {tc['method']:6s} {tc['endpoint']:45s} → {top_label:28s} ({confidence:.1%}) [{latency:.1f}ms]")

# ── Report ──────────────────────────────────────────────────────────────
model_size = os.path.getsize(os.path.join(MODEL_OUTPUT, 'model.onnx'))
print(f"\n═══════════════════════════════════════════════════════════")
print(f"  TRAINING COMPLETE")
print(f"  Model: {MODEL_OUTPUT}/model.onnx ({model_size / 1024 / 1024:.1f} MB)")
print(f"  Accuracy: {accuracy:.1%}")
print(f"  Training time: {train_time:.1f}s")
print(f"  Categories: {NUM_LABELS}")
print(f"═══════════════════════════════════════════════════════════")
