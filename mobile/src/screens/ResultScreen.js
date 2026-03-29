import {
  View, Text, Image, TouchableOpacity,
  ScrollView, SafeAreaView, StatusBar, StyleSheet, Share,
} from "react-native";

const MODE_CFG = {
  edge:   { color: "#00e676", label: "Edge AI",  tag: "E" },
  hybrid: { color: "#ab47bc", label: "Hybrid",   tag: "H" },
  cloud:  { color: "#42a5f5", label: "Cloud AI", tag: "C" },
};

const SEVERITY_CFG = {
  low:     { color: "#00e676", bg: "rgba(0,230,118,0.15)",  label: "LOW"     },
  medium:  { color: "#ffab40", bg: "rgba(255,171,64,0.15)", label: "MEDIUM"  },
  high:    { color: "#ff7043", bg: "rgba(255,112,67,0.15)", label: "HIGH"    },
  severe:  { color: "#f44336", bg: "rgba(244,67,54,0.18)",  label: "SEVERE"  },
  healthy: { color: "#00e676", bg: "rgba(0,230,118,0.12)",  label: "HEALTHY" },
};

function getSeverity(confidence, label) {
  if (label?.toLowerCase().includes("healthy")) return "healthy";
  if (confidence >= 0.90) return "severe";
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.55) return "medium";
  return "low";
}

function fmtConf(v) {
  if (v == null) return "?";
  return v > 1 ? `${Math.round(v)}%` : `${Math.round(v * 100)}%`;
}

function confNum(v) {
  if (v == null) return 0;
  return v > 1 ? v / 100 : v;
}

export default function ResultScreen({ route, navigation }) {
  const { result = {}, imageUri, mode } = route?.params || {};
  const cfg = MODE_CFG[mode] || MODE_CFG.cloud;

  const {
    predicted_class = "Unknown",
    confidence      = 0,
    top3            = [],
    latency_ms      = 0,
    infected_area   = null,
    healthy_area    = null,
    treatment       = {},
  } = result;

  const plant = predicted_class.includes("_")
    ? predicted_class.split("_")[0]
    : "Plant";

  const sevKey  = getSeverity(confNum(confidence), predicted_class);
  const sevCfg  = SEVERITY_CFG[sevKey] || SEVERITY_CFG.medium;
  const confRatio = Math.min(confNum(confidence), 1);

  const hasSegmentation = infected_area != null;
  const hasTreatment    = treatment && Object.keys(treatment).length > 0;

  const onShare = async () => {
    await Share.share({
      message: `PlantSight: ${predicted_class.replace(/_/g, " ")} — ${fmtConf(confidence)} confidence. Severity: ${sevCfg.label}. Mode: ${cfg.label}.`,
    });
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#080d08" />

      {/* ── Header ─────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>{"<"} Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Analysis Result</Text>
        <TouchableOpacity onPress={onShare} style={s.shareBtn}>
          <Text style={s.shareBtnText}>Share</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Image card ─────────────────────── */}
        <View style={[s.imageCard, { borderColor: sevCfg.color + "55" }]}>
          {imageUri
            ? <Image source={{ uri: imageUri }} style={s.imagePreview} resizeMode="cover" />
            : (
              <View style={[s.imagePlaceholder, { backgroundColor: sevCfg.bg }]}>
                <Text style={[s.imagePlaceholderText, { color: sevCfg.color }]}>PS</Text>
              </View>
            )
          }

          {/* Top-right badge — no emoji, uses text tag */}
          {hasSegmentation && (
            <View style={s.infectedBadge}>
              <View style={s.infectedTag}>
                <Text style={s.infectedTagText}>INF</Text>
              </View>
              <Text style={s.infectedBadgeLabel}>
                {fmtConf((infected_area ?? 0) * 100)} infected
              </Text>
            </View>
          )}

          {/* Severity banner */}
          <View style={[s.severityBanner, { backgroundColor: sevCfg.color }]}>
            <Text style={s.severityBannerText}>{sevCfg.label}</Text>
          </View>
        </View>

        {/* ── Diagnosis card ─────────────────── */}
        <View style={s.card}>
          <Text style={s.plantLabel}>{plant.toUpperCase()}</Text>
          <Text style={s.diseaseName}>{predicted_class.replace(/_/g, " ")}</Text>

          <View style={s.confLabelRow}>
            <Text style={s.confLabelText}>Confidence</Text>
            <Text style={[s.confValueText, { color: sevCfg.color }]}>{fmtConf(confidence)}</Text>
          </View>
          <View style={s.confTrack}>
            <View style={[s.confFill, { width: `${confRatio * 100}%`, backgroundColor: sevCfg.color }]} />
          </View>

          {/* Top-3 chips */}
          {top3.length > 0 && (
            <View style={s.chipRow}>
              {top3.map((item, i) => (
                <View
                  key={i}
                  style={[s.chip,
                    i === 0
                      ? { backgroundColor: sevCfg.bg,              borderColor: sevCfg.color + "77" }
                      : { backgroundColor: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.10)" },
                  ]}
                >
                  <Text style={[s.chipText, { color: i === 0 ? sevCfg.color : "rgba(232,245,233,0.45)" }]}>
                    {String(item.label ?? item.class_name ?? "?").replace(/_/g, " ")} {" "}{fmtConf(item.confidence ?? item.prob)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Mode / latency meta row — all text, no emoji */}
          <View style={s.divider} />
          <View style={s.metaRow}>
            <View style={[s.metaTag, { backgroundColor: cfg.color + "18", borderColor: cfg.color + "44" }]}>
              <Text style={[s.metaTagText, { color: cfg.color }]}>CLS</Text>
            </View>
            {mode !== "edge" && (
              <View style={[s.metaTag, { backgroundColor: "#ab47bc18", borderColor: "#ab47bc44" }]}>
                <Text style={[s.metaTagText, { color: "#ab47bc" }]}>SEG</Text>
              </View>
            )}
            <View style={[s.modePill, { backgroundColor: cfg.color + "18", borderColor: cfg.color + "55" }]}>
              <View style={[s.modePillDot, { backgroundColor: cfg.color + "30" }]}>
                <Text style={[s.modePillDotText, { color: cfg.color }]}>{cfg.tag}</Text>
              </View>
              <Text style={[s.modePillLabel, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
            <Text style={s.latencyText}>{Math.round(latency_ms)}ms</Text>
          </View>
        </View>

        {/* ── Segmentation card ──────────────── */}
        {hasSegmentation && (
          <View style={s.card}>
            <View style={s.sectionHeader}>
              {/* Text badge instead of emoji */}
              <View style={[s.sectionBadge, { backgroundColor: "#ab47bc20", borderColor: "#ab47bc44" }]}>
                <Text style={[s.sectionBadgeText, { color: "#ab47bc" }]}>SEG</Text>
              </View>
              <Text style={s.sectionTitle}>Segmentation</Text>
            </View>

            <View style={s.segRow}>
              <View>
                <Text style={[s.segBig, { color: sevCfg.color }]}>
                  {fmtConf((infected_area ?? 0) * 100)}
                </Text>
                <Text style={s.segSmall}>INFECTED AREA</Text>
              </View>
              <View>
                <Text style={[s.segBig, { color: "#00e676" }]}>
                  {fmtConf((healthy_area ?? 0) * 100)}
                </Text>
                <Text style={s.segSmall}>HEALTHY AREA</Text>
              </View>
              <View style={{ marginLeft: "auto", alignItems: "flex-end" }}>
                <Text style={s.segSmall}>MODEL</Text>
                <Text style={[s.segModelVal, { color: "#ab47bc" }]}>SAM</Text>
              </View>
            </View>

            <View style={s.segBar}>
              <View style={[s.segBarFill, { flex: infected_area ?? 0, backgroundColor: sevCfg.color }]} />
              <View style={[s.segBarFill, { flex: healthy_area  ?? 0, backgroundColor: "#00e676"    }]} />
            </View>
            <View style={s.segBarLabels}>
              <Text style={[s.segBarLabel, { color: sevCfg.color }]}>Infected</Text>
              <Text style={[s.segBarLabel, { color: "#00e676"    }]}>Healthy</Text>
            </View>
          </View>
        )}

        {/* ── Treatment card ─────────────────── */}
        <View style={s.card}>
          <View style={s.sectionHeader}>
            {/* Text badge instead of emoji */}
            <View style={[s.sectionBadge, { backgroundColor: "#42a5f520", borderColor: "#42a5f544" }]}>
              <Text style={[s.sectionBadgeText, { color: "#42a5f5" }]}>RX</Text>
            </View>
            <Text style={s.sectionTitle}>Treatment Plan</Text>
            <View style={[s.severityChip, { borderColor: sevCfg.color, backgroundColor: sevCfg.bg }]}>
              <Text style={[s.severityChipText, { color: sevCfg.color }]}>{sevCfg.label}</Text>
            </View>
          </View>

          {hasTreatment ? (
            <>
              {treatment.cause      && <TreatRow k="Cause"      v={treatment.cause}      />}
              {treatment.immediate  && <TreatRow k="Immediate"  v={treatment.immediate}  />}
              {treatment.chemical   && <TreatRow k="Chemical"   v={treatment.chemical}   />}
              {treatment.organic    && <TreatRow k="Organic"    v={treatment.organic}    />}
              {treatment.prevention && <TreatRow k="Prevention" v={treatment.prevention} last />}
            </>
          ) : (
            <View style={s.noTreat}>
              <Text style={s.noTreatTitle}>Treatment data unavailable in mock mode</Text>
              <Text style={s.noTreatSub}>
                Connect backend with real model weights to get the full treatment plan
              </Text>
            </View>
          )}
        </View>

        {/* ── New scan button ────────────────── */}
        <TouchableOpacity style={s.newScanBtn} onPress={() => navigation.goBack()}>
          <Text style={s.newScanText}>New Scan</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

function TreatRow({ k, v, last }) {
  return (
    <View style={[s.treatRow, last && { borderBottomWidth: 0 }]}>
      <Text style={s.treatKey}>{k}</Text>
      <Text style={s.treatVal}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: "#080d08" },
  scroll:            { padding: 18, paddingBottom: 52 },

  /* header */
  header:            { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                       paddingHorizontal: 18, paddingVertical: 12,
                       borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)" },
  backBtn:           { padding: 6 },
  backText:          { color: "#00e676", fontWeight: "700", fontSize: 15 },
  headerTitle:       { color: "#e8f5e9", fontWeight: "800", fontSize: 16 },
  shareBtn:          { paddingHorizontal: 12, paddingVertical: 6,
                       backgroundColor: "rgba(0,230,118,0.10)", borderRadius: 20,
                       borderWidth: 1, borderColor: "rgba(0,230,118,0.25)" },
  shareBtnText:      { color: "#00e676", fontWeight: "700", fontSize: 13 },

  /* image card */
  imageCard:         { borderRadius: 16, overflow: "hidden", borderWidth: 1.5, marginBottom: 12 },
  imagePreview:      { width: "100%", height: 260 },
  imagePlaceholder:  { height: 180, alignItems: "center", justifyContent: "center" },
  imagePlaceholderText: { fontSize: 28, fontWeight: "900" },

  infectedBadge:     { position: "absolute", top: 10, right: 10,
                       flexDirection: "row", alignItems: "center", gap: 6,
                       backgroundColor: "rgba(8,13,8,0.82)", paddingHorizontal: 10,
                       paddingVertical: 5, borderRadius: 20,
                       borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  infectedTag:       { width: 24, height: 24, borderRadius: 5,
                       backgroundColor: "rgba(255,112,67,0.22)", borderWidth: 1,
                       borderColor: "rgba(255,112,67,0.45)",
                       alignItems: "center", justifyContent: "center" },
  infectedTagText:   { color: "#ff7043", fontSize: 8, fontWeight: "900", letterSpacing: 0.3 },
  infectedBadgeLabel:{ color: "#e8f5e9", fontSize: 12, fontWeight: "600" },

  severityBanner:    { paddingVertical: 10, alignItems: "center" },
  severityBannerText:{ color: "#080d08", fontWeight: "900", fontSize: 14, letterSpacing: 3 },

  /* card */
  card:              { backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1,
                       borderColor: "rgba(255,255,255,0.08)", borderRadius: 14,
                       padding: 16, marginBottom: 12 },

  /* diagnosis */
  plantLabel:        { fontSize: 10, color: "rgba(232,245,233,0.35)", fontWeight: "700",
                       letterSpacing: 0.14, textTransform: "uppercase", marginBottom: 4 },
  diseaseName:       { fontSize: 21, fontWeight: "800", color: "#e8f5e9", marginBottom: 16, lineHeight: 27 },

  confLabelRow:      { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  confLabelText:     { fontSize: 12, color: "rgba(232,245,233,0.4)", fontWeight: "600" },
  confValueText:     { fontSize: 13, fontWeight: "800" },
  confTrack:         { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)",
                       overflow: "hidden", marginBottom: 14 },
  confFill:          { height: "100%", borderRadius: 3 },

  chipRow:           { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip:              { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  chipText:          { fontSize: 11, fontWeight: "600" },

  divider:           { height: 1, backgroundColor: "rgba(255,255,255,0.07)", marginVertical: 14 },
  metaRow:           { flexDirection: "row", alignItems: "center", gap: 8 },
  metaTag:           { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  metaTagText:       { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  modePill:          { flexDirection: "row", alignItems: "center", gap: 5,
                       paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  modePillDot:       { width: 16, height: 16, borderRadius: 4, alignItems: "center", justifyContent: "center" },
  modePillDotText:   { fontSize: 8, fontWeight: "900" },
  modePillLabel:     { fontSize: 11, fontWeight: "700" },
  latencyText:       { marginLeft: "auto", fontSize: 12, color: "rgba(232,245,233,0.35)", fontWeight: "600" },

  /* section header shared */
  sectionHeader:     { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  sectionBadge:      { width: 34, height: 34, borderRadius: 8, borderWidth: 1,
                       alignItems: "center", justifyContent: "center" },
  sectionBadgeText:  { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  sectionTitle:      { fontSize: 15, fontWeight: "800", color: "#e8f5e9", flex: 1 },

  /* segmentation */
  segRow:            { flexDirection: "row", alignItems: "flex-end", gap: 20, marginBottom: 14 },
  segBig:            { fontSize: 28, fontWeight: "900", lineHeight: 32 },
  segSmall:          { fontSize: 9, color: "rgba(232,245,233,0.35)", fontWeight: "700", letterSpacing: 0.1 },
  segModelVal:       { fontSize: 14, fontWeight: "900", letterSpacing: 1, marginTop: 2 },
  segBar:            { height: 8, borderRadius: 4, overflow: "hidden", flexDirection: "row" },
  segBarFill:        { height: "100%" },
  segBarLabels:      { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
  segBarLabel:       { fontSize: 10, fontWeight: "600" },

  /* treatment */
  severityChip:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1.5 },
  severityChipText:  { fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  treatRow:          { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  treatKey:          { fontSize: 10, color: "rgba(232,245,233,0.35)", fontWeight: "700",
                       letterSpacing: 0.1, textTransform: "uppercase", marginBottom: 4 },
  treatVal:          { fontSize: 13, color: "rgba(232,245,233,0.8)", lineHeight: 19 },
  noTreat:           { paddingVertical: 16, alignItems: "center" },
  noTreatTitle:      { color: "rgba(232,245,233,0.4)", fontWeight: "700", fontSize: 13,
                       textAlign: "center", marginBottom: 6 },
  noTreatSub:        { color: "rgba(232,245,233,0.22)", fontSize: 11, textAlign: "center",
                       lineHeight: 17, paddingHorizontal: 16 },

  /* new scan */
  newScanBtn:        { backgroundColor: "rgba(0,230,118,0.10)", borderWidth: 1.5,
                       borderColor: "rgba(0,230,118,0.30)", borderRadius: 14,
                       padding: 18, alignItems: "center", marginTop: 8 },
  newScanText:       { color: "#00e676", fontSize: 16, fontWeight: "800" },
});
