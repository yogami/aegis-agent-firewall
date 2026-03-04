# SemaProof ONNX Model Directory

This directory holds the fine-tuned SemaProof ONNX model files.

## Required Files
After running the training script (`training-data/train_distilbert.py`):

1. `model.onnx` — The ONNX model (~255MB)
2. `tokenizer.json` — HuggingFace tokenizer
3. `tokenizer_config.json` — Tokenizer config
4. `special_tokens_map.json` — Special tokens
5. `label_map.json` — Category label mapping (13 threat categories)

## How to Generate
1. Run `python3 training-data/train_distilbert.py`
2. Model files will be exported to this directory

## Fallback Behavior
If these files are not present, SemaProof falls back to V3 mode (SLM Quorum via OpenRouter).
The system will log: `[SEMAPROOF] ⚠️ Model not found.`
