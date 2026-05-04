import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
} from "react-native";
import { useState, useEffect } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback } from "react";
import { getResearch } from "../api/plantApi";
import { computeBenchmarkStats } from "../utils/historyStorage";

const MODE_COLOR = { edge: "#00e676", hybrid: "#ab47bc", cloud: "#42a5f5" };
const MODE_LABEL = { edge: "Edge AI",  hybrid: "Hybrid AI", cloud: "Cloud AI" };

function StatCard({ val, label, sub, color = "#00e676" }) {
  return (
    <View style={s.statCard}>
      <Text style={[s.statVal, { color }]}>{val}</Text>
      <Text style={s.statLabel}>{label}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </View>
  );
}

function HBar({ label, value, color = "#00e676" }) {
  const pct = Math.max(0, Math.min(100, ((value - 97) / 3) * 100)); // 97–100% range
  return (
    <View style={s.hbarRow}>
      <Text style={s.hbarLabel} numberOfLines={1}>{label}</Text>
      <View style={s.hbarTrack}>
        <View style={[s.hbarFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={[s.hbarVal, { color }]}>{value.toFixed(1)}%</Text>
    </View>
  );
}

function LatBar({ label, p50, p95, maxMs, color }) {
  const p50pct = Math.round((p50 / maxMs) * 100);
  const p95pct = Math.round((p95 / maxMs) * 100);
  return (
    <View style={s.latBarWrap}>
      <Text style={[s.latBarLabel, { color }]}>{label}</Text>
      <View style={s.latBarRow}>
        <Text style={s.latBarKey}>P50</Text>
        <View style={s.latBarTrack}>
          <View style={[s.latBarFill, { width: `${p50pct}%`, backgroundColor: color }]} />
        </View>
        <Text style={[s.latBarNum, { color }]}>{p50}ms</Text>
      </View>
      <View style={s.latBarRow}>
        <Text style={s.latBarKey}>P95</Text>
        <View style={s.latBarTrack}>
          <View style={[s.latBarFill, { width: `${p95pct}%`, backgroundColor: color, opacity: 0.5 }]} />
        </View>
        <Text style={[s.latBarNum, { color: "rgba(232,245,233,0.45)" }]}>{p95}ms</Text>
      </View>
    </View>
  );
}

const TABS = ["Overview", "Accuracy", "Latency", "Live"];

export default function ResearchScreen() {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState("Overview");
  const [liveStats,  setLiveStats]  = useState({});

  useEffect(() => {
    getResearch()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => {
    computeBenchmarkStats().then(setLiveStats);
  }, []));

  const cls = data?.classifier || {};
  const pc  = data?.per_class  || [];
  const lat = data?.latency_targets || {};
  const live = data?.live_latency || {};

  const maxLat = Math.max(...Object.values(lat).map((v) => v?.p95_ms || 0)) * 1.1 || 800;
  const liveEntries = Object.entries(live).filter(([, v]) => v && v.count > 0);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#080d08" />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Research</Text>
        <Text style={s.headerSub}>Master's Thesis · Edge vs Cloud AI</Text>
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        {TABS.map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)}
            style={[s.tabBtn, tab === t && s.tabBtnActive]}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color="#00e676" />
          <Text style={s.loadText}>Loading metrics…</Text>
        </View>
      ) : !data ? (
        <View style={s.centered}>
          <Text style={s.errorText}>Could not load research data</Text>
          <Text style={s.errorSub}>Make sure the backend is running</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* ── OVERVIEW ── */}
          {tab === "Overview" && (
            <>
              <View style={s.statsGrid}>
                <StatCard val={`${cls.val_top1_acc}%`}  label="Val Top-1"  sub="EfficientNet-B0"  color="#00e676" />
                <StatCard val={`${cls.test_top1_acc}%`} label="Test Top-1" sub="Held-out test set" color="#00e676" />
                <StatCard val={cls.f1_macro?.toFixed(4)} label="F1 Macro"  sub="38 classes"        color="#42a5f5" />
                <StatCard val={data.dataset?.total_images?.toLocaleString()} label="Images" sub="PlantVillage" color="#ab47bc" />
                <StatCard val={`${data.dataset?.num_classes}`} label="Classes" sub={`${data.dataset?.crops} crops`} color="#ff9800" />
                <StatCard val={`${data.tflite?.size_mb} MB`} label="TFLite" sub={data.tflite?.format} color="#ff5252" />
              </View>

              <Text style={s.sectionTitle}>Architecture Comparison</Text>
              <View style={s.archCard}>
                {[
                  { feat: "Model",     edge: "TFLite FP32",     hybrid: "TFLite + SAM",  cloud: "EffNet-B0 + SAM" },
                  { feat: "Runs on",   edge: "Device CPU",      hybrid: "Device + Server",cloud: "Server CPU/GPU"  },
                  { feat: "Internet",  edge: "Not required",    hybrid: "For segmentation",cloud: "Required"       },
                  { feat: "Segment",   edge: "No",              hybrid: "Cloud SAM",      cloud: "Cloud SAM"       },
                  { feat: "P50",       edge: `${lat.edge?.p50_ms}ms`, hybrid: `${lat.hybrid?.p50_ms}ms`, cloud: `${lat.cloud?.p50_ms}ms` },
                  { feat: "Privacy",   edge: "On-device",       hybrid: "Partial",        cloud: "Server"          },
                ].map((row) => (
                  <View key={row.feat} style={s.archRow}>
                    <Text style={s.archFeat}>{row.feat}</Text>
                    <Text style={[s.archCell, { color: MODE_COLOR.edge   }]}>{row.edge}</Text>
                    <Text style={[s.archCell, { color: MODE_COLOR.hybrid }]}>{row.hybrid}</Text>
                    <Text style={[s.archCell, { color: MODE_COLOR.cloud  }]}>{row.cloud}</Text>
                  </View>
                ))}
              </View>

              <Text style={s.sectionTitle}>Research Questions</Text>
              {[
                { id:"RQ1", q:"Does Edge AI meet real-time usability (< 200ms) on consumer mobile?",               color:"#00e676" },
                { id:"RQ2", q:"What accuracy trade-off from FP32 quantization of EfficientNet-B0 on PlantVillage?",color:"#00e676" },
                { id:"RQ3", q:"Can Hybrid AI achieve Cloud-level segmentation while reducing server cost ≥ 50%?",   color:"#ab47bc" },
                { id:"RQ4", q:"How does inference mode affect user-perceived response time?",                        color:"#42a5f5" },
              ].map((rq) => (
                <View key={rq.id} style={[s.rqCard, { borderLeftColor: rq.color }]}>
                  <Text style={[s.rqId, { color: rq.color }]}>{rq.id}</Text>
                  <Text style={s.rqText}>{rq.q}</Text>
                </View>
              ))}
            </>
          )}

          {/* ── ACCURACY ── */}
          {tab === "Accuracy" && (
            <>
              <View style={s.statsGrid}>
                <StatCard val={`${cls.val_top1_acc}%`}              label="Val Top-1"   color="#00e676" />
                <StatCard val={`${cls.val_top5_acc}%`}              label="Val Top-5"   color="#00e676" />
                <StatCard val={cls.precision_macro?.toFixed(4)}     label="Precision"   color="#42a5f5" />
                <StatCard val={cls.recall_macro?.toFixed(4)}        label="Recall"      color="#42a5f5" />
                <StatCard val={cls.f1_macro?.toFixed(4)}            label="F1 Macro"    color="#ab47bc" />
                <StatCard val={`${cls.training_epochs} ep`}         label="Epochs"      color="#ff9800" />
              </View>

              <Text style={s.sectionTitle}>Per-class Accuracy (38 classes)</Text>
              <Text style={s.sectionSub}>EfficientNet-B0 — test set</Text>
              <View style={s.pcCard}>
                {pc.map((c) => (
                  <HBar key={c.class} label={c.class} value={c.acc}
                    color={c.acc >= 99.5 ? "#00e676" : c.acc >= 99.0 ? "#42a5f5" : "#ff9800"} />
                ))}
              </View>
              <View style={s.legend}>
                <Text style={[s.legendItem, { color: "#00e676" }]}>■ ≥ 99.5%</Text>
                <Text style={[s.legendItem, { color: "#42a5f5" }]}>■ 99.0–99.4%</Text>
                <Text style={[s.legendItem, { color: "#ff9800" }]}>■ {"<"} 99.0%</Text>
              </View>
            </>
          )}

          {/* ── LATENCY ── */}
          {tab === "Latency" && (
            <>
              <Text style={s.sectionTitle}>Target Latency (Thesis Benchmarks)</Text>
              <Text style={s.sectionSub}>P50 / P95 on mid-range device + local server</Text>
              <View style={s.latCardsRow}>
                {Object.entries(lat).map(([mode, v]) => (
                  <View key={mode} style={[s.latCard, { borderTopColor: MODE_COLOR[mode] }]}>
                    <Text style={[s.latMode, { color: MODE_COLOR[mode] }]}>{MODE_LABEL[mode]}</Text>
                    <Text style={[s.latP50, { color: MODE_COLOR[mode] }]}>{v.p50_ms}ms</Text>
                    <Text style={s.latP50Key}>P50</Text>
                    <Text style={s.latP95}>{v.p95_ms}ms P95</Text>
                  </View>
                ))}
              </View>

              <Text style={s.sectionTitle}>P50 / P95 Comparison</Text>
              <View style={s.latBarsCard}>
                {Object.entries(lat).map(([mode, v]) => (
                  <LatBar key={mode}
                    label={MODE_LABEL[mode]}
                    p50={v.p50_ms} p95={v.p95_ms}
                    maxMs={maxLat}
                    color={MODE_COLOR[mode]}
                  />
                ))}
              </View>

              {liveEntries.length > 0 && (
                <>
                  <Text style={s.sectionTitle}>Live Latency (from scan history)</Text>
                  <View style={s.latBarsCard}>
                    {liveEntries.map(([mode, v]) => {
                      const liveMax = Math.max(...liveEntries.map(([, x]) => x.p95_ms)) * 1.15;
                      return (
                        <LatBar key={mode}
                          label={MODE_LABEL[mode]}
                          p50={v.p50_ms} p95={v.p95_ms}
                          maxMs={liveMax}
                          color={MODE_COLOR[mode]}
                        />
                      );
                    })}
                  </View>
                  <View style={s.liveStatsCard}>
                    {liveEntries.map(([mode, v]) => (
                      <View key={mode} style={s.liveRow}>
                        <Text style={[s.liveModeLabel, { color: MODE_COLOR[mode] }]}>{MODE_LABEL[mode]}</Text>
                        <Text style={s.liveStat}>{v.count} scans</Text>
                        <Text style={s.liveStat}>Mean: <Text style={{ fontWeight: "700", color: "#e8f5e9" }}>{v.mean_ms}ms</Text></Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </>
          )}

          {/* ── LIVE BENCHMARK ── */}
          {tab === "Live" && (
            <>
              <Text style={s.sectionTitle}>Live Benchmark</Text>
              <Text style={s.sectionSub}>Computed from your scan history on this device</Text>

              {Object.keys(liveStats).length === 0 ? (
                <View style={s.emptyLive}>
                  <Text style={s.emptyLiveText}>No scans yet</Text>
                  <Text style={s.emptyLiveSub}>Run scans in all 3 modes to populate benchmark data</Text>
                </View>
              ) : (
                <>
                  {/* Mode cards */}
                  {["edge","hybrid","cloud"].filter(m => liveStats[m]).map(mode => {
                    const v   = liveStats[mode];
                    const col = MODE_COLOR[mode];
                    return (
                      <View key={mode} style={[s.liveCard, { borderTopColor: col }]}>
                        <View style={s.liveCardHeader}>
                          <Text style={[s.liveCardMode, { color: col }]}>{MODE_LABEL[mode]}</Text>
                          <View style={[s.liveCountBadge, { backgroundColor: col + "22" }]}>
                            <Text style={[s.liveCountText, { color: col }]}>{v.count} scans</Text>
                          </View>
                        </View>
                        <View style={s.liveMetricRow}>
                          <View style={s.liveMetric}>
                            <Text style={[s.liveMetricVal, { color: col }]}>{v.mean_ms}<Text style={s.liveMetricUnit}>ms</Text></Text>
                            <Text style={s.liveMetricKey}>Mean</Text>
                          </View>
                          <View style={s.liveMetric}>
                            <Text style={[s.liveMetricVal, { color: col }]}>{v.p50_ms}<Text style={s.liveMetricUnit}>ms</Text></Text>
                            <Text style={s.liveMetricKey}>P50</Text>
                          </View>
                          <View style={s.liveMetric}>
                            <Text style={[s.liveMetricVal, { color: "rgba(232,245,233,0.45)" }]}>{v.p95_ms}<Text style={s.liveMetricUnit}>ms</Text></Text>
                            <Text style={s.liveMetricKey}>P95</Text>
                          </View>
                          <View style={s.liveMetric}>
                            <Text style={[s.liveMetricVal, { color: "#ff9800" }]}>{v.avg_conf}<Text style={s.liveMetricUnit}>%</Text></Text>
                            <Text style={s.liveMetricKey}>Avg conf</Text>
                          </View>
                        </View>
                        {/* Latency bar */}
                        <View style={s.liveMiniBarWrap}>
                          <View style={s.liveMiniBarTrack}>
                            <View style={[s.liveMiniBarFill, {
                              width: `${Math.min(100, (v.p50_ms / 2000) * 100)}%`,
                              backgroundColor: col,
                            }]} />
                          </View>
                          <Text style={s.liveMiniRange}>{v.min_ms}–{v.max_ms}ms range</Text>
                        </View>
                      </View>
                    );
                  })}

                  {/* Comparison summary */}
                  {["edge","hybrid","cloud"].every(m => liveStats[m]) && (
                    <>
                      <Text style={s.sectionTitle}>Mode Comparison</Text>
                      <View style={s.compareCard}>
                        <View style={s.compareHeader}>
                          <Text style={s.compareCol} />
                          {["edge","hybrid","cloud"].map(m => (
                            <Text key={m} style={[s.compareColHead, { color: MODE_COLOR[m] }]}>
                              {m === "edge" ? "Edge" : m === "hybrid" ? "Hybrid" : "Cloud"}
                            </Text>
                          ))}
                        </View>
                        {[
                          { key: "mean_ms", label: "Mean (ms)", fmt: v => v },
                          { key: "p50_ms",  label: "P50 (ms)",  fmt: v => v },
                          { key: "p95_ms",  label: "P95 (ms)",  fmt: v => v },
                          { key: "avg_conf",label: "Avg conf",  fmt: v => v + "%" },
                          { key: "count",   label: "Scans",     fmt: v => v },
                        ].map(row => (
                          <View key={row.key} style={s.compareRow}>
                            <Text style={s.compareLabel}>{row.label}</Text>
                            {["edge","hybrid","cloud"].map(m => (
                              <Text key={m} style={[s.compareVal, { color: liveStats[m] ? MODE_COLOR[m] : "rgba(232,245,233,0.2)" }]}>
                                {liveStats[m] ? row.fmt(liveStats[m][row.key]) : "—"}
                              </Text>
                            ))}
                          </View>
                        ))}
                      </View>
                    </>
                  )}
                </>
              )}
            </>
          )}

        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe        : { flex: 1, backgroundColor: "#080d08" },
  scroll      : { padding: 16, paddingBottom: 48 },

  header      : { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12,
                  borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)" },
  headerTitle : { fontSize: 20, fontWeight: "800", color: "#e8f5e9" },
  headerSub   : { fontSize: 11, color: "rgba(232,245,233,0.35)", marginTop: 2 },

  tabRow      : { flexDirection: "row", borderBottomWidth: 1,
                  borderBottomColor: "rgba(255,255,255,0.07)" },
  tabBtn      : { flex: 1, paddingVertical: 12, alignItems: "center",
                  borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabBtnActive: { borderBottomColor: "#00e676" },
  tabText     : { fontSize: 12, fontWeight: "600", color: "rgba(232,245,233,0.4)" },
  tabTextActive: { color: "#00e676", fontWeight: "800" },

  centered    : { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadText    : { color: "rgba(232,245,233,0.4)", fontSize: 13 },
  errorText   : { color: "#ff5252", fontSize: 15, fontWeight: "700" },
  errorSub    : { color: "rgba(232,245,233,0.3)", fontSize: 12 },

  // Stat grid
  statsGrid   : { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  statCard    : { width: "47%", backgroundColor: "rgba(255,255,255,0.04)",
                  borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
                  borderRadius: 12, padding: 14, alignItems: "center" },
  statVal     : { fontSize: 20, fontWeight: "900", marginBottom: 4 },
  statLabel   : { fontSize: 11, color: "rgba(232,245,233,0.55)", fontWeight: "700", textAlign: "center" },
  statSub     : { fontSize: 9,  color: "rgba(232,245,233,0.25)", marginTop: 2, textAlign: "center" },

  sectionTitle: { fontSize: 14, fontWeight: "800", color: "#e8f5e9", marginBottom: 6, marginTop: 4 },
  sectionSub  : { fontSize: 11, color: "rgba(232,245,233,0.35)", marginBottom: 12 },

  // Architecture table
  archCard    : { backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)", borderRadius: 12,
                  overflow: "hidden", marginBottom: 20 },
  archRow     : { flexDirection: "row", borderBottomWidth: 1,
                  borderBottomColor: "rgba(255,255,255,0.05)",
                  paddingVertical: 10, paddingHorizontal: 12 },
  archFeat    : { width: 68, fontSize: 10, color: "rgba(232,245,233,0.4)", fontWeight: "700" },
  archCell    : { flex: 1, fontSize: 10, fontWeight: "600", textAlign: "center" },

  // RQ cards
  rqCard      : { backgroundColor: "rgba(255,255,255,0.03)", borderLeftWidth: 3,
                  borderWidth: 1, borderColor: "rgba(255,255,255,0.07)",
                  borderRadius: 10, padding: 12, marginBottom: 8,
                  flexDirection: "row", gap: 10, alignItems: "flex-start" },
  rqId        : { fontSize: 11, fontWeight: "900", letterSpacing: 0.5, marginTop: 1 },
  rqText      : { flex: 1, fontSize: 12, color: "rgba(232,245,233,0.7)", lineHeight: 18 },

  // Per-class bars
  pcCard      : { backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)", borderRadius: 12,
                  padding: 14, marginBottom: 10 },
  hbarRow     : { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 7 },
  hbarLabel   : { width: 130, fontSize: 10, color: "rgba(232,245,233,0.6)" },
  hbarTrack   : { flex: 1, height: 5, borderRadius: 3,
                  backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  hbarFill    : { height: "100%", borderRadius: 3 },
  hbarVal     : { width: 44, fontSize: 10, fontWeight: "700", textAlign: "right" },

  legend      : { flexDirection: "row", gap: 14, marginBottom: 20 },
  legendItem  : { fontSize: 11, fontWeight: "600" },

  // Latency cards
  latCardsRow : { flexDirection: "row", gap: 10, marginBottom: 20 },
  latCard     : { flex: 1, backgroundColor: "rgba(255,255,255,0.04)",
                  borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
                  borderTopWidth: 3, borderRadius: 12, padding: 12, alignItems: "center" },
  latMode     : { fontSize: 11, fontWeight: "800", marginBottom: 8 },
  latP50      : { fontSize: 22, fontWeight: "900" },
  latP50Key   : { fontSize: 9, color: "rgba(232,245,233,0.35)", fontWeight: "700",
                  letterSpacing: 0.1, textTransform: "uppercase", marginBottom: 2 },
  latP95      : { fontSize: 10, color: "rgba(232,245,233,0.4)", fontWeight: "600" },

  // Latency bars
  latBarsCard : { backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)", borderRadius: 12,
                  padding: 16, marginBottom: 16 },
  latBarWrap  : { marginBottom: 14 },
  latBarLabel : { fontSize: 12, fontWeight: "800", marginBottom: 6 },
  latBarRow   : { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  latBarKey   : { width: 28, fontSize: 10, color: "rgba(232,245,233,0.4)", fontWeight: "700" },
  latBarTrack : { flex: 1, height: 8, borderRadius: 4,
                  backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  latBarFill  : { height: "100%", borderRadius: 4 },
  latBarNum   : { width: 50, fontSize: 11, fontWeight: "700", textAlign: "right" },

  liveStatsCard: { backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1,
                   borderColor: "rgba(255,255,255,0.07)", borderRadius: 12,
                   padding: 12, marginBottom: 20 },
  liveRow     : { flexDirection: "row", alignItems: "center", gap: 12,
                  paddingVertical: 6, borderBottomWidth: 1,
                  borderBottomColor: "rgba(255,255,255,0.05)" },
  liveModeLabel:{ width: 70, fontSize: 12, fontWeight: "700" },
  liveStat    : { fontSize: 11, color: "rgba(232,245,233,0.5)" },

  // Live benchmark tab
  emptyLive      : { alignItems: "center", paddingVertical: 48, gap: 8 },
  emptyLiveText  : { fontSize: 16, fontWeight: "700", color: "rgba(232,245,233,0.3)" },
  emptyLiveSub   : { fontSize: 12, color: "rgba(232,245,233,0.2)", textAlign: "center" },

  liveCard       : { backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1,
                     borderColor: "rgba(255,255,255,0.08)", borderTopWidth: 3,
                     borderRadius: 14, padding: 16, marginBottom: 12 },
  liveCardHeader : { flexDirection: "row", alignItems: "center",
                     justifyContent: "space-between", marginBottom: 14 },
  liveCardMode   : { fontSize: 14, fontWeight: "900", letterSpacing: 0.3 },
  liveCountBadge : { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  liveCountText  : { fontSize: 11, fontWeight: "700" },

  liveMetricRow  : { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  liveMetric     : { alignItems: "center", flex: 1 },
  liveMetricVal  : { fontSize: 20, fontWeight: "900" },
  liveMetricUnit : { fontSize: 11, fontWeight: "600" },
  liveMetricKey  : { fontSize: 9, color: "rgba(232,245,233,0.4)", fontWeight: "700",
                     textTransform: "uppercase", marginTop: 2 },

  liveMiniBarWrap  : { gap: 4 },
  liveMiniBarTrack : { height: 4, borderRadius: 2,
                       backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  liveMiniBarFill  : { height: "100%", borderRadius: 2 },
  liveMiniRange    : { fontSize: 10, color: "rgba(232,245,233,0.25)" },

  // Comparison table
  compareCard    : { backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1,
                     borderColor: "rgba(255,255,255,0.08)", borderRadius: 12,
                     overflow: "hidden", marginBottom: 20 },
  compareHeader  : { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.04)",
                     paddingVertical: 8, paddingHorizontal: 12 },
  compareCol     : { flex: 1.4, fontSize: 10 },
  compareColHead : { flex: 1, fontSize: 10, fontWeight: "900", textAlign: "center" },
  compareRow     : { flexDirection: "row", paddingVertical: 9, paddingHorizontal: 12,
                     borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  compareLabel   : { flex: 1.4, fontSize: 11, color: "rgba(232,245,233,0.5)", fontWeight: "600" },
  compareVal     : { flex: 1, fontSize: 11, fontWeight: "800", textAlign: "center" },
});
