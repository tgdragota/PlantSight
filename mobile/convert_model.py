"""
Re-export model to TFLite WITHOUT Select TF Ops (MatMul / AddV2).
Run this wherever you have the original .h5 or SavedModel.

Usage:
    python convert_model.py --model path/to/your_model.h5
    python convert_model.py --model path/to/saved_model_folder
"""
import argparse, os, sys
import numpy as np

def convert(model_path, output_path="model_int8_fixed.tflite", use_int8=True):
    import tensorflow as tf

    print(f"Loading model from: {model_path}")
    if os.path.isdir(model_path):
        model = tf.saved_model.load(model_path)
        converter = tf.lite.TFLiteConverter.from_saved_model(model_path)
    else:
        model = tf.keras.models.load_model(model_path)
        converter = tf.lite.TFLiteConverter.from_keras_model(model)

    # ── Key: do NOT include SELECT_TF_OPS ──────────────────────────────
    # Only use built-in TFLite ops — forces proper conversion
    converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS]

    if use_int8:
        converter.optimizations = [tf.lite.Optimize.DEFAULT]

        # Representative dataset for INT8 calibration
        # Uses random data — replace with real validation images for better accuracy
        def representative_data_gen():
            for _ in range(100):
                data = np.random.rand(1, 224, 224, 3).astype(np.float32)
                yield [data]

        converter.representative_dataset = representative_data_gen
        converter.target_spec.supported_types = [tf.int8]
        converter.inference_input_type  = tf.float32   # keep float I/O
        converter.inference_output_type = tf.float32

    print("Converting...")
    tflite_model = converter.convert()

    with open(output_path, "wb") as f:
        f.write(tflite_model)

    size_mb = len(tflite_model) / 1_000_000
    print(f"Saved to {output_path}  ({size_mb:.1f} MB)")

    # Quick verify — check no Flex/Select ops in output
    with open(output_path, "rb") as f:
        raw = f.read()
    flex_count = raw.count(b"Flex")
    if flex_count:
        print(f"WARNING: {flex_count} Flex ops still present — model may not run on device")
    else:
        print("✓ No Flex/Select ops — model is compatible with standard TFLite runtime")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="Path to .h5 or SavedModel folder")
    parser.add_argument("--output", default="model_int8_fixed.tflite")
    parser.add_argument("--no-int8", action="store_true")
    args = parser.parse_args()
    convert(args.model, args.output, use_int8=not args.no_int8)
