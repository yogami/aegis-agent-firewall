# AegisGuard ONNX Model Directory

This directory holds the fine-tuned AegisGuard ONNX model files.

## Required Files
After running the Colab notebook (`training-data/AegisGuard_FineTune.ipynb`):

1. `model_quantized.onnx` — The INT4 quantized ONNX model (~900MB)
2. `tokenizer.json` — HuggingFace tokenizer
3. `tokenizer_config.json` — Tokenizer config
4. `special_tokens_map.json` — Special tokens
5. `label_map.json` — Category label mapping (13 threat categories)

## How to Generate
1. Open `training-data/AegisGuard_FineTune.ipynb` in Google Colab
2. Select T4 GPU runtime
3. Click "Run All"
4. Download `aegisguard-release.zip` when prompted
5. Unzip contents into this directory

## Fallback Behavior
If these files are not present, Aegis falls back to V3 mode (SLM Quorum via OpenRouter).
The system will log: `[AEGISGUARD] ⚠️ Model not found. Run the Colab notebook to generate it.`
