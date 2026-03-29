/**
 * PlantSight API Client — Mobile version (React Native / Expo)
 * Identical logic to web/src/api/plantApi.js
 * Difference: device_id uses AsyncStorage instead of localStorage
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";

// ── Device ID ─────────────────────────────────────────────────────────────────
async function getDeviceId() {
  const KEY = "plantsight_device_id";
  let id = await AsyncStorage.getItem(KEY);
  if (!id) {
    id = `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await AsyncStorage.setItem(KEY, id);
  }
  return id;
}

// ── Main diagnose ─────────────────────────────────────────────────────────────
export async function diagnoseImage(imageFile, mode = "cloud") {
  const deviceId = await getDeviceId();

  const formData = new FormData();
  formData.append("image", imageFile);
  formData.append("mode", mode);
  formData.append("device_id", deviceId);

  const t0 = Date.now();

  const res = await fetch(`${API_BASE}/api/diagnose`, {
    method: "POST",
    body: formData,
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Server error ${res.status}`);
  }

  const data = await res.json();
  data._client_latency_ms = Date.now() - t0;
  return data;
}

// ── History ───────────────────────────────────────────────────────────────────
export async function getHistory(limit = 20) {
  const deviceId = await getDeviceId();
  const res = await fetch(`${API_BASE}/api/history?device_id=${deviceId}&limit=${limit}`);
  if (!res.ok) throw new Error("Could not load history");
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

// ── URI → Blob (Expo) ─────────────────────────────────────────────────────────
export async function uriToBlob(uri) {
  const res = await fetch(uri);
  const blob = await res.blob();
  // React Native FormData needs { uri, name, type } format
  return { uri, name: "plant.jpg", type: "image/jpeg" };
}
