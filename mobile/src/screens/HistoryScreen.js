import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
  RefreshControl, Alert, Modal, ScrollView, Image,
} from "react-native";
import { useState, useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { loadHistory, clearHistory } from "../utils/historyStorage";
import { Ionicons } from "@expo/vector-icons";

const MODE_CFG = {
  edge:   { color: "#00e676", icon: "hardware-chip",  label: "Edge"   },
  hybrid: { color: "#ab47bc", icon: "git-merge",      label: "Hybrid" },
  cloud:  { color: "#42a5f5", icon: "cloud",          label: "Cloud"  },
};
const SEV_COLOR = {
  healthy: "#00e676",
  low:     "#69f0ae",
  medium:  "#ffab40",
  high:    "#ff7043",
  severe:  "#f44336",
  unknown: "#888",
};

function fmtDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Detail Modal ────────────────────────────────────────────────────────────
function DetailModal({ item, visible, onClose }) {
  if (!item) return null;
  const mc       = MODE_CFG[item.mode] || MODE_CFG.cloud;
  const sev      = item.severity || "unknown";
  const sevColor = SEV_COLOR[sev] || "#888";
  const conf     = Math.round((item.confidence || 0) * 100);
  const t        = item.treatment || {};
  const hasTop3  = Array.isArray(item.top3) && item.top3.length > 0;
  const hasTreat = t.cause || t.immediate || t.chemical || t.organic || t.prevention;

  const Section = ({ title, children }) => (
    <View style={d.section}>
      <View style={d.sectionHeader}>
        <View style={[d.sectionDot, { backgroundColor: mc.color }]} />
        <Text style={d.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );

  const TreatRow = ({ label, value }) => {
    if (!value) return null;
    return (
      <View style={d.treatRow}>
        <Text style={d.treatLabel}>{label}</Text>
        <Text style={d.treatValue}>{value}</Text>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={d.overlay}>
        <View style={d.sheet}>

          {/* Handle bar */}
          <View style={d.handle} />

          {/* Header */}
          <View style={d.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={d.plant}>{item.plant?.toUpperCase() || "PLANT"}</Text>
              <Text style={d.disease} numberOfLines={2}>{item.disease_label || "Unknown"}</Text>
            </View>
            <View style={[d.modePill, { backgroundColor: mc.color + "18", borderColor: mc.color + "44" }]}>
              <Ionicons name={mc.icon} size={13} color={mc.color} />
              <Text style={[d.modePillText, { color: mc.color }]}>{mc.label}</Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={d.scroll}>

            {/* Image */}
            {item.imageUri ? (
              <View style={[d.imgWrap, { borderColor: mc.color + "44" }]}>
                <Image source={{ uri: item.imageUri }} style={d.img} resizeMode="cover" />
              </View>
            ) : null}

            {/* Confidence + severity */}
            <Section title="Diagnosis">
              <View style={d.confRow}>
                <View style={d.confTrack}>
                  <View style={[d.confFill, { width: `${conf}%`, backgroundColor: sevColor }]} />
                </View>
                <Text style={[d.confPct, { color: sevColor }]}>{conf}%</Text>
              </View>
              <View style={d.metaRow}>
                <View style={[d.sevBadge, { backgroundColor: sevColor + "20", borderColor: sevColor + "55" }]}>
                  <Text style={[d.sevText, { color: sevColor }]}>{sev.toUpperCase()}</Text>
                </View>
                <Text style={d.metaText}>{Math.round(item.latency_ms || 0)} ms</Text>
                {item.infected_area != null && (
                  <Text style={[d.metaText, { color: "#ff7043" }]}>
                    {Math.round(item.infected_area * 100)}% infected
                  </Text>
                )}
                {item.healthy_area != null && (
                  <Text style={[d.metaText, { color: "#00e676" }]}>
                    {Math.round(item.healthy_area * 100)}% healthy
                  </Text>
                )}
              </View>
            </Section>

            {/* Top-3 */}
            {hasTop3 && (
              <Section title="Top Predictions">
                {item.top3.map((p, i) => {
                  const pConf = Math.round((p.confidence || 0) * 100);
                  return (
                    <View key={i} style={d.top3Row}>
                      <Text style={[d.top3Rank, { color: i === 0 ? mc.color : "rgba(232,245,233,0.3)" }]}>
                        #{i + 1}
                      </Text>
                      <Text style={d.top3Label} numberOfLines={1}>{p.label}</Text>
                      <View style={d.top3Track}>
                        <View style={[d.top3Fill, {
                          width: `${pConf}%`,
                          backgroundColor: i === 0 ? mc.color : "rgba(255,255,255,0.15)",
                        }]} />
                      </View>
                      <Text style={[d.top3Pct, { color: i === 0 ? mc.color : "rgba(232,245,233,0.4)" }]}>
                        {pConf}%
                      </Text>
                    </View>
                  );
                })}
              </Section>
            )}

            {/* Treatment */}
            {hasTreat ? (
              <Section title="Treatment Plan">
                <TreatRow label="Cause"      value={t.cause}      />
                <TreatRow label="Symptoms"   value={t.immediate}  />
                <TreatRow label="Chemical"   value={t.chemical}   />
                <TreatRow label="Organic"    value={t.organic}    />
                <TreatRow label="Prevention" value={t.prevention} />
              </Section>
            ) : (
              <Section title="Treatment Plan">
                <Text style={d.noTreat}>No treatment data saved for this scan.</Text>
              </Section>
            )}

            {/* Timestamp */}
            <Text style={d.timestamp}>{fmtDate(item.timestamp)}</Text>

          </ScrollView>

          {/* Close button */}
          <TouchableOpacity style={[d.closeBtn, { backgroundColor: mc.color }]} onPress={onClose}>
            <Text style={d.closeBtnText}>Close</Text>
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
  );
}

// ─── Scan Card ────────────────────────────────────────────────────────────────
function ScanCard({ item, onPress }) {
  const mc       = MODE_CFG[item.mode] || MODE_CFG.cloud;
  const sev      = item.severity || "unknown";
  const sevColor = SEV_COLOR[sev] || "#888";
  const conf     = Math.round((item.confidence || 0) * 100);

  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress} style={s.card}>
      {/* Left accent */}
      <View style={[s.accent, { backgroundColor: mc.color }]} />

      <View style={s.cardBody}>
        {/* Top row */}
        <View style={s.cardTop}>
          <Text style={s.plantLabel}>{item.plant?.toUpperCase() || "PLANT"}</Text>
          <View style={[s.modePill, { backgroundColor: mc.color + "18", borderColor: mc.color + "44" }]}>
            <Ionicons name={mc.icon} size={11} color={mc.color} />
            <Text style={[s.modePillText, { color: mc.color }]}>{mc.label}</Text>
          </View>
        </View>

        {/* Disease name */}
        <Text style={s.diseaseName} numberOfLines={2}>
          {item.disease_label || item.disease_class || "Unknown"}
        </Text>

        {/* Confidence bar */}
        <View style={s.confRow}>
          <View style={s.confTrack}>
            <View style={[s.confFill, { width: `${conf}%`, backgroundColor: sevColor }]} />
          </View>
          <Text style={[s.confPct, { color: sevColor }]}>{conf}%</Text>
        </View>

        {/* Bottom row */}
        <View style={s.cardBottom}>
          <View style={[s.sevBadge, { backgroundColor: sevColor + "20", borderColor: sevColor + "55" }]}>
            <Text style={[s.sevText, { color: sevColor }]}>{sev.toUpperCase()}</Text>
          </View>
          <Text style={s.latency}>{Math.round(item.latency_ms || 0)}ms</Text>
          <Text style={s.timestamp}>{fmtDate(item.timestamp)}</Text>
          <Text style={s.chevron}>›</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function HistoryScreen() {
  const [records,    setRecords]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter,     setFilter]     = useState("all");
  const [selected,   setSelected]   = useState(null);   // item shown in modal

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await loadHistory();
      setRecords(Array.isArray(data) ? data : []);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleClear = () => {
    Alert.alert("Clear History", "Delete all scan records? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete All", style: "destructive",
        onPress: async () => { await clearHistory(); setRecords([]); },
      },
    ]);
  };

  const filtered = filter === "all" ? records : records.filter((r) => r.mode === filter);

  const totalScans = records.length;
  const diseased   = records.filter((r) => r.severity !== "healthy").length;
  const avgConf    = records.length
    ? Math.round(records.reduce((s, r) => s + (r.confidence || 0), 0) / records.length * 100)
    : 0;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#080d08" />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Scan History</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {records.length > 0 && (
            <TouchableOpacity onPress={handleClear} style={s.clearBtn}>
              <Text style={s.clearText}>Clear</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => load(true)} style={s.refreshBtn}>
            <Text style={s.refreshText}>↻</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats bar */}
      {records.length > 0 && (
        <View style={s.statsBar}>
          <View style={s.stat}>
            <Text style={s.statVal}>{totalScans}</Text>
            <Text style={s.statLabel}>Scans</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text style={[s.statVal, { color: "#ff7043" }]}>{diseased}</Text>
            <Text style={s.statLabel}>Diseased</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text style={[s.statVal, { color: "#00e676" }]}>{records.length - diseased}</Text>
            <Text style={s.statLabel}>Healthy</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text style={[s.statVal, { color: "#42a5f5" }]}>{avgConf}%</Text>
            <Text style={s.statLabel}>Avg Conf</Text>
          </View>
        </View>
      )}

      {/* Mode filter */}
      <View style={s.filterRow}>
        {["all", "edge", "hybrid", "cloud"].map((f) => {
          const mc     = f === "all" ? null : MODE_CFG[f];
          const active = filter === f;
          return (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[
                s.filterBtn,
                active && {
                  backgroundColor: (mc?.color || "#ffffff") + "18",
                  borderColor    : (mc?.color || "#ffffff") + "55",
                },
              ]}
            >
              <Text style={[
                s.filterText,
                active && { color: mc?.color || "#e8f5e9", fontWeight: "800" },
              ]}>
                {f === "all" ? "All" : mc.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color="#00e676" />
          <Text style={s.loadText}>Loading history…</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={s.centered}>
          <Text style={s.emptyTitle}>No scans yet</Text>
          <Text style={s.emptySub}>
            {filter === "all"
              ? "Scan a plant to see results here"
              : `No ${filter} mode scans recorded`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item, i) => item.id || String(i)}
          renderItem={({ item }) => (
            <ScanCard item={item} onPress={() => setSelected(item)} />
          )}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor="#00e676"
            />
          }
        />
      )}

      {/* Detail modal */}
      <DetailModal
        item={selected}
        visible={!!selected}
        onClose={() => setSelected(null)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe   : { flex: 1, backgroundColor: "#080d08" },

  header : { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
             paddingHorizontal: 20, paddingVertical: 14,
             borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)" },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#e8f5e9" },
  refreshBtn : { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center",
                 backgroundColor: "rgba(0,230,118,0.10)", borderWidth: 1, borderColor: "rgba(0,230,118,0.25)" },
  refreshText: { color: "#00e676", fontSize: 18, fontWeight: "800" },
  clearBtn   : { height: 34, paddingHorizontal: 14, borderRadius: 17, alignItems: "center", justifyContent: "center",
                 backgroundColor: "rgba(244,67,54,0.10)", borderWidth: 1, borderColor: "rgba(244,67,54,0.30)" },
  clearText  : { color: "#f44336", fontSize: 12, fontWeight: "700" },

  statsBar   : { flexDirection: "row", alignItems: "center",
                 backgroundColor: "rgba(255,255,255,0.03)", borderBottomWidth: 1,
                 borderBottomColor: "rgba(255,255,255,0.06)", paddingVertical: 12 },
  stat       : { flex: 1, alignItems: "center" },
  statVal    : { fontSize: 18, fontWeight: "900", color: "#e8f5e9" },
  statLabel  : { fontSize: 9, color: "rgba(232,245,233,0.35)", fontWeight: "700",
                 textTransform: "uppercase", letterSpacing: 0.1, marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: "rgba(255,255,255,0.08)" },

  filterRow  : { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  filterBtn  : { flex: 1, paddingVertical: 7, borderRadius: 20, borderWidth: 1,
                 borderColor: "rgba(255,255,255,0.10)", alignItems: "center",
                 backgroundColor: "rgba(255,255,255,0.03)" },
  filterText : { fontSize: 11, color: "rgba(232,245,233,0.4)", fontWeight: "600" },

  list       : { padding: 14, paddingBottom: 40 },

  card       : { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.04)",
                 borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
                 borderRadius: 14, marginBottom: 10, overflow: "hidden" },
  accent     : { width: 3 },
  cardBody   : { flex: 1, padding: 14 },

  cardTop    : { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  plantLabel : { fontSize: 9, color: "rgba(232,245,233,0.35)", fontWeight: "700",
                 letterSpacing: 0.12, textTransform: "uppercase" },
  modePill   : { flexDirection: "row", alignItems: "center", gap: 5,
                 paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  modePillText: { fontSize: 10, fontWeight: "800" },

  diseaseName: { fontSize: 15, fontWeight: "700", color: "#e8f5e9", marginBottom: 10 },

  confRow    : { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  confTrack  : { flex: 1, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  confFill   : { height: "100%", borderRadius: 3 },
  confPct    : { fontSize: 12, fontWeight: "800", minWidth: 38, textAlign: "right" },

  cardBottom : { flexDirection: "row", alignItems: "center", gap: 8 },
  sevBadge   : { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  sevText    : { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  latency    : { fontSize: 11, color: "rgba(232,245,233,0.35)", fontWeight: "600" },
  timestamp  : { flex: 1, fontSize: 10, color: "rgba(232,245,233,0.25)", textAlign: "right" },
  chevron    : { fontSize: 20, color: "rgba(232,245,233,0.20)", fontWeight: "300", marginLeft: 4 },

  centered   : { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  loadText   : { color: "rgba(232,245,233,0.4)", fontSize: 13 },
  emptyTitle : { fontSize: 17, fontWeight: "800", color: "rgba(232,245,233,0.4)" },
  emptySub   : { fontSize: 13, color: "rgba(232,245,233,0.25)", textAlign: "center", lineHeight: 20 },
});

// ─── Detail Modal Styles ──────────────────────────────────────────────────────
const d = StyleSheet.create({
  overlay    : { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  sheet      : { backgroundColor: "#0d150d", borderTopLeftRadius: 22, borderTopRightRadius: 22,
                 maxHeight: "92%", paddingBottom: 24 },
  handle     : { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)",
                 alignSelf: "center", marginTop: 10, marginBottom: 6 },

  sheetHeader: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 20,
                 paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)",
                 gap: 12 },
  plant      : { fontSize: 10, color: "rgba(232,245,233,0.35)", fontWeight: "700",
                 letterSpacing: 0.15, textTransform: "uppercase", marginBottom: 2 },
  disease    : { fontSize: 20, fontWeight: "800", color: "#e8f5e9", lineHeight: 26 },
  modePill   : { flexDirection: "row", alignItems: "center", gap: 6,
                 paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
                 marginTop: 4 },
  modePillText: { fontSize: 11, fontWeight: "800" },

  scroll     : { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 },

  imgWrap    : { borderRadius: 14, overflow: "hidden", borderWidth: 1.5, marginBottom: 16, marginTop: 12 },
  img        : { width: "100%", height: 220 },

  section    : { marginTop: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  sectionDot : { width: 6, height: 6, borderRadius: 3 },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: "#e8f5e9", textTransform: "uppercase",
                  letterSpacing: 0.5 },

  confRow    : { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  confTrack  : { flex: 1, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  confFill   : { height: "100%", borderRadius: 4 },
  confPct    : { fontSize: 15, fontWeight: "900", minWidth: 44, textAlign: "right" },

  metaRow    : { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  sevBadge   : { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  sevText    : { fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  metaText   : { fontSize: 12, color: "rgba(232,245,233,0.45)", fontWeight: "600" },

  top3Row    : { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  top3Rank   : { fontSize: 11, fontWeight: "800", width: 22 },
  top3Label  : { flex: 1, fontSize: 12, color: "#e8f5e9", fontWeight: "600" },
  top3Track  : { width: 70, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  top3Fill   : { height: "100%", borderRadius: 3 },
  top3Pct    : { fontSize: 11, fontWeight: "800", width: 36, textAlign: "right" },

  treatRow   : { marginBottom: 12 },
  treatLabel : { fontSize: 10, fontWeight: "800", color: "rgba(232,245,233,0.35)",
                 textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  treatValue : { fontSize: 13, color: "rgba(232,245,233,0.75)", lineHeight: 20 },
  noTreat    : { fontSize: 13, color: "rgba(232,245,233,0.25)", fontStyle: "italic" },

  timestamp  : { textAlign: "center", fontSize: 11, color: "rgba(232,245,233,0.2)", marginTop: 20 },

  closeBtn   : { marginHorizontal: 20, marginTop: 12, borderRadius: 14,
                 paddingVertical: 15, alignItems: "center" },
  closeBtnText: { color: "#080d08", fontSize: 16, fontWeight: "800" },
});
