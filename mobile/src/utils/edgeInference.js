/**
 * PlantSight — Edge Inference Utility
 *
 * NOTE: TensorFlow.js / TFLite is not yet integrated.
 * This module returns mock results until the real INT8 model is trained
 * and converted. Once you have model_int8.tflite, swap in the real
 * implementation below.
 *
 * To enable real Edge inference later:
 *   1. npm install @tensorflow/tfjs @tensorflow/tfjs-react-native expo-gl
 *   2. Copy model_int8.tflite to mobile/assets/
 *   3. Replace mockEdgePredict() with the real implementation
 */

// ── Mock disease classes (matches backend PlantVillage 38 classes) ────────────
const CLASSES = [
  "Apple___Apple_scab",
  "Apple___Black_rot",
  "Apple___Cedar_apple_rust",
  "Apple___healthy",
  "Blueberry___healthy",
  "Cherry___Powdery_mildew",
  "Cherry___healthy",
  "Corn___Cercospora_leaf_spot",
  "Corn___Common_rust",
  "Corn___Northern_Leaf_Blight",
  "Corn___healthy",
  "Grape___Black_rot",
  "Grape___Esca_Black_Measles",
  "Grape___Leaf_blight",
  "Grape___healthy",
  "Orange___Haunglongbing",
  "Peach___Bacterial_spot",
  "Peach___healthy",
  "Pepper___Bacterial_spot",
  "Pepper___healthy",
  "Potato___Early_blight",
  "Potato___Late_blight",
  "Potato___healthy",
  "Raspberry___healthy",
  "Soybean___healthy",
  "Squash___Powdery_mildew",
  "Strawberry___Leaf_scorch",
  "Strawberry___healthy",
  "Tomato___Bacterial_spot",
  "Tomato___Early_blight",
  "Tomato___Late_blight",
  "Tomato___Leaf_Mold",
  "Tomato___Septoria_leaf_spot",
  "Tomato___Spider_mites",
  "Tomato___Target_Spot",
  "Tomato___Tomato_Yellow_Leaf_Curl_Virus",
  "Tomato___Tomato_mosaic_virus",
  "Tomato___healthy",
];

function parseLabel(rawLabel) {
  const parts   = rawLabel.split("___");
  const plant   = parts[0].replace(/_/g, " ");
  const disease = (parts[1] || "Healthy").replace(/_/g, " ");
  return { plant, disease };
}

// ── Mock inference (returns realistic-looking fake results) ───────────────────
async function mockEdgePredict() {
  // Simulate on-device latency (50–180ms — realistic for INT8 on mobile CPU)
  const latency = Math.floor(Math.random() * 130) + 50;
  await new Promise((resolve) => setTimeout(resolve, latency));

  const topIdx  = Math.floor(Math.random() * CLASSES.length);
  const topConf = 0.72 + Math.random() * 0.25;

  const otherIndices = [...Array(CLASSES.length).keys()]
    .filter((i) => i !== topIdx)
    .sort(() => Math.random() - 0.5)
    .slice(0, 2);

  const remaining = 1 - topConf;
  const conf2 = remaining * (0.4 + Math.random() * 0.3);
  const conf3 = remaining - conf2;

  const { plant, disease } = parseLabel(CLASSES[topIdx]);

  return {
    classification: {
      disease_label: disease,
      plant_name:    plant,
      confidence:    parseFloat(topConf.toFixed(4)),
      top3: [
        { label: parseLabel(CLASSES[topIdx]).disease,          confidence: parseFloat(topConf.toFixed(4)) },
        { label: parseLabel(CLASSES[otherIndices[0]]).disease, confidence: parseFloat(conf2.toFixed(4)) },
        { label: parseLabel(CLASSES[otherIndices[1]]).disease, confidence: parseFloat(conf3.toFixed(4)) },
      ],
      severity: disease.toLowerCase().includes("healthy") ? "healthy"
               : topConf > 0.85 ? "severe"
               : topConf > 0.65 ? "moderate" : "mild",
      model_used: "mock_edge",
    },
    segmentation: null,   // Edge mode has no segmentation
    treatment:    null,
    inference_meta: {
      mode:       "edge",
      latency_ms: latency,
      model:      "EfficientNet-B0 INT8 (mock)",
      device:     "on-device",
    },
    _mock: true,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run Edge inference on an image URI.
 * @param {string} imageUri - local file URI from expo-image-picker
 * @returns {Promise<object>} result in the same shape as backend /api/diagnose
 */
export async function runEdgeInference(imageUri) {
  return mockEdgePredict(imageUri);
}

/**
 * Warm up the Edge model (call once on app start).
 * No-op in mock mode — will load TFLite model in real mode.
 */
export async function warmupEdgeModel() {
  console.log("[EdgeInference] Mock mode active — no model warmup needed");
}
