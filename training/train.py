"""
PlantSight — EfficientNet-B0 Training Script
=============================================
Master's Thesis: Edge / Hybrid / Cloud AI Plant Disease Detection

Dataset  : PlantVillage (54 306 images, 38 classes, 14 crops)
Model    : EfficientNet-B0 (ImageNet pretrained → fine-tuned)
Strategy : Two-phase training
           Phase 1 — freeze backbone, train classifier head (5 epochs)
           Phase 2 — unfreeze all layers, fine-tune end-to-end (N epochs)

Output   :
  checkpoints/best_model.pth        ← best validation accuracy weights
  checkpoints/final_model.pth       ← final epoch weights
  checkpoints/class_names.json      ← label index → class name mapping
  checkpoints/training_history.json ← per-epoch metrics for plots
  plots/training_curves.png         ← loss + accuracy curves

Usage:
  python train.py --data_dir /path/to/plantvillage/color --epochs 30
  python train.py --data_dir ./data/plantvillage --epochs 30 --batch_size 64
"""

import os
import json
import time
import argparse
import warnings
from pathlib import Path

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, random_split
from torch.cuda.amp import GradScaler, autocast
import torchvision
from torchvision import datasets, transforms, models

warnings.filterwarnings("ignore", category=UserWarning)

# ─────────────────────────────────────────────────────────────────────────────
#  CONFIG
# ─────────────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="PlantSight — EfficientNet-B0 trainer")
    p.add_argument("--data_dir",    type=str,   default="./data/plantvillage/color",
                   help="Path to PlantVillage 'color' folder (subdirs = classes)")
    p.add_argument("--output_dir",  type=str,   default="./checkpoints",
                   help="Where to save model checkpoints and history")
    p.add_argument("--plots_dir",   type=str,   default="./plots",
                   help="Where to save training curve plots")
    p.add_argument("--epochs",      type=int,   default=30,
                   help="Total fine-tuning epochs (Phase 2). Phase 1 is always 5.")
    p.add_argument("--batch_size",  type=int,   default=32,
                   help="Batch size (reduce if you get OOM errors)")
    p.add_argument("--lr",          type=float, default=1e-3,
                   help="Learning rate for Phase 1 (head only)")
    p.add_argument("--lr_finetune", type=float, default=1e-4,
                   help="Learning rate for Phase 2 (full model)")
    p.add_argument("--val_split",   type=float, default=0.15,
                   help="Fraction of data used for validation")
    p.add_argument("--test_split",  type=float, default=0.10,
                   help="Fraction of data used for test")
    p.add_argument("--patience",    type=int,   default=7,
                   help="Early stopping patience (epochs without improvement)")
    p.add_argument("--label_smooth",type=float, default=0.1,
                   help="Label smoothing factor (0 = no smoothing)")
    p.add_argument("--workers",     type=int,   default=4,
                   help="DataLoader worker processes")
    p.add_argument("--seed",        type=int,   default=42)
    p.add_argument("--no_amp",      action="store_true",
                   help="Disable mixed precision (AMP) training")
    return p.parse_args()


# ─────────────────────────────────────────────────────────────────────────────
#  DATA TRANSFORMS
# ─────────────────────────────────────────────────────────────────────────────

IMG_SIZE = 224  # EfficientNet-B0 default input size

TRAIN_TRANSFORMS = transforms.Compose([
    transforms.Resize((IMG_SIZE + 32, IMG_SIZE + 32)),   # slightly larger first
    transforms.RandomCrop(IMG_SIZE),
    transforms.RandomHorizontalFlip(p=0.5),
    transforms.RandomVerticalFlip(p=0.2),
    transforms.RandomRotation(degrees=15),
    transforms.ColorJitter(
        brightness=0.3,
        contrast=0.3,
        saturation=0.3,
        hue=0.05,
    ),
    transforms.RandomGrayscale(p=0.05),
    transforms.ToTensor(),
    # ImageNet normalisation — EfficientNet was pretrained with these stats
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])

EVAL_TRANSFORMS = transforms.Compose([
    transforms.Resize((IMG_SIZE, IMG_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])


# ─────────────────────────────────────────────────────────────────────────────
#  MODEL
# ─────────────────────────────────────────────────────────────────────────────

def build_model(num_classes: int, device: torch.device) -> nn.Module:
    """Load pretrained EfficientNet-B0 and replace the classifier head."""
    weights = models.EfficientNet_B0_Weights.IMAGENET1K_V1
    model = models.efficientnet_b0(weights=weights)

    # Replace the final classification head
    in_features = model.classifier[1].in_features
    model.classifier = nn.Sequential(
        nn.Dropout(p=0.3, inplace=True),
        nn.Linear(in_features, num_classes),
    )
    return model.to(device)


def freeze_backbone(model: nn.Module):
    """Freeze all layers except the classifier head (Phase 1)."""
    for name, param in model.named_parameters():
        if "classifier" not in name:
            param.requires_grad = False
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"  Phase 1 — backbone frozen. Trainable params: {trainable:,}")


def unfreeze_all(model: nn.Module):
    """Unfreeze all layers for full fine-tuning (Phase 2)."""
    for param in model.parameters():
        param.requires_grad = True
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"  Phase 2 — all layers unfrozen. Trainable params: {trainable:,}")


# ─────────────────────────────────────────────────────────────────────────────
#  METRICS
# ─────────────────────────────────────────────────────────────────────────────

def accuracy(outputs, labels, topk=(1, 5)):
    """Compute top-k accuracy for a batch."""
    with torch.no_grad():
        maxk = max(topk)
        batch_size = labels.size(0)
        _, pred = outputs.topk(maxk, dim=1, largest=True, sorted=True)
        pred = pred.t()
        correct = pred.eq(labels.view(1, -1).expand_as(pred))
        results = []
        for k in topk:
            correct_k = correct[:k].reshape(-1).float().sum()
            results.append(correct_k.mul_(100.0 / batch_size).item())
        return results


# ─────────────────────────────────────────────────────────────────────────────
#  TRAIN / EVAL LOOPS
# ─────────────────────────────────────────────────────────────────────────────

def train_one_epoch(model, loader, criterion, optimizer, scaler, device, use_amp):
    model.train()
    total_loss = 0.0
    top1_sum   = 0.0
    n_batches  = len(loader)

    for batch_idx, (images, labels) in enumerate(loader):
        images, labels = images.to(device), labels.to(device)
        optimizer.zero_grad()

        with autocast(enabled=use_amp):
            outputs = model(images)
            loss    = criterion(outputs, labels)

        if use_amp:
            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            scaler.step(optimizer)
            scaler.update()
        else:
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

        top1, _ = accuracy(outputs, labels, topk=(1, 5))
        total_loss += loss.item()
        top1_sum   += top1

        # Progress every 20 batches
        if (batch_idx + 1) % 20 == 0 or (batch_idx + 1) == n_batches:
            print(f"    [{batch_idx+1:>4d}/{n_batches}] "
                  f"loss {total_loss/(batch_idx+1):.4f}  "
                  f"top-1 {top1_sum/(batch_idx+1):.2f}%", end="\r")

    print()  # newline after \r progress
    return total_loss / n_batches, top1_sum / n_batches


@torch.no_grad()
def evaluate(model, loader, criterion, device, use_amp, split_name="val"):
    model.eval()
    total_loss = 0.0
    top1_sum   = 0.0
    top5_sum   = 0.0
    n_batches  = len(loader)

    for images, labels in loader:
        images, labels = images.to(device), labels.to(device)
        with autocast(enabled=use_amp):
            outputs = model(images)
            loss    = criterion(outputs, labels)
        top1, top5 = accuracy(outputs, labels, topk=(1, 5))
        total_loss += loss.item()
        top1_sum   += top1
        top5_sum   += top5

    avg_loss = total_loss / n_batches
    avg_top1 = top1_sum  / n_batches
    avg_top5 = top5_sum  / n_batches
    print(f"  {split_name:>4s} → loss {avg_loss:.4f}  top-1 {avg_top1:.2f}%  top-5 {avg_top5:.2f}%")
    return avg_loss, avg_top1, avg_top5


# ─────────────────────────────────────────────────────────────────────────────
#  EARLY STOPPING
# ─────────────────────────────────────────────────────────────────────────────

class EarlyStopping:
    def __init__(self, patience: int, output_dir: str):
        self.patience    = patience
        self.best_acc    = 0.0
        self.counter     = 0
        self.best_path   = Path(output_dir) / "best_model.pth"
        self.should_stop = False

    def step(self, val_acc: float, model: nn.Module, class_names: list):
        if val_acc > self.best_acc:
            self.best_acc = val_acc
            self.counter  = 0
            # Save best model + class names together
            torch.save({
                "model_state_dict": model.state_dict(),
                "val_top1_acc":     val_acc,
                "class_names":      class_names,
                "num_classes":      len(class_names),
                "img_size":         IMG_SIZE,
            }, self.best_path)
            print(f"  ✅ New best saved ({val_acc:.2f}%) → {self.best_path}")
        else:
            self.counter += 1
            print(f"  ⏳ No improvement for {self.counter}/{self.patience} epochs")
            if self.counter >= self.patience:
                self.should_stop = True
                print("  🛑 Early stopping triggered")


# ─────────────────────────────────────────────────────────────────────────────
#  PLOTTING
# ─────────────────────────────────────────────────────────────────────────────

def save_plots(history: dict, plots_dir: str):
    try:
        import matplotlib
        matplotlib.use("Agg")  # non-interactive backend
        import matplotlib.pyplot as plt

        plots_path = Path(plots_dir)
        plots_path.mkdir(parents=True, exist_ok=True)

        epochs = range(1, len(history["train_loss"]) + 1)

        fig, axes = plt.subplots(1, 2, figsize=(14, 5))
        fig.patch.set_facecolor("#0d150d")

        for ax in axes:
            ax.set_facecolor("#080d08")
            ax.tick_params(colors="#aaaaaa")
            ax.spines["bottom"].set_color("#333")
            ax.spines["left"].set_color("#333")
            ax.spines["top"].set_visible(False)
            ax.spines["right"].set_visible(False)

        # Loss
        ax = axes[0]
        ax.plot(epochs, history["train_loss"], color="#00e676", linewidth=2, label="Train Loss")
        ax.plot(epochs, history["val_loss"],   color="#ab47bc", linewidth=2, label="Val Loss",   linestyle="--")
        ax.set_title("Training & Validation Loss", color="#e8f5e9", fontsize=13, fontweight="bold")
        ax.set_xlabel("Epoch", color="#888")
        ax.set_ylabel("Loss",  color="#888")
        ax.legend(facecolor="#1a1a1a", edgecolor="#333", labelcolor="#cccccc")

        # Accuracy
        ax = axes[1]
        ax.plot(epochs, history["train_top1"], color="#00e676", linewidth=2, label="Train Top-1")
        ax.plot(epochs, history["val_top1"],   color="#ab47bc", linewidth=2, label="Val Top-1",   linestyle="--")
        ax.plot(epochs, history["val_top5"],   color="#42a5f5", linewidth=2, label="Val Top-5",   linestyle=":")
        ax.set_title("Top-1 & Top-5 Accuracy (%)", color="#e8f5e9", fontsize=13, fontweight="bold")
        ax.set_xlabel("Epoch", color="#888")
        ax.set_ylabel("Accuracy (%)", color="#888")
        ax.legend(facecolor="#1a1a1a", edgecolor="#333", labelcolor="#cccccc")

        # Best val marker
        best_epoch = history["val_top1"].index(max(history["val_top1"])) + 1
        axes[1].axvline(x=best_epoch, color="#ffab40", linewidth=1, linestyle=":", alpha=0.7)
        axes[1].annotate(f"best epoch {best_epoch}",
                         xy=(best_epoch, max(history["val_top1"])),
                         xytext=(best_epoch + 0.5, max(history["val_top1"]) - 3),
                         color="#ffab40", fontsize=9)

        plt.tight_layout()
        out = plots_path / "training_curves.png"
        plt.savefig(out, dpi=150, bbox_inches="tight")
        plt.close()
        print(f"\n📊 Training curves saved → {out}")
    except ImportError:
        print("\n⚠ matplotlib not installed — skipping plot (pip install matplotlib)")


# ─────────────────────────────────────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()

    # ── Reproducibility ──────────────────────────────────────────────
    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)

    # ── Device ───────────────────────────────────────────────────────
    if torch.cuda.is_available():
        device = torch.device("cuda")
        print(f"🖥  GPU: {torch.cuda.get_device_name(0)}")
    elif torch.backends.mps.is_available():
        device = torch.device("mps")
        print("🖥  Apple MPS (Metal GPU) — this is fast on M1/M2/M3!")
    else:
        device = torch.device("cpu")
        print("🖥  CPU only — training will be slow. Consider using Google Colab with GPU.")

    use_amp = not args.no_amp and device.type == "cuda"
    print(f"⚡  Mixed precision (AMP): {'ON' if use_amp else 'OFF'}\n")

    # ── Output dirs ──────────────────────────────────────────────────
    Path(args.output_dir).mkdir(parents=True, exist_ok=True)
    Path(args.plots_dir).mkdir(parents=True, exist_ok=True)

    # ── Dataset ──────────────────────────────────────────────────────
    data_path = Path(args.data_dir)
    if not data_path.exists():
        print(f"❌ Data directory not found: {data_path}")
        print("   Download PlantVillage from Kaggle:")
        print("   kaggle datasets download -d abdallahalidev/plantvillage-dataset")
        print("   Then unzip and point --data_dir to the 'color' subfolder.")
        return

    print(f"📂 Loading dataset from: {data_path}")
    full_dataset = datasets.ImageFolder(root=str(data_path), transform=TRAIN_TRANSFORMS)

    class_names = full_dataset.classes
    num_classes = len(class_names)
    total_images = len(full_dataset)
    print(f"   Classes : {num_classes}  |  Images: {total_images:,}")
    print(f"   First 5 classes: {class_names[:5]}")

    # Save class names
    class_names_path = Path(args.output_dir) / "class_names.json"
    with open(class_names_path, "w") as f:
        json.dump({i: name for i, name in enumerate(class_names)}, f, indent=2)
    print(f"   Class names saved → {class_names_path}\n")

    # ── Train / Val / Test split ──────────────────────────────────────
    n_test  = int(total_images * args.test_split)
    n_val   = int(total_images * args.val_split)
    n_train = total_images - n_val - n_test

    train_set, val_set, test_set = random_split(
        full_dataset,
        [n_train, n_val, n_test],
        generator=torch.Generator().manual_seed(args.seed),
    )

    # Apply eval transforms to val + test (no augmentation)
    val_set.dataset  = datasets.ImageFolder(root=str(data_path), transform=EVAL_TRANSFORMS)
    test_set.dataset = datasets.ImageFolder(root=str(data_path), transform=EVAL_TRANSFORMS)
    # Re-use same indices so there's no leakage
    val_set.indices  = val_set.indices
    test_set.indices = test_set.indices

    print(f"📊 Split: train {n_train:,}  val {n_val:,}  test {n_test:,}")

    loader_kwargs = dict(
        num_workers=args.workers,
        pin_memory=(device.type == "cuda"),
        persistent_workers=(args.workers > 0),
    )
    train_loader = DataLoader(train_set, batch_size=args.batch_size, shuffle=True,  **loader_kwargs)
    val_loader   = DataLoader(val_set,   batch_size=args.batch_size, shuffle=False, **loader_kwargs)
    test_loader  = DataLoader(test_set,  batch_size=args.batch_size, shuffle=False, **loader_kwargs)

    # ── Model ─────────────────────────────────────────────────────────
    print("\n🏗  Building EfficientNet-B0 (pretrained ImageNet)…")
    model = build_model(num_classes, device)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"   Total params: {total_params:,}\n")

    # Label smoothing loss (helps prevent overconfidence)
    criterion = nn.CrossEntropyLoss(label_smoothing=args.label_smooth)
    scaler    = GradScaler(enabled=use_amp)

    # ── History tracking ──────────────────────────────────────────────
    history = {
        "train_loss": [], "val_loss": [],
        "train_top1": [], "val_top1": [], "val_top5": [],
        "phase": [],
    }
    early_stopping = EarlyStopping(patience=args.patience, output_dir=args.output_dir)

    # ═══════════════════════════════════════════════════════════════════
    # PHASE 1 — Classifier head only (5 epochs, high LR)
    # ═══════════════════════════════════════════════════════════════════
    PHASE1_EPOCHS = 5
    print("═" * 60)
    print("PHASE 1 — Training classifier head only")
    print("═" * 60)
    freeze_backbone(model)

    optimizer_p1 = optim.Adam(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=args.lr,
        weight_decay=1e-4,
    )
    scheduler_p1 = optim.lr_scheduler.OneCycleLR(
        optimizer_p1,
        max_lr=args.lr,
        steps_per_epoch=len(train_loader),
        epochs=PHASE1_EPOCHS,
    )

    for epoch in range(1, PHASE1_EPOCHS + 1):
        t0 = time.time()
        print(f"\n[Phase 1 | Epoch {epoch}/{PHASE1_EPOCHS}]")
        train_loss, train_top1 = train_one_epoch(
            model, train_loader, criterion, optimizer_p1, scaler, device, use_amp
        )
        scheduler_p1.step()
        val_loss, val_top1, val_top5 = evaluate(model, val_loader, criterion, device, use_amp)
        elapsed = time.time() - t0
        print(f"  ⏱  {elapsed:.1f}s  |  LR: {scheduler_p1.get_last_lr()[0]:.2e}")

        history["train_loss"].append(train_loss)
        history["val_loss"].append(val_loss)
        history["train_top1"].append(train_top1)
        history["val_top1"].append(val_top1)
        history["val_top5"].append(val_top5)
        history["phase"].append(1)

        early_stopping.step(val_top1, model, class_names)

    # ═══════════════════════════════════════════════════════════════════
    # PHASE 2 — Full model fine-tuning (args.epochs, lower LR)
    # ═══════════════════════════════════════════════════════════════════
    print("\n" + "═" * 60)
    print("PHASE 2 — Fine-tuning all layers")
    print("═" * 60)
    unfreeze_all(model)

    # Differential learning rates: lower LR for backbone, higher for head
    backbone_params = [p for n, p in model.named_parameters() if "classifier" not in n]
    head_params     = [p for n, p in model.named_parameters() if "classifier"     in n]

    optimizer_p2 = optim.AdamW([
        {"params": backbone_params, "lr": args.lr_finetune * 0.1},
        {"params": head_params,     "lr": args.lr_finetune},
    ], weight_decay=1e-4)

    scheduler_p2 = optim.lr_scheduler.CosineAnnealingLR(
        optimizer_p2,
        T_max=args.epochs,
        eta_min=1e-7,
    )

    # Reset early stopping counter (but keep best_acc from Phase 1)
    early_stopping.counter = 0

    for epoch in range(1, args.epochs + 1):
        t0 = time.time()
        print(f"\n[Phase 2 | Epoch {epoch}/{args.epochs}]")
        train_loss, train_top1 = train_one_epoch(
            model, train_loader, criterion, optimizer_p2, scaler, device, use_amp
        )
        scheduler_p2.step()
        val_loss, val_top1, val_top5 = evaluate(model, val_loader, criterion, device, use_amp)
        elapsed = time.time() - t0
        lrs = [g["lr"] for g in optimizer_p2.param_groups]
        print(f"  ⏱  {elapsed:.1f}s  |  LR backbone: {lrs[0]:.2e}  head: {lrs[1]:.2e}")

        history["train_loss"].append(train_loss)
        history["val_loss"].append(val_loss)
        history["train_top1"].append(train_top1)
        history["val_top1"].append(val_top1)
        history["val_top5"].append(val_top5)
        history["phase"].append(2)

        early_stopping.step(val_top1, model, class_names)
        if early_stopping.should_stop:
            print(f"\n🛑 Stopped early at epoch {epoch + PHASE1_EPOCHS} total")
            break

    # ── Save final model ──────────────────────────────────────────────
    final_path = Path(args.output_dir) / "final_model.pth"
    torch.save({
        "model_state_dict": model.state_dict(),
        "class_names":      class_names,
        "num_classes":      num_classes,
        "img_size":         IMG_SIZE,
    }, final_path)
    print(f"\n💾 Final model saved → {final_path}")

    # ── Save training history ─────────────────────────────────────────
    history_path = Path(args.output_dir) / "training_history.json"
    with open(history_path, "w") as f:
        json.dump(history, f, indent=2)
    print(f"📈 Training history saved → {history_path}")

    # ── Final test evaluation ─────────────────────────────────────────
    print("\n" + "═" * 60)
    print("FINAL TEST EVALUATION (loading best checkpoint)")
    print("═" * 60)

    checkpoint = torch.load(early_stopping.best_path, map_location=device)
    model.load_state_dict(checkpoint["model_state_dict"])
    test_loss, test_top1, test_top5 = evaluate(
        model, test_loader, criterion, device, use_amp, split_name="test"
    )
    print(f"\n🏆 FINAL RESULTS")
    print(f"   Test Top-1 Accuracy : {test_top1:.2f}%")
    print(f"   Test Top-5 Accuracy : {test_top5:.2f}%")
    print(f"   Best Val Top-1      : {early_stopping.best_acc:.2f}%")
    print(f"   Classes             : {num_classes}")
    print(f"   Dataset size        : {total_images:,} images")

    # Append test results to history
    history["test_top1"] = test_top1
    history["test_top5"] = test_top5
    with open(history_path, "w") as f:
        json.dump(history, f, indent=2)

    # ── Plots ─────────────────────────────────────────────────────────
    save_plots(history, args.plots_dir)

    print("\n✅ Training complete!")
    print(f"   Best model : {early_stopping.best_path}")
    print(f"   Class map  : {class_names_path}")
    print("\nNext step — convert to TFLite for Edge mode:")
    print(f"   python convert_tflite.py --model_path {early_stopping.best_path}")


if __name__ == "__main__":
    main()
