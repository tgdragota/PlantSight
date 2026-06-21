"""
PlantSight — Build Table 9 (Per-class accuracy breakdown)
===========================================================
Citește results/evaluation_report.json (generat de evaluate.py) și
construiește Tabelul 9 din teza: Cloud Acc. (%) vs Edge Acc. (%) per clasă,
sortat descrescător după Cloud, cu diferenta (Cloud-Edge) si steag rosu
pentru orice clasa unde Edge e cu >5 puncte procentuale sub Cloud.

IMPORTANT: trebuie sa rulezi mai intai evaluate.py CU --tflite_int8, ex:

  python evaluate.py \\
      --model_path ./checkpoints/best_model.pth \\
      --data_dir ./data/plantvillage/color \\
      --tflite_int8 ./converted/model_int8.tflite

altfel report["tflite_int8"]["per_class"] nu exista si scriptul iti zice
ce lipseste.

Usage:
  python build_table9.py
  python build_table9.py --report results/evaluation_report.json --out results/table9.csv
"""

import argparse
import json
from pathlib import Path


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--report", default="results/evaluation_report.json")
    p.add_argument("--out", default="results/table9.csv")
    p.add_argument("--red_threshold", type=float, default=5.0,
                    help="Puncte procentuale: Cloud-Edge peste asta = rand rosu")
    return p.parse_args()


def main():
    args = parse_args()
    report_path = Path(args.report)
    if not report_path.exists():
        raise SystemExit(f"Nu gasesc {report_path}. Ruleaza mai intai evaluate.py.")

    report = json.loads(report_path.read_text())

    cloud = report.get("pytorch", {}).get("per_class")
    edge = report.get("tflite_int8", {}).get("per_class")

    if cloud is None:
        raise SystemExit("report['pytorch']['per_class'] lipseste — ruleaza evaluate.py.")
    if edge is None:
        raise SystemExit(
            "report['tflite_int8']['per_class'] lipseste — ruleaza evaluate.py CU "
            "--tflite_int8 ./converted/model_int8.tflite (scriptul a fost actualizat sa "
            "salveze acest breakdown)."
        )

    # Excludem randurile de agregat din classification_report
    skip = {"accuracy", "macro avg", "weighted avg"}
    class_names = sorted(c for c in cloud.keys() if c not in skip)

    rows = []
    for c in class_names:
        cloud_acc = cloud[c]["recall"] * 100   # recall per clasa == accuracy per clasa
        edge_acc = edge.get(c, {}).get("recall")
        edge_acc = edge_acc * 100 if edge_acc is not None else None
        diff = (cloud_acc - edge_acc) if edge_acc is not None else None
        rows.append((c, cloud_acc, edge_acc, diff))

    # Sortare descrescator dupa Cloud (cerinta din teza)
    rows.sort(key=lambda r: r[1], reverse=True)

    # CSV
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    lines = ["Class,Cloud Acc. (%),Edge Acc. (%),(Cloud-Edge),Red Flag"]
    for c, cloud_acc, edge_acc, diff in rows:
        edge_str = f"{edge_acc:.2f}" if edge_acc is not None else "N/A"
        diff_str = f"{diff:+.2f}" if diff is not None else "N/A"
        red = "YES" if (diff is not None and diff > args.red_threshold) else ""
        lines.append(f"{c},{cloud_acc:.2f},{edge_str},{diff_str},{red}")
    out_path.write_text("\n".join(lines))

    # Print frumos in consola, gata de copiat in Word
    print(f"{'Class':<55} {'Cloud %':>8} {'Edge %':>8} {'Diff pp':>9}  Flag")
    print("-" * 90)
    for c, cloud_acc, edge_acc, diff in rows:
        edge_str = f"{edge_acc:6.2f}" if edge_acc is not None else "   N/A"
        diff_str = f"{diff:+6.2f}" if diff is not None else "   N/A"
        flag = "RED" if (diff is not None and diff > args.red_threshold) else ""
        print(f"{c:<55} {cloud_acc:8.2f} {edge_str:>8} {diff_str:>9}  {flag}")

    print(f"\nCSV salvat -> {out_path}")
    print("Copiaza valorile direct in celulele goale din Tabelul 9 din teza.")


if __name__ == "__main__":
    main()
