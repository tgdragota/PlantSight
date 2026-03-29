const SEVERITY_COLOR = {
  healthy: "#4caf50",
  mild: "#ff9800",
  moderate: "#f44336",
  severe: "#9c0000",
};

const MODE_COLOR = { cloud: "#1a3c78", hybrid: "#6a0dad", edge: "#27ae60" };

export default function ResultCard({ result }) {
  const { classification: c, inference_meta: m, segmentation: s } = result;
  const color = SEVERITY_COLOR[c.severity] || "#999";

  return (
    <div className="result-card" style={{ borderTop: `4px solid ${color}` }}>
      {/* Header */}
      <div className="result-header">
        <div>
          <span className="result-plant">🌱 {c.plant}</span>
          <h2 className="result-disease">{c.disease_label}</h2>
        </div>
        <span
          className="severity-badge"
          style={{ backgroundColor: color }}
        >
          {c.severity.toUpperCase()}
        </span>
      </div>

      {/* Confidence bar */}
      <div className="confidence-row">
        <span>Confidence</span>
        <div className="confidence-bar">
          <div
            className="confidence-fill"
            style={{ width: `${c.confidence * 100}%`, backgroundColor: color }}
          />
        </div>
        <span className="confidence-pct">{Math.round(c.confidence * 100)}%</span>
      </div>

      {/* Top-3 */}
      <div className="top3">
        {c.top3.map((t, i) => (
          <span
            key={i}
            className={`top3-item ${i === 0 ? "top3-best" : ""}`}
          >
            {t.label}{" "}
            <small>({Math.round(t.confidence * 100)}%)</small>
          </span>
        ))}
      </div>

      {/* Segmentation info */}
      {s && (
        <div className="seg-info">
          <span>🔴 Infected area: <strong>{s.infected_area_pct}%</strong></span>
          <span className="seg-model">{s.model_used}</span>
        </div>
      )}

      {/* Inference meta */}
      <div className="inference-meta">
        <span
          className="mode-badge"
          style={{ backgroundColor: MODE_COLOR[m.mode] || "#555" }}
        >
          {m.mode}
        </span>
        <span>⏱ {m.latency_ms}ms server</span>
        {result._client_latency_ms && (
          <span>({result._client_latency_ms}ms round-trip)</span>
        )}
        <span className="model-name">{c.model_used}</span>
      </div>
    </div>
  );
}
