import { useState, useCallback } from "react";
import ModeSelector from "../components/ModeSelector";
import ImageUpload from "../components/ImageUpload";
import ResultCard from "../components/ResultCard";
import SegmentationOverlay from "../components/SegmentationOverlay";
import TreatmentPanel from "../components/TreatmentPanel";
import { diagnoseImage, getDeviceId } from "../api/plantApi";

const API_BASE = import.meta?.env?.VITE_API_URL ?? ""; // v2

function ConfirmModal({ result, imageFile, onClose }) {
  const [wasCorrect, setWasCorrect] = useState(null);
  const [correction, setCorrection] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    const confirmedLabel = wasCorrect
      ? result.classification.disease_class
      : correction.trim();
    if (!wasCorrect && !confirmedLabel) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("image", imageFile);
      fd.append("confirmed_label", confirmedLabel);
      fd.append("original_label", result.classification.disease_class);
      fd.append("was_correct", wasCorrect ? "true" : "false");
      fd.append("confidence", result.classification.confidence);
      fd.append("mode", result.inference_meta?.mode ?? "cloud");
      fd.append("device_id", getDeviceId());
      const res = await fetch(`${API_BASE}/api/confirm`, { method: "POST", body: fd });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Server returned ${res.status}: ${errText}`);
      }
      setDone(true);
    } catch (e) {
      alert("Could not submit: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div style={{ background: "#0d1a0d", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 28, maxWidth: 460, width: "100%" }} onClick={e => e.stopPropagation()}>
        {done ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ color: "#00e676", fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
              {wasCorrect ? "Diagnosis confirmed!" : `Correction saved!`}
            </div>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>This sample will help improve the AI model.</p>
            <button onClick={onClose} style={{ marginTop: 20, background: "rgba(255,255,255,0.08)", border: "none", color: "#e8f5e9", borderRadius: 10, padding: "10px 24px", cursor: "pointer", fontSize: 14 }}>Close</button>
          </div>
        ) : (
          <>
            <div style={{ color: "#e8f5e9", fontWeight: 800, fontSize: 18, marginBottom: 4 }}>Confirm Diagnosis</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 20 }}>
              Predicted: <span style={{ color: "#00e676" }}>{result.classification.disease_label}</span>
              {" "}({Math.round(result.classification.confidence * 100)}%)
            </div>

            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, marginBottom: 14 }}>Is this diagnosis correct?</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <button onClick={() => setWasCorrect(true)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `2px solid ${wasCorrect === true ? "#00e676" : "rgba(255,255,255,0.1)"}`, background: wasCorrect === true ? "rgba(0,230,118,0.12)" : "rgba(255,255,255,0.04)", color: wasCorrect === true ? "#00e676" : "rgba(255,255,255,0.6)", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
                ✓ Yes, correct
              </button>
              <button onClick={() => setWasCorrect(false)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `2px solid ${wasCorrect === false ? "#f44336" : "rgba(255,255,255,0.1)"}`, background: wasCorrect === false ? "rgba(244,67,54,0.12)" : "rgba(255,255,255,0.04)", color: wasCorrect === false ? "#f44336" : "rgba(255,255,255,0.6)", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
                ✗ No, wrong
              </button>
            </div>

            {wasCorrect === false && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginBottom: 8 }}>Enter correct diagnosis (e.g. Tomato___Late_blight):</div>
                <input
                  value={correction}
                  onChange={e => setCorrection(e.target.value)}
                  placeholder="Plant___Disease_name"
                  style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "10px 14px", color: "#e8f5e9", fontSize: 14, boxSizing: "border-box" }}
                />
              </div>
            )}

            {wasCorrect !== null && (
              <button
                onClick={submit}
                disabled={submitting || (wasCorrect === false && !correction.trim())}
                style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: submitting ? "rgba(255,171,64,0.2)" : "rgba(255,171,64,0.85)", color: "#0d1a0d", fontWeight: 800, fontSize: 15, cursor: submitting ? "not-allowed" : "pointer" }}
              >
                {submitting ? "Saving…" : "Save to Training Dataset"}
              </button>
            )}

            <button onClick={onClose} style={{ width: "100%", marginTop: 10, padding: "10px 0", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 13 }}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}

const MODE_META = {
  edge:   { icon: "📱", color: "#00e676", label: "Edge AI",   desc: "On-device · Offline · Fast" },
  hybrid: { icon: "🔀", color: "#ab47bc", label: "Hybrid",    desc: "Edge classify + Cloud segment" },
  cloud:  { icon: "☁️", color: "#42a5f5", label: "Cloud AI",  desc: "Full server GPU inference" },
};

function StatCard({ modeKey, stats }) {
  const meta = MODE_META[modeKey];
  const avg_latency = stats.count > 0 ? Math.round(stats.totalLatency / stats.count) : null;
  const avg_conf    = stats.count > 0 ? Math.round((stats.totalConfidence / stats.count) * 100) : null;

  return (
    <div className="stat-card" style={{ "--mode-color": meta.color }}>
      <div className="stat-card-header">
        <span className="stat-icon">{meta.icon}</span>
        <span className="stat-mode-name">{meta.label}</span>
      </div>
      <p className="stat-mode-desc">{meta.desc}</p>
      <div className="stat-numbers">
        <div className="stat-num">
          <span className="stat-val">{stats.count}</span>
          <span className="stat-key">scans</span>
        </div>
        <div className="stat-num">
          <span className="stat-val">{avg_latency !== null ? `${avg_latency}ms` : "—"}</span>
          <span className="stat-key">avg latency</span>
        </div>
        <div className="stat-num">
          <span className="stat-val">{avg_conf !== null ? `${avg_conf}%` : "—"}</span>
          <span className="stat-key">avg confidence</span>
        </div>
      </div>
      {stats.count === 0 && <div className="stat-empty">No scans yet</div>}
    </div>
  );
}

export default function Home({ serverUp, sessionStats, onScanResult }) {
  const [mode, setMode]       = useState(serverUp ? "cloud" : "edge");
  const [preview, setPreview] = useState(null);
  const [file, setFile]       = useState(null);
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [benchmarks, setBenchmarks] = useState([]);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleImage = useCallback((f, previewUrl) => {
    setFile(f);
    setPreview(previewUrl);
    setResult(null);
    setError(null);
    setShowConfirm(false);
  }, []);

  const handleDiagnose = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const data = await diagnoseImage(file, mode);
      setResult(data);
      const latency = data.inference_meta?.latency_ms ?? 0;
      const confidence = data.classification?.confidence ?? 0;
      onScanResult(mode, latency, confidence);
      setBenchmarks((prev) => [
        ...prev,
        {
          mode,
          latency_ms: latency,
          client_latency_ms: data._client_latency_ms,
          disease: data.classification.disease_label,
          confidence,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadBenchmarks = () => {
    const csv = [
      "mode,latency_ms,client_latency_ms,disease,confidence,timestamp",
      ...benchmarks.map((b) =>
        `${b.mode},${b.latency_ms},${b.client_latency_ms},${b.disease},${b.confidence},${b.timestamp}`
      ),
    ].join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = "plantsight_benchmarks.csv";
    a.click();
  };

  return (
    <div className="home-page">
      {showConfirm && result && (
        <ConfirmModal result={result} imageFile={file} onClose={() => setShowConfirm(false)} />
      )}

      {/* ── Hero ─────────────────────────────────── */}
      <section className="hero">
        <div className="hero-content">
          <div className="hero-tag">Master's Thesis · AI Research</div>
          <h2 className="hero-title">
            Detect Plant Disease<br />
            with <span className="hero-green">AI Precision</span>
          </h2>
          <p className="hero-sub">
            Upload a leaf photo and get instant diagnosis using Edge, Hybrid,
            or Cloud inference — with visual disease segmentation.
          </p>
        </div>
        <div className="hero-visual">
          <div className="hero-ring hero-ring-1" />
          <div className="hero-ring hero-ring-2" />
          <div className="hero-ring hero-ring-3" />
          <div className="hero-center">🌿</div>
          <div className="hero-scan-line" />
        </div>
      </section>

      {/* ── Mode Stats ───────────────────────────── */}
      <section className="mode-stats-row">
        {Object.entries(sessionStats).map(([key, stats]) => (
          <StatCard key={key} modeKey={key} stats={stats} />
        ))}
      </section>

      {/* ── Scan Section ─────────────────────────── */}
      <section className="scan-section">
        <div className="scan-left">
          <ModeSelector mode={mode} onChange={setMode} serverUp={serverUp} />
          <ImageUpload onImage={handleImage} />

          {preview && (
            <div className="preview-container">
              <img src={preview} alt="Selected plant" className="preview-img" />
              {result?.segmentation?.mask_base64 && (
                <SegmentationOverlay maskBase64={result.segmentation.mask_base64} />
              )}
              {result?.segmentation && (
                <div className="infected-badge">
                  🔴 {result.segmentation.infected_area_pct}% infected
                </div>
              )}
            </div>
          )}

          {file && !loading && (
            <button className="btn-diagnose" onClick={handleDiagnose}>
              🔍 Diagnose Plant
            </button>
          )}

          {loading && (
            <div className="loading-box">
              <div className="spinner" />
              <p>Analysing with <strong>{mode}</strong> mode…</p>
            </div>
          )}

          {error && <div className="error-box">⚠ {error}</div>}

          {benchmarks.length > 0 && (
            <button className="btn-secondary" onClick={downloadBenchmarks}>
              📊 Export {benchmarks.length} benchmark(s) to CSV
            </button>
          )}
        </div>

        <div className="scan-right">
          {result ? (
            <>
              <ResultCard result={result} />
              <TreatmentPanel treatment={result.treatment} />
              <div style={{
                marginTop: 12, background: "rgba(255,171,64,0.05)",
                border: "1px solid rgba(255,171,64,0.2)",
                borderRadius: 16, padding: "14px 18px",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ background: "rgba(255,171,64,0.15)", borderRadius: 8, padding: "6px 8px", fontSize: 10, fontWeight: 900, color: "#ffab40", letterSpacing: 0.5 }}>DB</div>
                  <div>
                    <div style={{ color: "#ffab40", fontWeight: 700, fontSize: 13 }}>Was this diagnosis correct?</div>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 2 }}>Help improve the AI model</div>
                  </div>
                </div>
                <button onClick={() => setShowConfirm(true)} style={{
                  padding: "8px 16px", borderRadius: 10, border: "1.5px solid rgba(255,171,64,0.4)",
                  background: "rgba(255,171,64,0.12)", color: "#ffab40",
                  fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
                }}>
                  Confirm
                </button>
              </div>
            </>
          ) : (
            <div className="placeholder">
              <span className="placeholder-icon">🌱</span>
              <p>Upload a plant photo to get started</p>
              <p className="placeholder-sub">
                Supports tomato, potato, corn, grape, apple, pepper and more
              </p>
            </div>
          )}
        </div>
      </section>

    </div>
  );
}
