import { useState, useEffect } from "react";
import { getHistory } from "../api/plantApi";

const SEVERITY_COLOR = {
  healthy:  "#4caf50",
  mild:     "#ff9800",
  moderate: "#f44336",
  severe:   "#9c0000",
};

const MODE_LABEL = { edge: "EDGE", hybrid: "HYBRID", cloud: "CLOUD" };

function ScanModal({ scan, onClose }) {
  if (!scan) return null;
  const conf = Math.round(scan.confidence * 100);
  const t = scan.treatment || {};

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#0d1a0d", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 16, padding: 24, maxWidth: 600, width: "100%",
          maxHeight: "85vh", overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
              {scan.plant}
            </div>
            <div style={{ color: "#e8f5e9", fontSize: 22, fontWeight: 800, marginTop: 2 }}>
              {scan.disease_label}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#e8f5e9", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 16 }}
          >✕</button>
        </div>

        {/* Image */}
        {scan.image_b64 && (
          <div style={{ marginBottom: 16, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
            <img
              src={`data:image/jpeg;base64,${scan.image_b64}`}
              alt="plant scan"
              style={{ width: "100%", maxHeight: 260, objectFit: "cover", display: "block" }}
            />
          </div>
        )}

        {/* Confidence bar */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Confidence</span>
            <span style={{ color: SEVERITY_COLOR[scan.severity] || "#00e676", fontWeight: 700 }}>{conf}%</span>
          </div>
          <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 4, height: 6 }}>
            <div style={{ width: `${Math.min(conf, 100)}%`, height: "100%", borderRadius: 4, background: SEVERITY_COLOR[scan.severity] || "#00e676" }} />
          </div>
        </div>

        {/* Top 3 */}
        {scan.top3 && scan.top3.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" }}>Top Predictions</div>
            {scan.top3.map((p, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <span style={{ color: i === 0 ? "#00e676" : "rgba(255,255,255,0.5)", fontSize: 13 }}>#{i + 1} {p.label}</span>
                <span style={{ color: i === 0 ? "#00e676" : "rgba(255,255,255,0.4)", fontSize: 13, fontWeight: 700 }}>{Math.round(p.confidence * 100)}%</span>
              </div>
            ))}
          </div>
        )}

        {/* Meta */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <span style={{ background: "rgba(255,255,255,0.07)", borderRadius: 8, padding: "4px 10px", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
            {MODE_LABEL[scan.mode] || scan.mode}
          </span>
          <span style={{ background: "rgba(255,255,255,0.07)", borderRadius: 8, padding: "4px 10px", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
            {scan.latency_ms}ms
          </span>
          {scan.infected_area != null && (
            <span style={{ background: "rgba(244,67,54,0.15)", borderRadius: 8, padding: "4px 10px", fontSize: 12, color: "#f44336" }}>
              🔴 {scan.infected_area}% infected
            </span>
          )}
          <span style={{ background: `${SEVERITY_COLOR[scan.severity]}22`, borderRadius: 8, padding: "4px 10px", fontSize: 12, color: SEVERITY_COLOR[scan.severity] }}>
            {scan.severity?.toUpperCase()}
          </span>
        </div>

        {/* Treatment */}
        {t.cause && (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 16 }}>
            <div style={{ color: "#e8f5e9", fontWeight: 700, fontSize: 14, marginBottom: 12 }}>🌿 Treatment Plan</div>
            {t.cause && (
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>Cause</span>
                <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, margin: "4px 0 0" }}>{t.cause}</p>
              </div>
            )}
            {t.immediate && (
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>Symptoms</span>
                <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, margin: "4px 0 0" }}>{t.immediate}</p>
              </div>
            )}
            {t.organic && (
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: "#4caf50", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>🌱 Organic</span>
                <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, margin: "4px 0 0", whiteSpace: "pre-line" }}>{t.organic}</p>
              </div>
            )}
            {t.chemical && (
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: "#42a5f5", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>💊 Chemical</span>
                <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, margin: "4px 0 0", whiteSpace: "pre-line" }}>{t.chemical}</p>
              </div>
            )}
            {t.prevention && (
              <div>
                <span style={{ color: "#ab47bc", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>🛡 Prevention</span>
                <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, margin: "4px 0 0", whiteSpace: "pre-line" }}>{t.prevention}</p>
              </div>
            )}
          </div>
        )}

        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 16, textAlign: "right" }}>
          {new Date(scan.timestamp).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

export default function History() {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    getHistory(50)
      .then((data) => setScans(data.scans || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-box"><div className="spinner" /><p>Loading history...</p></div>;
  if (error)   return <div className="error-box">⚠ {error}</div>;
  if (!scans.length) return <div className="placeholder"><p>No scans yet. Diagnose a plant first!</p></div>;

  return (
    <>
      <ScanModal scan={selected} onClose={() => setSelected(null)} />
      <div className="history">
        <h2>Scan History ({scans.length})</h2>
        <div className="history-grid">
          {scans.map((scan) => (
            <div
              key={scan.id}
              className="history-card"
              onClick={() => setSelected(scan)}
              style={{ cursor: "pointer" }}
            >
              <div
                className="history-card-header"
                style={{ borderLeft: `4px solid ${SEVERITY_COLOR[scan.severity] || "#999"}` }}
              >
                <span className="history-plant">{scan.plant}</span>
                <span className="history-severity" style={{ color: SEVERITY_COLOR[scan.severity] }}>
                  {scan.severity.toUpperCase()}
                </span>
              </div>
              <p className="history-disease">{scan.disease_label}</p>
              <div className="history-meta">
                <span>Confidence: {Math.round(scan.confidence * 100)}%</span>
                <span className={`mode-badge mode-badge--${scan.mode}`}>{scan.mode}</span>
                <span>{scan.latency_ms}ms</span>
              </div>
              <p className="history-date">{new Date(scan.timestamp).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
