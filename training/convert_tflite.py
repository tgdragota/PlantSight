"""
PlantSight — TFLite INT8 Conversion Script
==========================================
Converts the trained PyTorch EfficientNet-B0 model to TFLite INT8
for on-device Edge AI inference.

Pipeline:
  PyTorch (.pth)
    → ONNX (.onnx)
      → TensorFlow SavedModel
        → TFLite FP32 (.tflite)
          → TFLite INT8 quantized (.tflite)

Outputs:
  converted/model_fp32.tflite    ← full precision (baseline)
  converted/model_int8.tflite    ← quantized (Edge deployment)
  converted/model_info.json      ← metadata for mobile app
  converted/onnx_model.onnx      ← intermediate (can delete after)

Requirements:
  pip install torch torchvision onnx onnxruntime
  pip install tensorflow onnx-tf

Usage:
  python convert_tflite.py --model_path ./checkpoints/best_model.pth
  python convert_tflite.py --model_path ./checkpoints/best_model.pth --data_dir ./data/plantvillage/color
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import torch
import torch.nn as nn
import numpy as np
from torchvision import models, transforms
from torch.utils.data import DataLoader
from torchvision import datasets

IMG_SIZE = 224


def parse_args():
    p = argparse.ArgumentParser(description="PlantSight — PyTorch → TFLite INT8 converter")
    p.add_argument("--model_path",  type=str, required=True,
                   help="Path to best_model.pth from training")
    p.add_argument("--data_dir",    type=str, default=None,
                   help="PlantVillage 'color' dir for INT8 calibration dataset (recommended)")
    p.add_argument("--output_dir",  type=str, default="./converted",
                   help="Where to save converted models")
    p.add_argument("--n_calib",     type=int, default=200,
                   help="Number of calibration images for INT8 quantization")
    p.add_argument("--opset",       type=int, default=12,
                   help="ONNX opset version")
    return p.parse_args()


def check_dependencies():
    """Check all required packages are installed."""
    missing = []
    for pkg in ["onnx", "onnxruntime", "tensorflow"]:
        try:
            __import__(pkg.replace("-", "_"))
        except ImportError:
            missing.append(pkg)
    try:
        import onnx_tf  # noqa
    except ImportError:
        missing.append("onnx-tf")

    if missing:
        print("❌ Missing dependencies:")
        for pkg in missing:
            print(f"   pip install {pkg}")
        print("\nInstall with:")
        print(f"  pip install {' '.join(missing)}")
        sys.exit(1)
    print("✅ All dependencies found")


def load_pytorch_model(model_path: str, device: torch.device):
    """Load the trained PyTorch model from checkpoint."""
    checkpoint = torch.load(model_path, map_location=device)
    class_names = checkpoint["class_names"]
    num_classes = checkpoint["num_classes"]

    # Rebuild model architecture
    model = models.efficientnet_b0(weights=None)
    in_features = model.classifier[1].in_features
    model.classifier = nn.Sequential(
        nn.Dropout(p=0.3, inplace=True),
        nn.Linear(in_features, num_classes),
    )
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    model.to(device)

    print(f"✅ Loaded PyTorch model: {num_classes} classes")
    print(f"   Best val accuracy: {checkpoint.get('val_top1_acc', 'N/A'):.2f}%")
    return model, class_names, num_classes


def export_onnx(model, output_dir: Path, opset: int):
    """Export PyTorch model to ONNX format."""
    import onnx
    onnx_path = output_dir / "onnx_model.onnx"

    dummy_input = torch.randn(1, 3, IMG_SIZE, IMG_SIZE)
    print(f"\n🔄 Exporting to ONNX (opset {opset})…")

    torch.onnx.export(
        model,
        dummy_input,
        str(onnx_path),
        opset_version=opset,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={
            "input":  {0: "batch_size"},
            "output": {0: "batch_size"},
        },
        do_constant_folding=True,
        verbose=False,
    )

    # Validate ONNX model
    onnx_model = onnx.load(str(onnx_path))
    onnx.checker.check_model(onnx_model)
    print(f"✅ ONNX model saved and validated → {onnx_path}")
    return onnx_path


def onnx_to_savedmodel(onnx_path: Path, output_dir: Path):
    """Convert ONNX model to TensorFlow SavedModel format."""
    from onnx_tf.backend import prepare
    import onnx

    savedmodel_path = output_dir / "tf_savedmodel"
    print(f"\n🔄 Converting ONNX → TensorFlow SavedModel…")

    onnx_model = onnx.load(str(onnx_path))
    tf_rep = prepare(onnx_model)
    tf_rep.export_graph(str(savedmodel_path))

    print(f"✅ TF SavedModel saved → {savedmodel_path}")
    return savedmodel_path


def savedmodel_to_tflite_fp32(savedmodel_path: Path, output_dir: Path):
    """Convert TF SavedModel to TFLite FP32 (baseline, no quantization)."""
    import tensorflow as tf

    tflite_path = output_dir / "model_fp32.tflite"
    print(f"\n🔄 Converting to TFLite FP32…")

    converter = tf.lite.TFLiteConverter.from_saved_model(str(savedmodel_path))
    tflite_model = converter.convert()

    with open(tflite_path, "wb") as f:
        f.write(tflite_model)

    size_mb = os.path.getsize(tflite_path) / 1e6
    print(f"✅ TFLite FP32 saved → {tflite_path}  ({size_mb:.1f} MB)")
    return tflite_path


def build_calibration_dataset(data_dir: str, n_samples: int):
    """Load n_samples images for INT8 calibration."""
    transform = transforms.Compose([
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406],
                             std=[0.229, 0.224, 0.225]),
    ])
    dataset = datasets.ImageFolder(root=data_dir, transform=transform)
    indices = torch.randperm(len(dataset))[:n_samples].tolist()
    subset  = torch.utils.data.Subset(dataset, indices)
    loader  = DataLoader(subset, batch_size=32, shuffle=False, num_workers=2)

    images_list = []
    for images, _ in loader:
        # TFLite calibration expects NHWC format
        images_nhwc = images.permute(0, 2, 3, 1).numpy()
        images_list.append(images_nhwc)

    calibration_data = np.concatenate(images_list, axis=0)
    print(f"✅ Calibration dataset ready: {calibration_data.shape}")
    return calibration_data


def savedmodel_to_tflite_int8(savedmodel_path: Path, output_dir: Path,
                               data_dir: str = None, n_calib: int = 200):
    """Convert TF SavedModel to TFLite INT8 quantized model."""
    import tensorflow as tf

    tflite_path = output_dir / "model_int8.tflite"
    print(f"\n🔄 Converting to TFLite INT8 (quantized for Edge)…")

    converter = tf.lite.TFLiteConverter.from_saved_model(str(savedmodel_path))
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
    converter.inference_input_type  = tf.uint8
    converter.inference_output_type = tf.uint8

    # Calibration dataset for accurate quantization
    if data_dir and Path(data_dir).exists():
        print(f"   Loading {n_calib} calibration images…")
        calib_data = build_calibration_dataset(data_dir, n_calib)

        def representative_dataset():
            for i in range(len(calib_data)):
                img = calib_data[i:i+1].astype(np.float32)
                yield [img]

        converter.representative_dataset = representative_dataset
        print("   INT8 calibration will use real PlantVillage images (higher quality)")
    else:
        print("   ⚠ No calibration data — using random tensors (lower quality quantization)")
        print("     Pass --data_dir for better results")

        def representative_dataset():
            for _ in range(100):
                yield [np.random.rand(1, IMG_SIZE, IMG_SIZE, 3).astype(np.float32)]

        converter.representative_dataset = representative_dataset

    tflite_model = converter.convert()

    with open(tflite_path, "wb") as f:
        f.write(tflite_model)

    size_mb = os.path.getsize(tflite_path) / 1e6
    print(f"✅ TFLite INT8 saved → {tflite_path}  ({size_mb:.1f} MB)")
    return tflite_path


def verify_tflite(tflite_path: Path):
    """Run a quick sanity-check inference on the TFLite model."""
    import tensorflow as tf

    print(f"\n🔍 Verifying TFLite model: {tflite_path.name}…")
    interpreter = tf.lite.Interpreter(model_path=str(tflite_path))
    interpreter.allocate_tensors()

    input_details  = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    print(f"   Input  shape : {input_details[0]['shape']}  dtype: {input_details[0]['dtype'].__name__}")
    print(f"   Output shape : {output_details[0]['shape']}  dtype: {output_details[0]['dtype'].__name__}")

    # Dummy inference
    input_shape = input_details[0]["shape"]
    if input_details[0]["dtype"] == np.uint8:
        dummy = np.random.randint(0, 255, input_shape, dtype=np.uint8)
    else:
        dummy = np.random.rand(*input_shape).astype(np.float32)

    interpreter.set_tensor(input_details[0]["index"], dummy)
    interpreter.invoke()
    output = interpreter.get_tensor(output_details[0]["index"])
    print(f"   ✅ Inference OK — output shape: {output.shape}")

    return input_details, output_details


def benchmark_tflite(tflite_path: Path, n_runs: int = 50):
    """Measure TFLite inference latency on CPU."""
    import tensorflow as tf
    import time

    interpreter = tf.lite.Interpreter(model_path=str(tflite_path))
    interpreter.allocate_tensors()
    input_details  = interpreter.get_input_details()
    input_shape    = input_details[0]["shape"]

    if input_details[0]["dtype"] == np.uint8:
        dummy = np.random.randint(0, 255, input_shape, dtype=np.uint8)
    else:
        dummy = np.random.rand(*input_shape).astype(np.float32)

    # Warmup
    for _ in range(5):
        interpreter.set_tensor(input_details[0]["index"], dummy)
        interpreter.invoke()

    # Benchmark
    times = []
    for _ in range(n_runs):
        t0 = time.perf_counter()
        interpreter.set_tensor(input_details[0]["index"], dummy)
        interpreter.invoke()
        times.append((time.perf_counter() - t0) * 1000)

    p50 = np.percentile(times, 50)
    p95 = np.percentile(times, 95)
    print(f"   ⏱  CPU latency (n={n_runs}): P50={p50:.1f}ms  P95={p95:.1f}ms")
    return p50, p95


def save_model_info(output_dir: Path, class_names: list, fp32_path: Path,
                    int8_path: Path, fp32_size_mb: float, int8_size_mb: float,
                    fp32_latency: float, int8_latency: float):
    """Save metadata JSON for the mobile app to use."""
    info = {
        "model_name":      "EfficientNet-B0 PlantVillage",
        "num_classes":     len(class_names),
        "img_size":        IMG_SIZE,
        "img_size_hw":     [IMG_SIZE, IMG_SIZE],
        "input_channels":  3,
        "normalisation": {
            "mean": [0.485, 0.456, 0.406],
            "std":  [0.229, 0.224, 0.225],
        },
        "class_names": class_names,
        "files": {
            "tflite_fp32": str(fp32_path.name),
            "tflite_int8": str(int8_path.name),
        },
        "sizes_mb": {
            "fp32": round(fp32_size_mb, 2),
            "int8": round(int8_size_mb, 2),
            "compression_ratio": round(fp32_size_mb / int8_size_mb, 2),
        },
        "cpu_latency_ms": {
            "fp32_p50": round(fp32_latency, 1),
            "int8_p50": round(int8_latency, 1),
            "speedup":  round(fp32_latency / int8_latency, 2),
        },
    }
    info_path = output_dir / "model_info.json"
    with open(info_path, "w") as f:
        json.dump(info, f, indent=2)
    print(f"\n📋 Model info saved → {info_path}")
    return info


def main():
    args = parse_args()
    print("=" * 60)
    print("PlantSight — TFLite Conversion Pipeline")
    print("=" * 60)

    check_dependencies()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    device = torch.device("cpu")  # ONNX export on CPU is more stable

    # Step 1 — Load PyTorch model
    print("\n[1/6] Loading PyTorch model…")
    model, class_names, num_classes = load_pytorch_model(args.model_path, device)

    # Step 2 — Export to ONNX
    print("\n[2/6] Exporting to ONNX…")
    onnx_path = export_onnx(model, output_dir, args.opset)

    # Step 3 — ONNX → TF SavedModel
    print("\n[3/6] Converting to TensorFlow SavedModel…")
    savedmodel_path = onnx_to_savedmodel(onnx_path, output_dir)

    # Step 4 — SavedModel → TFLite FP32
    print("\n[4/6] Converting to TFLite FP32…")
    fp32_path = savedmodel_to_tflite_fp32(savedmodel_path, output_dir)

    # Step 5 — SavedModel → TFLite INT8
    print("\n[5/6] Converting to TFLite INT8…")
    int8_path = savedmodel_to_tflite_int8(
        savedmodel_path, output_dir,
        data_dir=args.data_dir,
        n_calib=args.n_calib,
    )

    # Step 6 — Verify & Benchmark
    print("\n[6/6] Verifying and benchmarking…")
    print("  FP32:")
    verify_tflite(fp32_path)
    fp32_lat, _ = benchmark_tflite(fp32_path)

    print("  INT8:")
    verify_tflite(int8_path)
    int8_lat, _ = benchmark_tflite(int8_path)

    fp32_size_mb = os.path.getsize(fp32_path) / 1e6
    int8_size_mb = os.path.getsize(int8_path) / 1e6

    # Save metadata
    info = save_model_info(
        output_dir, class_names, fp32_path, int8_path,
        fp32_size_mb, int8_size_mb, fp32_lat, int8_lat,
    )

    # Summary
    print("\n" + "=" * 60)
    print("CONVERSION SUMMARY")
    print("=" * 60)
    print(f"  FP32 model size : {fp32_size_mb:.1f} MB")
    print(f"  INT8 model size : {int8_size_mb:.1f} MB  ({info['sizes_mb']['compression_ratio']}x smaller)")
    print(f"  FP32 CPU latency: {fp32_lat:.1f} ms")
    print(f"  INT8 CPU latency: {int8_lat:.1f} ms  ({info['cpu_latency_ms']['speedup']}x faster)")
    print(f"\n  → Edge AI model ready for mobile: {int8_path}")
    print(f"\nNext step — copy INT8 model to mobile assets:")
    print(f"  cp {int8_path} plantsight/mobile/assets/model_int8.tflite")
    print(f"  cp {output_dir}/model_info.json plantsight/mobile/assets/")
    print("=" * 60)


if __name__ == "__main__":
    main()
