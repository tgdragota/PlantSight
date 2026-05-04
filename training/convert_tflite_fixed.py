"""
PlantSight — Fixed TFLite Conversion (PyTorch → TFLite direct)
===============================================================
Uses ai-edge-torch: Google's official PyTorch→TFLite converter.
No ONNX, no TensorFlow, no SELECT_TF_OPS issues.

Install:
    pip3 install ai-edge-torch

Run:
    python3 convert_tflite_fixed.py

Output:
    converted_fixed/model_int8.tflite   ← copy to plantsight-app/assets/
"""

import os, torch, torch.nn as nn
from torchvision import models

MODEL_PATH = "./checkpoints/best_model.pth"
OUTPUT_DIR = "./converted_fixed"
IMG_SIZE   = 224

os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── 1. Load PyTorch model ────────────────────────────────────────────────────
print("[1/3] Loading PyTorch EfficientNet-B0...")
checkpoint  = torch.load(MODEL_PATH, map_location="cpu", weights_only=False)
num_classes = checkpoint["num_classes"]

model = models.efficientnet_b0(weights=None)
model.classifier = nn.Sequential(
    nn.Dropout(p=0.3, inplace=True),
    nn.Linear(model.classifier[1].in_features, num_classes),
)
model.load_state_dict(checkpoint["model_state_dict"])
model.eval()
print(f"    {num_classes} classes  |  val acc: {checkpoint.get('val_top1_acc', 'N/A'):.2f}%  ✓")

# ── 2. Convert PyTorch → TFLite with ai-edge-torch ──────────────────────────
print("[2/3] Converting PyTorch → TFLite (ai-edge-torch)...")
try:
    import ai_edge_torch
except ImportError:
    print("\nERROR: ai-edge-torch not installed. Run:")
    print("  pip3 install ai-edge-torch")
    exit(1)

sample_input = (torch.randn(1, 3, IMG_SIZE, IMG_SIZE),)

edge_model = ai_edge_torch.convert(model, sample_input)

out_path = f"{OUTPUT_DIR}/model_int8.tflite"
edge_model.export(out_path)
print(f"    Saved → {out_path}  ✓")

# ── 3. Verify ────────────────────────────────────────────────────────────────
print("[3/3] Verifying...")
with open(out_path, "rb") as f:
    raw = f.read()

flex   = raw.count(b"Flex")
matmul = raw.count(b"MatMul")
size   = len(raw) / 1e6

print(f"\n{'='*50}")
print(f"  File   : {out_path}")
print(f"  Size   : {size:.1f} MB")
print(f"  Flex ops : {flex}   (must be 0)")
print(f"  MatMul   : {matmul}   (must be 0)")

if flex == 0 and matmul == 0:
    print("\n✅ Model is fully compatible with standard TFLite!")
    print("\nCopy to app:")
    print(f"  cp {out_path} ../plantsight-app/assets/model_int8.tflite")
else:
    print("\n⚠️  Some incompatible ops remain — check ai-edge-torch version")
