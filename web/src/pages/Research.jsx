import { useState, useEffect } from "react";

const API_BASE = import.meta?.env?.VITE_API_URL ?? "";

const MODE_COLOR = { edge: "#00e676", hybrid: "#ab47bc", cloud: "#42a5f5" };
const MODE_LABEL = { edge: "Edge AI", hybrid: "Hybrid AI", cloud: "Cloud AI" };
const TABS = ["Overview", "Accuracy", "Latency", "Live"];

function StatCard({ val, label, sub, color = "#00e676" }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12, padding: "18px 14px", textAlign: "center", flex: 1, minWidth: 120,
    }}>
      <div style={{ fontSize: 26, fontWeight: 900, color, marginBottom: 4 }}>{val ?? "—"}</div>
      <div style={{ fontSize: 11, color: "#e8f5e9", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "rgba(232,245,233,0.4)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function HBar({ label, value, color = "#00e676" }) {
  const pct = Math.max(0, Math.min(100, ((value - 96) / 4) * 100));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <div style={{ width: 200, fontSize: 12, color: "rgba(232,245,233,0.7)", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.6s ease" }} />
      </div>
      <div style={{ width: 52, fontSize: 12, fontWeight: 700, color, textAlign: "right" }}>{value?.toFixed(1)}%</div>
    </div>
  );
}

function LatBar({ label, p50, p95, maxMs, color }) {
  const p50pct = Math.round((p50 / maxMs) * 100);
  const p95pct = Math.round((p95 / maxMs) * 100);
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 8 }}>{label}</div>
      {[{ key: "P50", val: p50, pct: p50pct, opacity: 1 }, { key: "P95", val: p95, pct: p95pct, opacity: 0.5 }].map(({ key, val, pct, opacity }) => (
        <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 32, fontSize: 11, color: "rgba(232,245,233,0.4)", fontWeight: 700 }}>{key}</div>
          <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: color, opacity, borderRadius: 4, transition: "width 0.6s ease" }} />
          </div>
          <div style={{ width: 64, fontSize: 12, fontWeight: 700, color: key === "P50" ? color : "rgba(232,245,233,0.45)", textAlign: "right" }}>{val}ms</div>
        </div>
      ))}
    </div>
  );
}

export default function Research() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState("Overview");

  useEffect(() => {
    fetch(`${API_BASE}/api/research`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const cls  = data?.classifier     || {};
  const pc   = data?.per_class      || [];
  const lat  = data?.latency_targets || {};
  const live = data?.live_latency   || {};
  const ds   = data?.dataset        || {};
  const tfl  = data?.tflite         || {};

  const maxLat = Math.max(...Object.values(lat).map((v) => v?.p95_ms || 0)) * 1.1 || 1500;
  const liveEntries = Object.entries(live).filter(([, v]) => v && v.count > 0);

  const card = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 20, marginBottom: 16 };
  const sectionTitle = { fontSize: 13, fontWeight: 800, color: "#e8f5e9", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14, marginTop: 8 };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px", color: "#e8f5e9", fontFamily: "system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: "#00e676", margin: 0, marginBottom: 4 }}>Research Metrics</h1>
        <p style={{ color: "rgba(232,245,233,0.45)", fontSize: 13, margin: 0 }}>Master's Thesis · Edge vs Hybrid vs Cloud AI Comparison</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 24, background: "rgba(255,255,255,0.04)", padding: 6, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
            background: tab === t ? "#00e676" : "transparent",
            color: tab === t ? "#080d08" : "rgba(232,245,233,0.5)",
            fontWeight: 800, fontSize: 13, transition: "all 0.2s",
          }}>{t}</button>
        ))}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 60, color: "rgba(232,245,233,0.4)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <p>Loading metrics…</p>
        </div>
      )}

      {!loading && !data && (
        <div style={{ textAlign: "center", padding: 60 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <p style={{ color: "#ff5252", fontWeight: 700 }}>Could not load research data</p>
          <p style={{ color: "rgba(232,245,233,0.4)", fontSize: 13 }}>Make sure the backend is running</p>
        </div>
      )}

      {!loading && data && (
        <>
          {/* ── OVERVIEW ── */}
          {tab === "Overview" && (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                <StatCard val={`${cls.val_top1_acc}%`}  label="Val Top-1"  sub="EfficientNet-B0"  color="#00e676" />
                <StatCard val={`${cls.test_top1_acc}%`} label="Test Top-1" sub="Held-out set"      color="#00e676" />
                <StatCard val={cls.f1_macro?.toFixed(4)} label="F1 Macro"  sub="38 classes"        color="#42a5f5" />
                <StatCard val={ds.total_images?.toLocaleString()} label="Images" sub="PlantVillage" color="#ab47bc" />
                <StatCard val={`${ds.num_classes}`}     label="Classes"    sub={ds.crops}           color="#ff9800" />
                <StatCard val={`${tfl.size_mb} MB`}     label="TFLite"     sub={tfl.format}         color="#ff5252" />
              </div>

              <p style={sectionTitle}>Architecture Comparison</p>
              <div style={card}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      {["Feature", "Edge AI", "Hybrid AI", "Cloud AI"].map((h, i) => (
                        <th key={h} style={{ padding: "8px 10px", textAlign: i === 0 ? "left" : "center",
                          color: i === 0 ? "rgba(232,245,233,0.4)" : Object.values(MODE_COLOR)[i-1],
                          fontWeight: 800, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5,
                          borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { feat: "Model",    edge: "TFLite FP32",    hybrid: "TFLite + SAM",    cloud: "EffNet-B0 + SAM" },
                      { feat: "Runs on",  edge: "Device CPU",     hybrid: "Device + Server",  cloud: "Server CPU/GPU"  },
                      { feat: "Internet", edge: "Not required",   hybrid: "For segmentation", cloud: "Required"        },
                      { feat: "Segment",  edge: "No",             hybrid: "Cloud SAM",        cloud: "Cloud SAM"       },
                      { feat: "P50",      edge: `${lat.edge?.p50_ms}ms`, hybrid: `${lat.hybrid?.p50_ms}ms`, cloud: `${lat.cloud?.p50_ms}ms` },
                      { feat: "Privacy",  edge: "On-device",      hybrid: "Partial",          cloud: "Server"          },
                    ].map((row, i) => (
                      <tr key={row.feat} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                        <td style={{ padding: "10px 10px", color: "rgba(232,245,233,0.5)", fontSize: 12, fontWeight: 700 }}>{row.feat}</td>
                        {["edge","hybrid","cloud"].map((m) => (
                          <td key={m} style={{ padding: "10px 10px", textAlign: "center", color: MODE_COLOR[m], fontSize: 12 }}>{row[m]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p style={sectionTitle}>Research Questions</p>
              {[
                { id:"RQ1", q:"Does Edge AI meet real-time usability (< 200ms) on consumer mobile?",               color:"#00e676" },
                { id:"RQ2", q:"What accuracy trade-off from FP32 quantization of EfficientNet-B0 on PlantVillage?",color:"#00e676" },
                { id:"RQ3", q:"Can Hybrid AI achieve Cloud-level segmentation while reducing server cost ≥ 50%?",   color:"#ab47bc" },
                { id:"RQ4", q:"How does inference mode affect user-perceived response time?",                        color:"#42a5f5" },
              ].map((rq) => (
                <div key={rq.id} style={{ ...card, borderLeft: `4px solid ${rq.color}`, marginBottom: 10, padding: "14px 16px" }}>
                  <span style={{ color: rq.color, fontWeight: 900, fontSize: 13, marginRight: 12 }}>{rq.id}</span>
                  <span style={{ fontSize: 13, color: "rgba(232,245,233,0.8)" }}>{rq.q}</span>
                </div>
              ))}
            </>
          )}

          {/* ── ACCURACY ── */}
          {tab === "Accuracy" && (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                <StatCard val={`${cls.val_top1_acc}%`}           label="Val Top-1"  color="#00e676" />
                <StatCard val={`${cls.val_top5_acc}%`}           label="Val Top-5"  color="#00e676" />
                <StatCard val={cls.precision_macro?.toFixed(4)}  label="Precision"  color="#42a5f5" />
                <StatCard val={cls.recall_macro?.toFixed(4)}     label="Recall"     color="#42a5f5" />
                <StatCard val={cls.f1_macro?.toFixed(4)}         label="F1 Macro"   color="#ab47bc" />
                <StatCard val={`${cls.training_epochs} ep`}      label="Epochs"     color="#ff9800" />
              </div>

              <p style={sectionTitle}>Per-class Accuracy (top classes)</p>
              <div style={card}>
                {pc.map((c) => (
                  <HBar key={c.class} label={c.class} value={c.acc}
                    color={c.acc >= 99.0 ? "#00e676" : c.acc >= 98.0 ? "#42a5f5" : "#ff9800"} />
                ))}
                <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
                  {[["#00e676","≥ 99.0%"],["#42a5f5","98.0–99.0%"],["#ff9800","< 98.0%"]].map(([color, label]) => (
                    <span key={label} style={{ fontSize: 11, color }}> ■ {label}</span>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── LATENCY ── */}
          {tab === "Latency" && (
            <>
              <p style={sectionTitle}>Target Latency (Thesis Benchmarks)</p>
              <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                {Object.entries(lat).map(([mode, v]) => (
                  <div key={mode} style={{ ...card, flex: 1, minWidth: 180, borderTop: `3px solid ${MODE_COLOR[mode]}`, marginBottom: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: MODE_COLOR[mode], marginBottom: 8 }}>{MODE_LABEL[mode]}</div>
                    <div style={{ fontSize: 32, fontWeight: 900, color: MODE_COLOR[mode] }}>{v.p50_ms}ms</div>
                    <div style={{ fontSize: 11, color: "rgba(232,245,233,0.4)", marginBottom: 4 }}>P50</div>
                    <div style={{ fontSize: 13, color: "rgba(232,245,233,0.5)" }}>{v.p95_ms}ms P95</div>
                    <div style={{ fontSize: 11, color: "rgba(232,245,233,0.3)", marginTop: 8 }}>{v.note}</div>
                  </div>
                ))}
              </div>

              <p style={sectionTitle}>P50 / P95 Comparison</p>
              <div style={card}>
                {Object.entries(lat).map(([mode, v]) => (
                  <LatBar key={mode} label={MODE_LABEL[mode]} p50={v.p50_ms} p95={v.p95_ms} maxMs={maxLat} color={MODE_COLOR[mode]} />
                ))}
              </div>
            </>
          )}

          {/* ── LIVE ── */}
          {tab === "Live" && (
            <>
              <p style={sectionTitle}>Live Benchmark (scans din această sesiune)</p>
              {liveEntries.length === 0 ? (
                <div style={{ ...card, textAlign: "center", padding: 48 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
                  <p style={{ color: "rgba(232,245,233,0.4)", fontSize: 13 }}>Nu există date live încă.</p>
                  <p style={{ color: "rgba(232,245,233,0.25)", fontSize: 12 }}>Fă câteva scanări din aplicația mobilă pentru a vedea statistici în timp real.</p>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                    {liveEntries.map(([mode, v]) => (
                      <div key={mode} style={{ ...card, flex: 1, minWidth: 160, marginBottom: 0, borderTop: `3px solid ${MODE_COLOR[mode]}` }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: MODE_COLOR[mode], marginBottom: 10 }}>{MODE_LABEL[mode]}</div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: MODE_COLOR[mode] }}>{v.mean_ms}ms</div>
                        <div style={{ fontSize: 11, color: "rgba(232,245,233,0.4)", marginBottom: 8 }}>Mean</div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 12, color: "rgba(232,245,233,0.6)" }}>P50: <strong style={{ color: MODE_COLOR[mode] }}>{v.p50_ms}ms</strong></span>
                          <span style={{ fontSize: 12, color: "rgba(232,245,233,0.6)" }}>P95: <strong style={{ color: "rgba(232,245,233,0.45)" }}>{v.p95_ms}ms</strong></span>
                        </div>
                        <div style={{ fontSize: 11, color: "rgba(232,245,233,0.3)", marginTop: 6 }}>{v.count} scans</div>
                      </div>
                    ))}
                  </div>

                  <div style={card}>
                    {liveEntries.map(([mode, v]) => {
                      const liveMax = Math.max(...liveEntries.map(([, x]) => x.p95_ms)) * 1.2;
                      return <LatBar key={mode} label={MODE_LABEL[mode]} p50={v.p50_ms} p95={v.p95_ms} maxMs={liveMax} color={MODE_COLOR[mode]} />;
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
