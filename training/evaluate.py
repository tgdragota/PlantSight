"""
PlantSight — Model Evaluation Script
=====================================
Generates all thesis metrics from the trained models:

  - Per-class accuracy (38 classes)
  - Confusion matrix heatmap
  - Top-1 / Top-5 accuracy
  - Precision / Recall / F1 per class
  - Model size and parameter count
  - CPU/GPU inference latency (P50, P95, P99)
  - Comparison table: PyTorch vs TFLite FP32 vs TFLite INT8

Outputs:
  results/evaluation_report.json     ← full metrics (for your thesis tables)
  results/confusion_matrix.png        ← heatmap
  results/per_class_accuracy.png      ← bar chart
  results/thesis_table.csv            ← ready-to-paste thesis results table

Usage:
  python evaluate.py --model_path ./checkpoints/best_model.pth --data_dir ./data/plantvillage/color
  python evaluate.py --model_path ./checkpoints/best_model.pth --data_dir ./data/plantvillage/color --tflite_fp32 ./converted/model_fp32.tflite --tflite_int8 ./converted/model_int8.tflite
"""

import argparse
import json
import time
from pathlib import Path
from collections import defaultdict

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision import models, datasets, transforms
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    accuracy_score,
    top_k_accuracy_score,
)

IMG_SIZE = 224


def parse_args():
    p = argparse.ArgumentParser(description="PlantSight — Model Evaluation")
    p.add_argument("--model_path",   type=str, required=True,
                   help="Path to best_model.pth")
    p.add_argument("--data_dir",     type=str, required=True,
                   help="PlantVillage 'color' directory")
    p.add_argument("--tflite_fp32",  type=str, default=None,
                   help="Path to model_fp32.tflite (optional)")
    p.add_argument("--tflite_int8",  type=str, default=None,
                   help="Path to model_int8.tflite (optional)")
    p.add_argument("--output_dir",   type=str, default="./results",
                   help="Where to save evaluation results")
    p.add_argument("--batch_size",   type=int, default=32)
    p.add_argument("--test_split",   type=float, default=0.10,
                   help="Same fraction used during training")
    p.add_argument("--latency_runs", type=int, default=100,
                   help="Number of inferences for latency benchmark")
    p.add_argument("--workers",      type=int, default=4)
    p.add_argument("--seed",         type=int, default=42)
    return p.parse_args()


# ─────────────────────────────────────────────────────────────────────────────
#  DATA
# ─────────────────────────────────────────────────────────────────────────────

def get_test_loader(data_dir: str, test_split: float, seed: int, batch_size: int, workers: int):
    transform = transforms.Compose([
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406],
                             std=[0.229, 0.224, 0.225]),
    ])
    full_dataset = datasets.ImageFolder(root=data_dir, transform=transform)
    class_names  = full_dataset.classes
    n_total      = len(full_dataset)
    n_test       = int(n_total * test_split)
    n_rest       = n_total - n_test

    _, test_set = torch.utils.data.random_split(
        full_dataset,
        [n_rest, n_test],
        generator=torch.Generator().manual_seed(seed),
    )
    loader = DataLoader(test_set, batch_size=batch_size, shuffle=False,
                        num_workers=workers, pin_memory=True)
    print(f"✅ Test set: {n_test:,} images  |  {len(class_names)} classes")
    return loader, class_names


# ─────────────────────────────────────────────────────────────────────────────
#  PYTORCH EVALUATION
# ─────────────────────────────────────────────────────────────────────────────

def load_pytorch_model(model_path: str, device: torch.device):
    checkpoint  = torch.load(model_path, map_location=device)
    class_names = checkpoint["class_names"]
    num_classes = checkpoint["num_classes"]

    model = models.efficientnet_b0(weights=None)
    in_features = model.classifier[1].in_features
    model.classifier = nn.Sequential(
        nn.Dropout(p=0.3, inplace=True),
        nn.Linear(in_features, num_classes),
    )
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval().to(device)

    total_params  = sum(p.numel() for p in model.parameters())
    size_mb       = sum(p.numel() * p.element_size() for p in model.parameters()) / 1e6

    print(f"✅ PyTorch model loaded")
    print(f"   Params   : {total_params:,}")
    print(f"   Size     : {size_mb:.1f} MB  (in memory)")
    return model, class_names, total_params, size_mb


@torch.no_grad()
def evaluate_pytorch(model, loader, device):
    """Run full evaluation and return all_labels + all_probs."""
    all_labels = []
    all_probs  = []

    for images, labels in loader:
        images = images.to(device)
        logits = model(images)
        probs  = torch.softmax(logits, dim=1).cpu().numpy()
        all_probs.append(probs)
        all_labels.append(labels.numpy())

    all_labels = np.concatenate(all_labels)
    all_probs  = np.concatenate(all_probs)
    return all_labels, all_probs


def latency_pytorch(model, device, n_runs: int = 100):
    """Measure PyTorch inference latency on a single image."""
    dummy = torch.randn(1, 3, IMG_SIZE, IMG_SIZE).to(device)

    # Warmup
    with torch.no_grad():
        for _ in range(10):
            model(dummy)

    if device.type == "cuda":
        torch.cuda.synchronize()

    times = []
    with torch.no_grad():
        for _ in range(n_runs):
            if device.type == "cuda":
                torch.cuda.synchronize()
            t0 = time.perf_counter()
            model(dummy)
            if device.type == "cuda":
                torch.cuda.synchronize()
            times.append((time.perf_counter() - t0) * 1000)

    return np.array(times)


# ─────────────────────────────────────────────────────────────────────────────
#  TFLITE EVALUATION
# ─────────────────────────────────────────────────────────────────────────────

def evaluate_tflite(tflite_path: str, loader, n_runs_latency: int = 100):
    """Evaluate a TFLite model on the test set."""
    try:
        import tensorflow as tf
    except ImportError:
        print("⚠ TensorFlow not installed — skipping TFLite evaluation")
        return None, None, None

    interpreter = tf.lite.Interpreter(model_path=tflite_path)
    interpreter.allocate_tensors()
    input_details  = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    input_dtype = input_details[0]["dtype"]
    is_int8     = (input_dtype == np.uint8)

    all_labels = []
    all_preds  = []

    for images, labels in loader:
        images_np = images.numpy()

        for i in range(images_np.shape[0]):
            img = images_np[i]  # C, H, W

            # TFLite expects NHWC
            img_nhwc = np.transpose(img, (1, 2, 0))[np.newaxis, ...]  # 1, H, W, C

            if is_int8:
                # Dequantize normalised float back to uint8
                # (undo ImageNet norm, then scale to 0-255)
                mean = np.array([0.485, 0.456, 0.406])
                std  = np.array([0.229, 0.224, 0.225])
                img_denorm = img_nhwc * std + mean
                img_uint8  = (img_denorm * 255).clip(0, 255).astype(np.uint8)
                interpreter.set_tensor(input_details[0]["index"], img_uint8)
            else:
                interpreter.set_tensor(input_details[0]["index"], img_nhwc.astype(np.float32))

            interpreter.invoke()
            output = interpreter.get_tensor(output_details[0]["index"])

            if is_int8:
                # Dequantize INT8 output
                scale, zero_point = output_details[0]["quantization"]
                output = scale * (output.astype(np.float32) - zero_point)

            pred = np.argmax(output)
            all_preds.append(pred)
            all_labels.append(labels[i].item())

    all_labels = np.array(all_labels)
    all_preds  = np.array(all_preds)
    top1_acc   = accuracy_score(all_labels, all_preds) * 100

    # Latency benchmark
    dummy_shape = input_details[0]["shape"]
    if is_int8:
        dummy = np.random.randint(0, 255, dummy_shape, dtype=np.uint8)
    else:
        dummy = np.random.rand(*dummy_shape).astype(np.float32)

    for _ in range(5):  # warmup
        interpreter.set_tensor(input_details[0]["index"], dummy)
        interpreter.invoke()

    times = []
    for _ in range(n_runs_latency):
        t0 = time.perf_counter()
        interpreter.set_tensor(input_details[0]["index"], dummy)
        interpreter.invoke()
        times.append((time.perf_counter() - t0) * 1000)

    return all_labels, all_preds, top1_acc, np.array(times)


# ─────────────────────────────────────────────────────────────────────────────
#  PLOTS
# ─────────────────────────────────────────────────────────────────────────────

def plot_confusion_matrix(cm, class_names, output_dir: Path):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import seaborn as sns

        fig, ax = plt.subplots(figsize=(22, 18))
        fig.patch.set_facecolor("#080d08")
        ax.set_facecolor("#080d08")

        # Normalise to percentages
        cm_norm = cm.astype(float) / cm.sum(axis=1, keepdims=True) * 100

        # Shorter class names for readability
        short_names = [n.replace("___", "\n").replace("_", " ") for n in class_names]

        sns.heatmap(
            cm_norm, annot=False, fmt=".0f", cmap="Greens",
            xticklabels=short_names, yticklabels=short_names,
            ax=ax, linewidths=0.3, linecolor="#1a1a1a",
            cbar_kws={"label": "Accuracy (%)"},
        )
        ax.set_xlabel("Predicted Label", color="#aaa", fontsize=11)
        ax.set_ylabel("True Label",      color="#aaa", fontsize=11)
        ax.set_title("Confusion Matrix — PlantVillage Test Set",
                     color="#e8f5e9", fontsize=14, fontweight="bold", pad=20)
        ax.tick_params(colors="#888", labelsize=7)

        out = output_dir / "confusion_matrix.png"
        plt.tight_layout()
        plt.savefig(out, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
        plt.close()
        print(f"📊 Confusion matrix saved → {out}")
    except Exception as e:
        print(f"⚠ Could not save confusion matrix: {e}")
        print("  pip install matplotlib seaborn")


def plot_per_class_accuracy(class_names, cm, output_dir: Path):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        per_class_acc = cm.diagonal() / cm.sum(axis=1) * 100
        sorted_idx    = np.argsort(per_class_acc)
        sorted_names  = [class_names[i].replace("___", " — ").replace("_", " ") for i in sorted_idx]
        sorted_acc    = per_class_acc[sorted_idx]

        colors = ["#ff5252" if a < 70 else "#ffab40" if a < 90 else "#00e676" for a in sorted_acc]

        fig, ax = plt.subplots(figsize=(14, 16))
        fig.patch.set_facecolor("#080d08")
        ax.set_facecolor("#080d08")

        bars = ax.barh(range(len(sorted_names)), sorted_acc, color=colors, height=0.75)
        ax.set_yticks(range(len(sorted_names)))
        ax.set_yticklabels(sorted_names, fontsize=8, color="#ccc")
        ax.set_xlabel("Top-1 Accuracy (%)", color="#aaa")
        ax.set_title("Per-Class Accuracy — PlantVillage Test Set",
                     color="#e8f5e9", fontsize=13, fontweight="bold")
        ax.tick_params(colors="#888")
        ax.set_xlim(0, 105)
        ax.axvline(x=per_class_acc.mean(), color="#ffab40", linewidth=1.5,
                   linestyle="--", label=f"Mean: {per_class_acc.mean():.1f}%")
        ax.legend(facecolor="#1a1a1a", edgecolor="#333", labelcolor="#ccc")

        for bar, val in zip(bars, sorted_acc):
            ax.text(val + 0.5, bar.get_y() + bar.get_height() / 2,
                    f"{val:.1f}%", va="center", ha="left", fontsize=7, color="#aaa")

        out = output_dir / "per_class_accuracy.png"
        plt.tight_layout()
        plt.savefig(out, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
        plt.close()
        print(f"📊 Per-class accuracy chart saved → {out}")
    except Exception as e:
        print(f"⚠ Could not save per-class chart: {e}")


# ─────────────────────────────────────────────────────────────────────────────
#  THESIS TABLE
# ─────────────────────────────────────────────────────────────────────────────

def save_thesis_table(report: dict, output_dir: Path):
    """Save a CSV table ready to paste into the thesis."""
    rows = ["Model,Top-1 (%),Top-5 (%),Parameters,Size (MB),P50 Latency (ms),P95 Latency (ms),Speedup vs FP32"]

    pytorch = report.get("pytorch", {})
    fp32    = report.get("tflite_fp32", {})
    int8    = report.get("tflite_int8", {})

    fp32_p50 = fp32.get("latency_ms", {}).get("p50", 1)

    for name, data in [("PyTorch FP32", pytorch), ("TFLite FP32", fp32), ("TFLite INT8", int8)]:
        if not data:
            continue
        lat = data.get("latency_ms", {})
        speedup = fp32_p50 / lat.get("p50", fp32_p50) if lat.get("p50") else "—"
        if isinstance(speedup, float):
            speedup = f"{speedup:.2f}x"
        row = ",".join(str(x) for x in [
            name,
            f"{data.get('top1_acc', '—'):.2f}" if isinstance(data.get("top1_acc"), float) else "—",
            f"{data.get('top5_acc', '—'):.2f}" if isinstance(data.get("top5_acc"), float) else "—",
            data.get("params", "—"),
            f"{data.get('size_mb', '—'):.1f}" if isinstance(data.get("size_mb"), float) else "—",
            f"{lat.get('p50', '—'):.1f}" if isinstance(lat.get("p50"), float) else "—",
            f"{lat.get('p95', '—'):.1f}" if isinstance(lat.get("p95"), float) else "—",
            speedup,
        ])
        rows.append(row)

    out = output_dir / "thesis_table.csv"
    with open(out, "w") as f:
        f.write("\n".join(rows))
    print(f"\n📋 Thesis table (CSV) saved → {out}")


# ─────────────────────────────────────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("PlantSight — Model Evaluation")
    print("=" * 60)

    # ── Device ────────────────────────────────────────────────────────
    if torch.cuda.is_available():
        device = torch.device("cuda")
    elif torch.backends.mps.is_available():
        device = torch.device("mps")
    else:
        device = torch.device("cpu")
    print(f"Device: {device}\n")

    # ── Test data ─────────────────────────────────────────────────────
    print("[1/5] Loading test dataset…")
    test_loader, class_names = get_test_loader(
        args.data_dir, args.test_split, args.seed, args.batch_size, args.workers
    )

    report = {}

    # ── PyTorch evaluation ────────────────────────────────────────────
    print("\n[2/5] Evaluating PyTorch model…")
    model, ckpt_classes, total_params, size_mb = load_pytorch_model(args.model_path, device)

    all_labels, all_probs = evaluate_pytorch(model, test_loader, device)
    all_preds_pt = np.argmax(all_probs, axis=1)

    top1_pt = accuracy_score(all_labels, all_preds_pt) * 100
    top5_pt = top_k_accuracy_score(all_labels, all_probs, k=5, labels=list(range(all_probs.shape[1]))) * 100

    print(f"\n   Top-1: {top1_pt:.2f}%  |  Top-5: {top5_pt:.2f}%")

    # Per-class report
    class_report = classification_report(
        all_labels, all_preds_pt, target_names=class_names, output_dict=True
    )

    # Confusion matrix
    cm = confusion_matrix(all_labels, all_preds_pt)

    # Latency benchmark
    print("   Benchmarking PyTorch latency…")
    pt_times = latency_pytorch(model, device, args.latency_runs)
    print(f"   P50={np.percentile(pt_times,50):.1f}ms  P95={np.percentile(pt_times,95):.1f}ms  P99={np.percentile(pt_times,99):.1f}ms")

    report["pytorch"] = {
        "top1_acc":   round(top1_pt, 4),
        "top5_acc":   round(top5_pt, 4),
        "params":     total_params,
        "size_mb":    round(size_mb, 2),
        "latency_ms": {
            "p50": round(np.percentile(pt_times, 50), 2),
            "p95": round(np.percentile(pt_times, 95), 2),
            "p99": round(np.percentile(pt_times, 99), 2),
            "mean": round(pt_times.mean(), 2),
        },
        "per_class": class_report,
    }

    # ── TFLite FP32 evaluation ────────────────────────────────────────
    if args.tflite_fp32:
        print("\n[3/5] Evaluating TFLite FP32…")
        result = evaluate_tflite(args.tflite_fp32, test_loader, args.latency_runs)
        if result[0] is not None:
            labels, preds, top1_fp32, times_fp32 = result
            import os
            fp32_file_mb = os.path.getsize(args.tflite_fp32) / 1e6
            print(f"   Top-1: {top1_fp32:.2f}%")
            print(f"   P50={np.percentile(times_fp32,50):.1f}ms  P95={np.percentile(times_fp32,95):.1f}ms")
            report["tflite_fp32"] = {
                "top1_acc": round(top1_fp32, 4),
                "size_mb":  round(fp32_file_mb, 2),
                "latency_ms": {
                    "p50":  round(np.percentile(times_fp32, 50), 2),
                    "p95":  round(np.percentile(times_fp32, 95), 2),
                    "mean": round(times_fp32.mean(), 2),
                },
            }
    else:
        print("\n[3/5] TFLite FP32 — skipped (pass --tflite_fp32 to evaluate)")

    # ── TFLite INT8 evaluation ────────────────────────────────────────
    if args.tflite_int8:
        print("\n[4/5] Evaluating TFLite INT8…")
        result = evaluate_tflite(args.tflite_int8, test_loader, args.latency_runs)
        if result[0] is not None:
            labels, preds, top1_int8, times_int8 = result
            import os
            int8_file_mb = os.path.getsize(args.tflite_int8) / 1e6
            acc_drop = top1_pt - top1_int8
            print(f"   Top-1: {top1_int8:.2f}%  (accuracy drop from PyTorch: {acc_drop:.2f}%)")
            print(f"   P50={np.percentile(times_int8,50):.1f}ms  P95={np.percentile(times_int8,95):.1f}ms")
            report["tflite_int8"] = {
                "top1_acc":     round(top1_int8, 4),
                "accuracy_drop": round(acc_drop, 4),
                "size_mb":      round(int8_file_mb, 2),
                "latency_ms": {
                    "p50":  round(np.percentile(times_int8, 50), 2),
                    "p95":  round(np.percentile(times_int8, 95), 2),
                    "mean": round(times_int8.mean(), 2),
                },
            }
    else:
        print("\n[4/5] TFLite INT8 — skipped (pass --tflite_int8 to evaluate)")

    # ── Plots & reports ───────────────────────────────────────────────
    print("\n[5/5] Saving plots and reports…")
    plot_confusion_matrix(cm, class_names, output_dir)
    plot_per_class_accuracy(class_names, cm, output_dir)

    # Full JSON report
    report_path = output_dir / "evaluation_report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"📋 Full evaluation report → {report_path}")

    save_thesis_table(report, output_dir)

    # Print thesis-ready summary
    print("\n" + "=" * 60)
    print("THESIS RESULTS SUMMARY")
    print("=" * 60)
    print(f"{'Model':<20} {'Top-1':>8} {'Top-5':>8} {'Size':>8} {'P50 lat':>10}")
    print("-" * 60)

    for name, key in [("PyTorch FP32", "pytorch"), ("TFLite FP32", "tflite_fp32"), ("TFLite INT8", "tflite_int8")]:
        d = report.get(key)
        if not d:
            continue
        lat = d.get("latency_ms", {}).get("p50", "—")
        lat_str = f"{lat:.1f}ms" if isinstance(lat, float) else "—"
        top5 = d.get("top5_acc", "—")
        top5_str = f"{top5:.2f}%" if isinstance(top5, float) else "—"
        print(f"  {name:<18} {d['top1_acc']:.2f}%  {top5_str:>8}  {d['size_mb']:.1f}MB  {lat_str:>10}")

    print("=" * 60)


if __name__ == "__main__":
    main()
