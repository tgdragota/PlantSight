/**
 * PlantSight API Client — shared between Web and Mobile.
 * Copy this file identically to mobile/src/api/plantApi.js
 *
 * Configuration:
 *   Web:    set REACT_APP_API_URL in .env.local
 *   Expo:   set EXPO_PUBLIC_API_URL in .env
 *   Phone:  use your computer's LAN IP, e.g. http://192.168.1.42:8000
 */

// In Vite dev mode the proxy in vite.config.js forwards /api → localhost:8000
// so "" (empty string) means relative URLs — no CORS issues in the browser.
// process.env is Node/Expo only — never reference it here (causes ReferenceError in browser).
const API_BASE = import.meta?.env?.VITE_API_URL ?? "";

// ── Device ID ─────────────────────────────────────────────────────────────────
export function getDeviceId() {
  const KEY = "plantsight_device_id";
  let id = null;

  try {
    id = localStorage.getItem(KEY);          // Web
  } catch {
    // React Native AsyncStorage fallback — handled externally
  }

  if (!id) {
    id = crypto.randomUUID
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try { localStorage.setItem(KEY, id); } catch { /* noop in RN */ }
  }
  return id;
}

// ── Main diagnose ─────────────────────────────────────────────────────────────
/**
 * Send an image to the backend for full diagnosis.
 * @param {File|Blob} imageFile
 * @param {"cloud"|"hybrid"|"edge_verify"} mode
 * @returns {Promise<DiagnoseResult>}
 */
export async function diagnoseImage(imageFile, mode = "cloud") {
  const formData = new FormData();
  formData.append("image", imageFile);
  formData.append("mode", mode);
  formData.append("device_id", getDeviceId());

  const t0 = Date.now();

  const res = await fetch(`${API_BASE}/api/diagnose`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Server error ${res.status}`);
  }

  const data = await res.json();
  data._client_latency_ms = Date.now() - t0;
  return data;
}

// ── Classify only ─────────────────────────────────────────────────────────────
export async function classifyImage(imageFile, mode = "hybrid") {
  const formData = new FormData();
  formData.append("image", imageFile);
  formData.append("mode", mode);

  const res = await fetch(`${API_BASE}/api/classify`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(`Classify error ${res.status}`);
  return res.json();
}

// ── Segment only ──────────────────────────────────────────────────────────────
export async function segmentImage(imageFile) {
  const formData = new FormData();
  formData.append("image", imageFile);

  const res = await fetch(`${API_BASE}/api/segment`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(`Segment error ${res.status}`);
  return res.json();
}

// ── History ───────────────────────────────────────────────────────────────────
export async function getHistory(limit = 20) {
  const res = await fetch(
      `${API_BASE}/api/history?device_id=${getDeviceId()}&limit=${limit}`
  );
  if (!res.ok) throw new Error("Could not load history");
  return res.json();
}

// ── Clear history ─────────────────────────────────────────────────────────────
export async function clearHistory() {
  const res = await fetch(
      `${API_BASE}/api/history?device_id=${getDeviceId()}`,
      { method: "DELETE" }
  );
  if (!res.ok) throw new Error("Could not clear history");
  return res.json();
}

// ── Health check ──────────────────────────────────────────────────────────────
export async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/api/health`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json();
    return data.status === "ok";
  } catch {
    return false;   // server unreachable → use Edge mode
  }
}

// ── URI → Blob (Expo only) ────────────────────────────────────────────────────
export async function uriToBlob(uri) {
  const res = await fetch(uri);
  const blob = await res.blob();
  return new File([blob], "plant.jpg", { type: "image/jpeg" });
}
