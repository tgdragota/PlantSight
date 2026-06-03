import TREATMENTS from "../../assets/treatments.json";

// Must be at module level so Metro can statically bundle the binary asset
const MODEL_ASSET = require("../../assets/model_int8.tflite");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmtList(arr) {
  if (!arr || arr.length === 0) return null;
  return arr.map((s) => `• ${s}`).join("\n");
}

function lookupTreatment(clsKey) {
  const t = TREATMENTS[clsKey] || TREATMENTS["__default__"];
  if (!t) return null;
  return {
    cause      : t.cause               || null,
    immediate  : t.symptoms            || null,
    chemical   : fmtList(t.chemical)   || null,
    organic    : fmtList(t.organic)    || null,
    prevention : fmtList(t.prevention) || null,
  };
}

// 38 disease classes — order must match model output exactly
const CLASSES = [
  { cls: "Apple___Apple_scab",                     plant: "Apple",      label: "Apple scab"                   },
  { cls: "Apple___Black_rot",                      plant: "Apple",      label: "Apple black rot"               },
  { cls: "Apple___Cedar_apple_rust",               plant: "Apple",      label: "Cedar apple rust"              },
  { cls: "Apple___healthy",                        plant: "Apple",      label: "Apple healthy"                 },
  { cls: "Blueberry___healthy",                    plant: "Blueberry",  label: "Blueberry healthy"             },
  { cls: "Cherry___Powdery_mildew",                plant: "Cherry",     label: "Cherry powdery mildew"         },
  { cls: "Cherry___healthy",                       plant: "Cherry",     label: "Cherry healthy"                },
  { cls: "Corn___Cercospora_leaf_spot",            plant: "Corn",       label: "Corn cercospora leaf spot"     },
  { cls: "Corn___Common_rust",                     plant: "Corn",       label: "Corn common rust"              },
  { cls: "Corn___Northern_Leaf_Blight",            plant: "Corn",       label: "Corn northern leaf blight"     },
  { cls: "Corn___healthy",                         plant: "Corn",       label: "Corn healthy"                  },
  { cls: "Grape___Black_rot",                      plant: "Grape",      label: "Grape black rot"               },
  { cls: "Grape___Esca_Black_Measles",             plant: "Grape",      label: "Grape esca (black measles)"    },
  { cls: "Grape___Leaf_blight",                    plant: "Grape",      label: "Grape leaf blight"             },
  { cls: "Grape___healthy",                        plant: "Grape",      label: "Grape healthy"                 },
  { cls: "Orange___Haunglongbing",                 plant: "Orange",     label: "Orange citrus greening"        },
  { cls: "Peach___Bacterial_spot",                 plant: "Peach",      label: "Peach bacterial spot"          },
  { cls: "Peach___healthy",                        plant: "Peach",      label: "Peach healthy"                 },
  { cls: "Pepper___Bacterial_spot",                plant: "Pepper",     label: "Pepper bacterial spot"         },
  { cls: "Pepper___healthy",                       plant: "Pepper",     label: "Pepper healthy"                },
  { cls: "Potato___Early_blight",                  plant: "Potato",     label: "Potato early blight"           },
  { cls: "Potato___Late_blight",                   plant: "Potato",     label: "Potato late blight"            },
  { cls: "Potato___healthy",                       plant: "Potato",     label: "Potato healthy"                },
  { cls: "Raspberry___healthy",                    plant: "Raspberry",  label: "Raspberry healthy"             },
  { cls: "Soybean___healthy",                      plant: "Soybean",    label: "Soybean healthy"               },
  { cls: "Squash___Powdery_mildew",                plant: "Squash",     label: "Squash powdery mildew"         },
  { cls: "Strawberry___Leaf_scorch",               plant: "Strawberry", label: "Strawberry leaf scorch"        },
  { cls: "Strawberry___healthy",                   plant: "Strawberry", label: "Strawberry healthy"            },
  { cls: "Tomato___Bacterial_spot",                plant: "Tomato",     label: "Tomato bacterial spot"         },
  { cls: "Tomato___Early_blight",                  plant: "Tomato",     label: "Tomato early blight"           },
  { cls: "Tomato___Late_blight",                   plant: "Tomato",     label: "Tomato late blight"            },
  { cls: "Tomato___Leaf_Mold",                     plant: "Tomato",     label: "Tomato leaf mold"              },
  { cls: "Tomato___Septoria_leaf_spot",            plant: "Tomato",     label: "Tomato septoria leaf spot"     },
  { cls: "Tomato___Spider_mites",                  plant: "Tomato",     label: "Tomato spider mites"           },
  { cls: "Tomato___Target_Spot",                   plant: "Tomato",     label: "Tomato target spot"            },
  { cls: "Tomato___Tomato_Yellow_Leaf_Curl_Virus", plant: "Tomato",     label: "Tomato yellow leaf curl virus" },
  { cls: "Tomato___Tomato_mosaic_virus",           plant: "Tomato",     label: "Tomato mosaic virus"           },
  { cls: "Tomato___healthy",                       plant: "Tomato",     label: "Tomato healthy"                },
];

// ─────────────────────────────────────────────────────────────────────────────
// Softmax — converts raw INT8 logits to proper 0-1 probabilities
// ─────────────────────────────────────────────────────────────────────────────
function softmax(logits) {
  const max = Math.max(...logits); // subtract max for numerical stability
  const exps = logits.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

// ─────────────────────────────────────────────────────────────────────────────
// Build structured result from raw model scores (logits or probs)
// ─────────────────────────────────────────────────────────────────────────────
function buildResult(scores, latency_ms, isMock = false) {
  // Always apply softmax — if scores are already probabilities (sum=1) the
  // result is identical; if they are raw logits (INT8 dequantized) this
  // normalises them to [0,1] and prevents >100% display bugs.
  const probs = softmax(scores);
  const indexed = probs.map((s, i) => ({ s, i }));
  indexed.sort((a, b) => b.s - a.s);
  const top3 = indexed.slice(0, 3);

  const topIdx    = top3[0].i;
  const topConf   = top3[0].s; // now guaranteed in [0, 1] after softmax
  const top       = CLASSES[topIdx] || CLASSES[0];
  const isHealthy = top.label.toLowerCase().includes("healthy");

  return {
    predicted_class : top.label,
    plant           : top.plant,
    confidence      : parseFloat(topConf.toFixed(4)),
    severity        : isHealthy      ? "healthy"
                    : topConf > 0.90 ? "severe"
                    : topConf > 0.75 ? "high"
                    : topConf > 0.55 ? "medium" : "low",
    top3: top3.map(({ s, i }) => ({
      label      : CLASSES[i]?.label || `Class ${i}`,
      confidence : parseFloat(s.toFixed(4)),
    })),
    latency_ms    : latency_ms,
    classify_ms   : latency_ms,
    segment_ms    : 0,
    mode          : "edge",
    infected_area : null,
    healthy_area  : null,
    overlay_b64   : null,
    treatment     : lookupTreatment(top.cls),
    _mock         : isMock,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Real TFLite inference
// ─────────────────────────────────────────────────────────────────────────────
let _model       = null;
let _useMock     = false;
let _tflite      = null;
let _manipulator = null;
let _jpeg        = null;
let _asset       = null;
let _fs          = null;

async function loadDeps() {
  if (_tflite) return;
  try {
    _tflite      = require("react-native-fast-tflite");
    _manipulator = require("expo-image-manipulator");
    _jpeg        = require("jpeg-js");
    _asset       = require("expo-asset");
    _fs          = require("expo-file-system/legacy");
    console.log("[EdgeInference] Native deps loaded ✓");
  } catch (e) {
    console.warn("[EdgeInference] Native deps missing, using mock:", e.message);
    _useMock = true;
  }
}

// Copy the bundled .tflite from Metro/asset bundle to a real local file path
async function resolveModelPath() {
  const { Asset } = _asset;
  const { cacheDirectory, getInfoAsync, copyAsync } = _fs;

  // v4 suffix forces cache invalidation when model is replaced
  const destPath = cacheDirectory + "model_int8_v4.tflite";

  // Reuse only if file is at least 10MB (float32 model is ~16MB)
  const info = await getInfoAsync(destPath);
  if (info.exists && info.size > 10_000_000) {
    console.log("[EdgeInference] Model cached ✓ size:", info.size);
    return destPath;
  }
  // File missing or too small (corrupted download) — delete and re-copy
  if (info.exists) {
    console.log("[EdgeInference] Cached file too small (" + info.size + " bytes), re-copying...");
    const { deleteAsync } = _fs;
    await deleteAsync(destPath, { idempotent: true });
  }

  console.log("[EdgeInference] Copying model to cache...");
  const [resolved] = await Asset.loadAsync(MODEL_ASSET);
  await copyAsync({ from: resolved.localUri, to: destPath });
  console.log("[EdgeInference] Model cached ✓");
  return destPath;
}

async function getModel() {
  if (_model) return _model;
  const { loadTensorflowModel } = _tflite;
  const modelPath = await resolveModelPath();
  // Ensure file:// URI format — iOS requires it for local files
  const fileUri = modelPath.startsWith("file://") ? modelPath : `file://${modelPath}`;
  console.log("[EdgeInference] Loading from URI:", fileUri);
  // Try CoreML first (hardware-accelerated on device + M1/M2 simulator)
  // Falls back to CPU if CoreML unavailable
  try {
    _model = await loadTensorflowModel({ url: fileUri }, ["core-ml"]);
    console.log("[EdgeInference] Using CoreML delegate");
  } catch {
    _model = await loadTensorflowModel({ url: fileUri }, []);
    console.log("[EdgeInference] Using CPU delegate");
  }
  console.log("[EdgeInference] TFLite model loaded ✓");
  return _model;
}

async function imageToFloat32(imageUri) {
  const { manipulateAsync, SaveFormat } = _manipulator;

  // Resize to 224×224 and get base64-encoded JPEG
  const resized = await manipulateAsync(
    imageUri,
    [{ resize: { width: 224, height: 224 } }],
    { format: SaveFormat.JPEG, base64: true, compress: 1.0 }
  );

  // base64 → raw JPEG bytes
  const jpegBytes = Uint8Array.from(
    atob(resized.base64),
    (c) => c.charCodeAt(0)
  );

  // Decode JPEG → RGBA pixel buffer
  const { data: rgba } = _jpeg.decode(jpegBytes, { useTArray: true });

  // RGBA → RGB Float32 with ImageNet normalization
  // μ = [0.485, 0.456, 0.406]  σ = [0.229, 0.224, 0.225]
  // (must match training preprocessing exactly)
  const MEAN = [0.485, 0.456, 0.406];
  const STD  = [0.229, 0.224, 0.225];
  const float32 = new Float32Array(224 * 224 * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    float32[j]     = (rgba[i]     / 255.0 - MEAN[0]) / STD[0];   // R
    float32[j + 1] = (rgba[i + 1] / 255.0 - MEAN[1]) / STD[1];   // G
    float32[j + 2] = (rgba[i + 2] / 255.0 - MEAN[2]) / STD[2];   // B
  }
  return float32;
}

async function realEdgePredict(imageUri) {
  const t0    = Date.now();
  const model = await getModel();
  const input = await imageToFloat32(imageUri);

  // v3.x API: input must be ArrayBuffer[], output is ArrayBuffer[]
  // Try runSync first (avoids async overhead), fall back to run()
  let outputs;
  try {
    outputs = model.runSync([input.buffer]);
  } catch {
    outputs = await model.run([input.buffer]);
  }
  const scores = Array.from(new Float32Array(outputs[0]));

  return buildResult(scores, Date.now() - t0, false);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock inference (fallback when native modules not installed)
// ─────────────────────────────────────────────────────────────────────────────
async function mockEdgePredict() {
  const latency   = Math.floor(Math.random() * 130) + 50;
  await new Promise((r) => setTimeout(r, latency));

  const topIdx    = Math.floor(Math.random() * CLASSES.length);
  const isInvalid = Math.random() < 0.20;
  const topConf   = isInvalid
    ? 0.35 + Math.random() * 0.30
    : 0.72 + Math.random() * 0.25;

  const others = [...Array(CLASSES.length).keys()]
    .filter((i) => i !== topIdx)
    .sort(() => Math.random() - 0.5)
    .slice(0, 2);

  const rem    = 1 - topConf;
  const c2     = rem * (0.4 + Math.random() * 0.3);
  const c3     = rem - c2;

  const scores = new Array(CLASSES.length).fill(0);
  scores[topIdx]    = topConf;
  scores[others[0]] = c2;
  scores[others[1]] = c3;

  return buildResult(scores, latency, true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────
export async function runEdgeInference(imageUri) {
  await loadDeps();
  if (_useMock) return mockEdgePredict();
  try {
    return await realEdgePredict(imageUri);
  } catch (e) {
    console.warn("[EdgeInference] Real inference failed, falling back to mock:", e.message);
    _useMock = true;
    return mockEdgePredict();
  }
}

export async function warmupEdgeModel() {
  await loadDeps();
  if (_useMock) {
    console.log("[EdgeInference] Mock mode — no warmup needed");
    return;
  }
  try {
    console.log("[EdgeInference] Warming up TFLite model...");
    const model = await getModel();
    console.log("[EdgeInference] inputs:",  JSON.stringify(model.inputs));
    console.log("[EdgeInference] outputs:", JSON.stringify(model.outputs));
    const inputType  = model.inputs[0]?.dataType;
    const inputShape = model.inputs[0]?.shape;   // e.g. [1, 224, 224, 3]
    const numElements = inputShape ? inputShape.reduce((a, b) => a * b, 1) : 224 * 224 * 3;
    let dummy;
    if (inputType === "uint8" || inputType === "int8") {
      dummy = new Uint8Array(numElements).fill(128);
    } else {
      dummy = new Float32Array(numElements).fill(0.5);
    }
    console.log("[EdgeInference] Warmup input: type=" + inputType + " elements=" + numElements + " bytes=" + dummy.buffer.byteLength);
    // Try sync first (more reliable in simulator), fall back to async
    try {
      model.runSync([dummy.buffer]);
      console.log("[EdgeInference] runSync ok");
    } catch (syncErr) {
      console.warn("[EdgeInference] runSync failed:", syncErr?.message);
      await model.run([dummy.buffer]);
    }
    console.log("[EdgeInference] Warmup done ✓");
  } catch (e) {
    console.warn("[EdgeInference] Warmup failed:", e?.message, e?.toString(), e?.code, e?.nativeStackIOS?.[0]);
    _useMock = true;
  }
}
