const MODE_CFG = {
  edge:   { label: "Edge AI",  color: "#00e676", icon: "📱" },
  hybrid: { label: "Hybrid",   color: "#ab47bc", icon: "🔀" },
  cloud:  { label: "Cloud AI", color: "#42a5f5", icon: "☁️" },
};

function BarChart({ title, rows, unit = "" }) {
  const maxVal = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="db-chart">
      <h4 className="db-chart-title">{title}</h4>
      <div className="db-chart-rows">
        {rows.map((row) => (
          <div className="db-bar-row" key={row.key}>
            <span className="db-bar-mode">
              {MODE_CFG[row.key].icon} {MODE_CFG[row.key].label}
            </span>
            <div className="db-bar-track">
              <div
                className="db-bar-fill"
                style={{
                  width: `${(row.value / maxVal) * 100}%`,
                  background: MODE_CFG[row.key].color,
                  boxShadow: `0 0 12px ${MODE_CFG[row.key].color}55`,
                }}
              />
            </div>
            <span className="db-bar-val" style={{ color: MODE_CFG[row.key].color }}>
              {row.value > 0 ? `${row.value}${unit}` : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricTile({ icon, label, value, sub }) {
  return (
    <div className="db-tile">
      <span className="db-tile-icon">{icon}</span>
      <div>
        <div className="db-tile-value">{value}</div>
        <div className="db-tile-label">{label}</div>
        {sub && <div className="db-tile-sub">{sub}</div>}
      </div>
    </div>
  );
}

export default function Dashboard({ sessionStats }) {
  const modes = ["edge", "hybrid", "cloud"];

  const totalScans     = modes.reduce((s, m) => s + sessionStats[m].count, 0);
  const fastestMode    = modes.reduce((best, m) => {
    if (sessionStats[m].count === 0) return best;
    const avg = sessionStats[m].totalLatency / sessionStats[m].count;
    if (!best || avg < best.avg) return { key: m, avg };
    return best;
  }, null);
  const mostUsedMode   = modes.reduce((best, m) =>
    sessionStats[m].count > (sessionStats[best]?.count ?? -1) ? m : best, "edge");

  const latencyRows    = modes.map((m) => ({
    key: m,
    value: sessionStats[m].count > 0
      ? Math.round(sessionStats[m].totalLatency / sessionStats[m].count) : 0,
  }));
  const confidenceRows = modes.map((m) => ({
    key: m,
    value: sessionStats[m].count > 0
      ? Math.round((sessionStats[m].totalConfidence / sessionStats[m].count) * 100) : 0,
  }));
  const countRows      = modes.map((m) => ({
    key: m,
    value: sessionStats[m].count,
  }));

  const hasData = totalScans > 0;

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h2 className="page-title">📊 Inference Dashboard</h2>
        <p className="page-sub">Real-time comparison of Edge · Hybrid · Cloud performance for this session</p>
      </div>

      {/* ── Summary tiles ─────────────────────── */}
      <div className="db-tiles">
        <MetricTile icon="🔍" label="Total Scans" value={totalScans} sub="this session" />
        <MetricTile
          icon="⚡"
          label="Fastest Mode"
          value={fastestMode ? MODE_CFG[fastestMode.key].label : "—"}
          sub={fastestMode ? `avg ${Math.round(fastestMode.avg)}ms` : "run a scan first"}
        />
        <MetricTile
          icon="🏆"
          label="Most Used"
          value={totalScans > 0 ? MODE_CFG[mostUsedMode].label : "—"}
          sub={totalScans > 0 ? `${sessionStats[mostUsedMode].count} scans` : "run a scan first"}
        />
        <MetricTile
          icon="📱"
          label="Edge Scans"
          value={sessionStats.edge.count}
          sub={sessionStats.edge.count > 0
            ? `avg ${Math.round(sessionStats.edge.totalLatency / sessionStats.edge.count)}ms`
            : "no data"}
        />
        <MetricTile
          icon="☁️"
          label="Cloud Scans"
          value={sessionStats.cloud.count}
          sub={sessionStats.cloud.count > 0
            ? `avg ${Math.round(sessionStats.cloud.totalLatency / sessionStats.cloud.count)}ms`
            : "no data"}
        />
        <MetricTile
          icon="🔀"
          label="Hybrid Scans"
          value={sessionStats.hybrid.count}
          sub={sessionStats.hybrid.count > 0
            ? `avg ${Math.round(sessionStats.hybrid.totalLatency / sessionStats.hybrid.count)}ms`
            : "no data"}
        />
      </div>

      {/* ── Charts ────────────────────────────── */}
      {hasData ? (
        <div className="db-charts-grid">
          <BarChart title="⏱ Average Inference Latency" rows={latencyRows} unit="ms" />
          <BarChart title="🎯 Average Confidence Score"  rows={confidenceRows} unit="%" />
          <BarChart title="🔢 Scans per Mode"            rows={countRows} unit="" />
        </div>
      ) : (
        <div className="db-empty">
          <span className="db-empty-icon">📈</span>
          <h3>No data yet</h3>
          <p>Run some diagnoses on the <strong>Diagnose</strong> or <strong>Benchmark</strong> page to see live charts here.</p>
        </div>
      )}

      {/* ── Per-mode detail table ─────────────── */}
      <div className="db-table-wrap">
        <h4 className="db-table-title">Detailed Mode Comparison</h4>
        <table className="db-table">
          <thead>
            <tr>
              <th>Mode</th>
              <th>Scans</th>
              <th>Avg Latency</th>
              <th>Avg Confidence</th>
              <th>Total Latency</th>
              <th>Architecture</th>
            </tr>
          </thead>
          <tbody>
            {modes.map((m) => {
              const s = sessionStats[m];
              const avg_lat = s.count > 0 ? Math.round(s.totalLatency / s.count) : null;
              const avg_con = s.count > 0 ? Math.round((s.totalConfidence / s.count) * 100) : null;
              const archs = {
                edge:   "TFLite INT8 · On-device",
                hybrid: "Edge classify + SAM segment",
                cloud:  "EfficientNet-B0 + SAM ViT-B",
              };
              return (
                <tr key={m}>
                  <td>
                    <span className="db-mode-pill" style={{ background: `${MODE_CFG[m].color}22`, color: MODE_CFG[m].color, border: `1px solid ${MODE_CFG[m].color}44` }}>
                      {MODE_CFG[m].icon} {MODE_CFG[m].label}
                    </span>
                  </td>
                  <td>{s.count}</td>
                  <td>{avg_lat !== null ? `${avg_lat} ms` : "—"}</td>
                  <td>{avg_con !== null ? `${avg_con}%` : "—"}</td>
                  <td>{s.count > 0 ? `${Math.round(s.totalLatency)} ms` : "—"}</td>
                  <td className="db-arch">{archs[m]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="db-note">
        💡 Data resets each browser session. Use the <strong>Benchmark</strong> page to run controlled experiments and export CSV for your thesis.
      </p>
    </div>
  );
}
