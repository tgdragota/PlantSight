/**
 * PlantSight API Client — Mobile version (React Native / Expo)
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export const API_BASE = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";

// ── Device ID ─────────────────────────────────────────────────────────────────
export async function getDeviceId() {
  const KEY = "plantsight_device_id";
  let id = await AsyncStorage.getItem(KEY);
  if (!id) {
    id = `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await AsyncStorage.setItem(KEY, id);
  }
  return id;
}

// ── Normalize API response → flat shape expected by ResultScreen ──────────────
export function normalizeResult(data) {
  const cls  = data.classification  || {};
  const seg  = data.segmentation    || {};
  const meta = data.inference_meta  || {};
  return {
    predicted_class : cls.disease_label  || cls.disease_class || "Unknown",
    plant           : cls.plant          || "",
    confidence      : cls.confidence     || 0,
    severity        : cls.severity       || "unknown",
    top3            : cls.top3           || [],
    latency_ms      : meta.latency_ms    || 0,
    classify_ms     : meta.classify_ms   || 0,
    segment_ms      : meta.segment_ms    || 0,
    mode            : meta.mode          || "cloud",
    infected_area   : seg.infected_area  ?? null,
    healthy_area    : seg.healthy_area   ?? null,
    overlay_b64     : seg.overlay_b64    || null,
    treatment       : data.treatment     || {},
  };
}

// ── Main diagnose ─────────────────────────────────────────────────────────────
export async function diagnoseImage(imageFile, mode = "cloud") {
  const deviceId = await getDeviceId();

  const formData = new FormData();
  formData.append("image", imageFile);
  formData.append("mode", mode);
  formData.append("device_id", deviceId);

  const res = await fetch(`${API_BASE}/api/diagnose`, {
    method : "POST",
    body   : formData,
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Server error ${res.status}`);
  }

  const data = await res.json();
  return normalizeResult(data);
}

// ── History ───────────────────────────────────────────────────────────────────
export async function getHistory(limit = 50) {
  const deviceId = await getDeviceId();
  const res = await fetch(`${API_BASE}/api/history?device_id=${deviceId}&limit=${limit}`);
  if (!res.ok) throw new Error("Could not load history");
  return res.json();
}

// ── Research metrics ──────────────────────────────────────────────────────────
export async function getResearch() {
  const res = await fetch(`${API_BASE}/api/research`);
  if (!res.ok) throw new Error("Could not load research data");
  return res.json();
}

// ── Health check ──────────────────────────────────────────────────────────────
export async function checkHealth() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${API_BASE}/api/health`, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json();
    return data.status === "ok";
  } catch {
    return false;
  }
}

// ── URI → RN FormData object ──────────────────────────────────────────────────
export async function uriToBlob(uri) {
  // React Native FormData needs { uri, name, type } format — do NOT blob()
  return { uri, name: "plant.jpg", type: "image/jpeg" };
}
