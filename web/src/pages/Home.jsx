import { useState, useCallback } from "react";
import ModeSelector from "../components/ModeSelector";
import ImageUpload from "../components/ImageUpload";
import ResultCard from "../components/ResultCard";
import SegmentationOverlay from "../components/SegmentationOverlay";
import TreatmentPanel from "../components/TreatmentPanel";
import { diagnoseImage } from "../api/plantApi";

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

  const handleImage = useCallback((f, previewUrl) => {
    setFile(f);
    setPreview(previewUrl);
    setResult(null);
    setError(null);
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
