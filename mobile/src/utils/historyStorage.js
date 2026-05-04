import AsyncStorage from "@react-native-async-storage/async-storage";

const HISTORY_KEY = "@plantsight_history";
const MAX_RECORDS = 200;

/**
 * Convert an inference result → a flat history record.
 * Works for both edge (mock / TFLite) and cloud/hybrid (normalised API) results.
 */
export function buildHistoryRecord(result, imageUri, mode) {
  return {
    id           : `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp    : new Date().toISOString(),
    mode         : mode || result.mode || "cloud",
    plant        : result.plant        || "",
    disease_label: result.predicted_class || result.disease_label || "Unknown",
    disease_class: result.disease_class  || "",
    confidence   : result.confidence     || 0,
    severity     : result.severity       || "unknown",
    latency_ms   : result.latency_ms     || result.classify_ms || 0,
    infected_area: result.infected_area  ?? null,
    healthy_area : result.healthy_area   ?? null,
    top3         : result.top3           || [],
    treatment    : result.treatment      || null,
    imageUri     : imageUri              || null,
  };
}

/** Load all history records (newest-first). */
export async function loadHistory() {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Prepend a new record and trim to MAX_RECORDS. */
export async function saveHistoryRecord(record) {
  try {
    const existing = await loadHistory();
    const updated  = [record, ...existing].slice(0, MAX_RECORDS);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.warn("[HistoryStorage] save failed:", e);
    return null;
  }
}

/** Delete all history. */
export async function clearHistory() {
  try {
    await AsyncStorage.removeItem(HISTORY_KEY);
  } catch {}
}

/** Compute per-mode benchmark stats from local history. */
export async function computeBenchmarkStats() {
  const records = await loadHistory();
  const byMode  = {};

  for (const r of records) {
    const mode = r.mode || "unknown";
    if (!byMode[mode]) byMode[mode] = { latencies: [], confidences: [], count: 0 };
    byMode[mode].count += 1;
    if (r.latency_ms > 0) byMode[mode].latencies.push(r.latency_ms);
    if (r.confidence > 0) byMode[mode].confidences.push(r.confidence);
  }

  const out = {};
  for (const [mode, d] of Object.entries(byMode)) {
    const lats = d.latencies.slice().sort((a, b) => a - b);
    const n    = lats.length;
    const confs = d.confidences;
    out[mode] = {
      count        : d.count,
      mean_ms      : n ? Math.round(lats.reduce((a, b) => a + b, 0) / n) : 0,
      min_ms       : n ? lats[0] : 0,
      max_ms       : n ? lats[n - 1] : 0,
      p50_ms       : n ? lats[Math.floor(n * 0.50)] : 0,
      p95_ms       : n ? lats[Math.min(Math.floor(n * 0.95), n - 1)] : 0,
      avg_conf     : confs.length
        ? Math.round(confs.reduce((a, b) => a + b, 0) / confs.length * 10000) / 100
        : 0,
    };
  }
  return out;
}
