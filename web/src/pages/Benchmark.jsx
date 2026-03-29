import { useState, useCallback } from "react";
import ImageUpload from "../components/ImageUpload";
import SegmentationOverlay from "../components/SegmentationOverlay";
import { diagnoseImage } from "../api/plantApi";

const MODES = [
  { key: "edge",   label: "Edge AI",  icon: "📱", color: "#00e676", desc: "TFLite INT8 · On-device" },
  { key: "hybrid", label: "Hybrid",   icon: "🔀", color: "#ab47bc", desc: "Edge classify + Cloud SAM" },
  { key: "cloud",  label: "Cloud AI", icon: "☁️", color: "#42a5f5", desc: "EfficientNet-B0 + SAM ViT-B" },
];

function ModeResult({ mode, result, loading, error }) {
  const cfg = MODES.find((m) => m.key === mode);
  return (
    <div className="bm-col" style={{ "--mode-col": cfg.color }}>
      <div className="bm-col-header">
        <span className="bm-col-icon">{cfg.icon}</span>
        <div>
          <div className="bm-col-name">{cfg.label}</div>
          <div className="bm-col-desc">{cfg.desc}</div>
        </div>
      </div>

      {loading && (
        <div className="bm-state">
          <div className="spinner bm-spinner" style={{ borderTopColor: cfg.color }} />
          <p>Running inference…</p>
        </div>
      )}

      {error && !loading && (
        <div className="bm-state bm-error">
          <span>⚠</span>
          <p>{error}</p>
        </div>
      )}

      {result && !loading && (
        <div className="bm-result">
          {/* Latency badge */}
          <div className="bm-latency" style={{ color: cfg.color, borderColor: `${cfg.color}44` }}>
            ⏱ {result.inference_meta?.latency_ms ?? "?"}ms server · {result._client_latency_ms ?? "?"}ms total
          </div>

          {/* Confidence */}
          <div className="bm-conf-row">
            <span className="bm-conf-label">Confidence</span>
            <div className="bm-conf-bar">
              <div
                className="bm-conf-fill"
                style={{
                  width: `${(result.classification?.confidence ?? 0) * 100}%`,
                  background: cfg.color,
                }}
              />
            </div>
            <span className="bm-conf-pct" style={{ color: cfg.color }}>
              {Math.round((result.classification?.confidence ?? 0) * 100)}%
            </span>
          </div>

          {/* Disease */}
          <div className="bm-disease">
            {result.classification?.disease_label ?? "Unknown"}
          </div>
          <div className="bm-plant">
            {result.classification?.plant_name}
          </div>

          {/* Segmentation */}
          {result.segmentation && (
            <div className="bm-seg-info" style={{ borderColor: `${cfg.color}33` }}>
              <span>🔴 {result.segmentation.infected_area_pct}% infected area</span>
              <span>{result.segmentation.model}</span>
            </div>
          )}

          {/* Top 3 */}
          <div className="bm-top3">
            {result.classification?.top3?.map((item, i) => (
              <div key={i} className={`bm-top3-item ${i === 0 ? "bm-top3-best" : ""}`}
                style={i === 0 ? { color: cfg.color, borderColor: `${cfg.color}55`, background: `${cfg.color}11` } : {}}>
                {item.label} · {Math.round(item.confidence * 100)}%
              </div>
            ))}
          </div>
        </div>
      )}

      {!result && !loading && !error && (
        <div className="bm-state bm-empty">
          <p>Waiting to run…</p>
        </div>
      )}
    </div>
  );
}

export default function Benchmark({ serverUp, onScanResult }) {
  const [file, setFile]       = useState(null);
  const [preview, setPreview] = useState(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState({ edge: null, hybrid: null, cloud: null });
  const [loadings, setLoadings] = useState({ edge: false, hybrid: false, cloud: false });
  const [errors, setErrors]   = useState({ edge: null, hybrid: null, cloud: null });
  const [runs, setRuns]       = useState([]);

  const handleImage = useCallback((f, previewUrl) => {
    setFile(f);
    setPreview(previewUrl);
    setResults({ edge: null, hybrid: null, cloud: null });
    setErrors({ edge: null, hybrid: null, cloud: null });
  }, []);

  const runBenchmark = async () => {
    if (!file) return;
    setRunning(true);
    setResults({ edge: null, hybrid: null, cloud: null });
    setErrors({ edge: null, hybrid: null, cloud: null });
    setLoadings({ edge: true, hybrid: true, cloud: true });

    const runMode = async (mode) => {
      try {
        const data = await diagnoseImage(file, mode);
        setResults((prev) => ({ ...prev, [mode]: data }));
        setLoadings((prev) => ({ ...prev, [mode]: false }));
        const latency = data.inference_meta?.latency_ms ?? 0;
        const conf    = data.classification?.confidence ?? 0;
        onScanResult(mode, latency, conf);
        return { mode, latency, conf, disease: data.classification?.disease_label };
      } catch (e) {
        setErrors((prev) => ({ ...prev, [mode]: e.message }));
        setLoadings((prev) => ({ ...prev, [mode]: false }));
        return null;
      }
    };

    const allResults = await Promise.all(["edge", "hybrid", "cloud"].map(runMode));
    const successful = allResults.filter(Boolean);
    if (successful.length > 0) {
      setRuns((prev) => [
        {
          id: Date.now(),
          timestamp: new Date().toLocaleTimeString(),
          results: successful,
        },
        ...prev,
      ]);
    }
    setRunning(false);
  };

  const downloadCSV = () => {
    const rows = [];
    runs.forEach((run) => {
      run.results.forEach((r) => {
        rows.push(`${run.timestamp},${r.mode},${r.latency},${Math.round(r.conf * 100)}%,${r.disease}`);
      });
    });
    const csv = ["timestamp,mode,latency_ms,confidence,disease", ...rows].join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = "plantsight_benchmark_runs.csv";
    a.click();
  };

  const hasAnyResult = Object.values(results).some(Boolean);

  return (
    <div className="benchmark-page">
      <div className="page-header">
        <h2 className="page-title">⚡ Benchmark Mode</h2>
        <p className="page-sub">Run the same image through all 3 inference modes simultaneously and compare results side by side</p>
      </div>

      {/* ── Upload + Controls ──────────────────── */}
      <div className="bm-controls">
        <div className="bm-upload">
          {preview ? (
            <div className="bm-preview-wrap">
              <img src={preview} alt="Selected" className="bm-preview-img" />
              <button className="bm-change-btn" onClick={() => { setFile(null); setPreview(null); }}>
                Change image
              </button>
            </div>
          ) : (
            <ImageUpload onImage={handleImage} />
          )}
        </div>

        <div className="bm-action">
          <div className="bm-modes-preview">
            {MODES.map((m) => (
              <div key={m.key} className="bm-mode-pill" style={{ color: m.color, borderColor: `${m.color}44` }}>
                {m.icon} {m.label}
              </div>
            ))}
          </div>
          <button
            className="btn-diagnose bm-run-btn"
            onClick={runBenchmark}
            disabled={!file || running}
          >
            {running ? "⏳ Running all 3 modes…" : "⚡ Run Full Benchmark"}
          </button>
          {!serverUp && (
            <p className="bm-warn">⚠ Server offline — Edge mode only works locally</p>
          )}
          {runs.length > 0 && (
            <button className="btn-secondary" onClick={downloadCSV} style={{ marginTop: 8 }}>
              📥 Export {runs.length} run(s) to CSV
            </button>
          )}
        </div>
      </div>

      {/* ── Side-by-side Results ──────────────── */}
      <div className="bm-results-grid">
        {MODES.map((m) => (
          <ModeResult
            key={m.key}
            mode={m.key}
            result={results[m.key]}
            loading={loadings[m.key]}
            error={errors[m.key]}
          />
        ))}
      </div>

      {/* ── Comparison summary ────────────────── */}
      {hasAnyResult && (() => {
        const filled = MODES.map((m) => results[m.key]).filter(Boolean);
        const fastest = filled.reduce((a, b) =>
          (a.inference_meta?.latency_ms ?? 9999) < (b.inference_meta?.latency_ms ?? 9999) ? a : b
        );
        const mostConf = filled.reduce((a, b) =>
          (a.classification?.confidence ?? 0) > (b.classification?.confidence ?? 0) ? a : b
        );
        return (
          <div className="bm-summary">
            <div className="bm-summary-item">
              <span className="bm-summary-label">⚡ Fastest</span>
              <span className="bm-summary-val">{fastest.inference_meta?.mode?.toUpperCase()} · {fastest.inference_meta?.latency_ms}ms</span>
            </div>
            <div className="bm-summary-item">
              <span className="bm-summary-label">🎯 Most Confident</span>
              <span className="bm-summary-val">{mostConf.inference_meta?.mode?.toUpperCase()} · {Math.round((mostConf.classification?.confidence ?? 0) * 100)}%</span>
            </div>
            <div className="bm-summary-item">
              <span className="bm-summary-label">🔢 Total Runs</span>
              <span className="bm-summary-val">{runs.length} benchmark(s)</span>
            </div>
          </div>
        );
      })()}

      {/* ── Run history ───────────────────────── */}
      {runs.length > 0 && (
        <div className="bm-history">
          <h4>Run History</h4>
          <table className="db-table">
            <thead>
              <tr><th>Time</th><th>Mode</th><th>Latency</th><th>Confidence</th><th>Disease</th></tr>
            </thead>
            <tbody>
              {runs.flatMap((run) =>
                run.results.map((r, i) => {
                  const cfg = MODES.find((m) => m.key === r.mode);
                  return (
                    <tr key={`${run.id}-${i}`}>
                      <td>{run.timestamp}</td>
                      <td>
                        <span style={{ color: cfg.color }}>{cfg.icon} {cfg.label}</span>
                      </td>
                      <td>{r.latency}ms</td>
                      <td>{Math.round(r.conf * 100)}%</td>
                      <td>{r.disease}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
