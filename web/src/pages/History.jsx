import { useState, useEffect } from "react";
import { getHistory } from "../api/plantApi";

const SEVERITY_COLOR = {
  healthy: "#4caf50",
  mild: "#ff9800",
  moderate: "#f44336",
  severe: "#9c0000",
};

export default function History() {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
    <div className="history">
      <h2>Scan History ({scans.length})</h2>
      <div className="history-grid">
        {scans.map((scan) => (
          <div key={scan.id} className="history-card">
            <div
              className="history-card-header"
              style={{ borderLeft: `4px solid ${SEVERITY_COLOR[scan.severity] || "#999"}` }}
            >
              <span className="history-plant">{scan.plant}</span>
              <span
                className="history-severity"
                style={{ color: SEVERITY_COLOR[scan.severity] }}
              >
                {scan.severity.toUpperCase()}
              </span>
            </div>
            <p className="history-disease">{scan.disease_label}</p>
            <div className="history-meta">
              <span>Confidence: {Math.round(scan.confidence * 100)}%</span>
              <span
                className={`mode-badge mode-badge--${scan.mode}`}
              >
                {scan.mode}
              </span>
              <span>{scan.latency_ms}ms</span>
            </div>
            <p className="history-date">
              {new Date(scan.timestamp).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
