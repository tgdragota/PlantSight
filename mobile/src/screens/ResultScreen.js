import {
  View, Text, Image, TouchableOpacity, Modal, TextInput, Alert,
  ScrollView, SafeAreaView, StatusBar, StyleSheet, Share, ActivityIndicator,
} from "react-native";
import { useState } from "react";
import { API_BASE } from "../api/plantApi";
import AsyncStorage from "@react-native-async-storage/async-storage";

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

async function getDeviceId() {
  const KEY = "plantsight_device_id";
  let id = await AsyncStorage.getItem(KEY);
  if (!id) {
    id = `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await AsyncStorage.setItem(KEY, id);
  }
  return id;
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
    _mock           = true,
  } = result;

  const plant = predicted_class.includes("_")
    ? predicted_class.split("_")[0]
    : "Plant";

  const sevKey  = getSeverity(confNum(confidence), predicted_class);
  const sevCfg  = SEVERITY_CFG[sevKey] || SEVERITY_CFG.medium;
  const confRatio = Math.min(confNum(confidence), 1);

  const hasSegmentation = infected_area != null;
  const hasTreatment    = treatment && Object.keys(treatment).length > 0;

  // ── Confirm Diagnosis state ──────────────────────────────────────
  const [confirmModal, setConfirmModal] = useState(false);
  const [isWrong,      setIsWrong]      = useState(false);
  const [correction,   setCorrection]   = useState("");
  const [confirming,   setConfirming]   = useState(false);
  const [confirmed,    setConfirmed]    = useState(false); // already submitted

  const openConfirm = () => {
    setIsWrong(false);
    setCorrection("");
    setConfirmModal(true);
  };

  const submitConfirm = async (wasCorrect) => {
    setConfirming(true);
    try {
      const deviceId = await getDeviceId();
      const confirmedLabel = wasCorrect ? predicted_class : correction.trim();

      if (!wasCorrect && !confirmedLabel) {
        Alert.alert("Please enter the correct diagnosis first.");
        setConfirming(false);
        return;
      }

      const formData = new FormData();
      formData.append("image", {
        uri:  imageUri,
        name: "plant.jpg",
        type: "image/jpeg",
      });
      formData.append("confirmed_label", confirmedLabel);
      formData.append("original_label",  predicted_class);
      formData.append("device_id",       deviceId);
      formData.append("confidence",      String(confNum(confidence)));
      formData.append("mode",            mode || "cloud");

      const res = await fetch(`${API_BASE}/api/confirm`, {
        method:  "POST",
        body:    formData,
        headers: { Accept: "application/json" },
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);

      setConfirmed(true);
      setConfirmModal(false);
      Alert.alert(
        "Thank you!",
        wasCorrect
          ? "Diagnosis confirmed. This sample will help improve the model."
          : `Correction saved: "${confirmedLabel.replace(/_/g, " ")}". Thank you for the feedback!`
      );
    } catch (e) {
      Alert.alert("Error", `Could not save: ${e.message}`);
    } finally {
      setConfirming(false);
    }
  };

  const onShare = async () => {
    const disease = predicted_class.replace(/_/g, " ");
    const lines   = [
      `PlantSight — Analysis Report`,
      `──────────────────────────`,
      `Disease   : ${disease}`,
      `Confidence: ${fmtConf(confidence)}`,
      `Severity  : ${sevCfg.label}`,
      `Mode      : ${cfg.label}${mode === "edge" && !_mock ? " (TFLite on-device)" : ""}`,
      `Latency   : ${Math.round(latency_ms)} ms`,
    ];
    if (top3.length > 1) {
      lines.push(`──────────────────────────`);
      lines.push(`Top predictions:`);
      top3.forEach((t, i) => {
        const lbl = String(t.label ?? t.class_name ?? "?").replace(/_/g, " ");
        lines.push(`  ${i + 1}. ${lbl} — ${fmtConf(t.confidence ?? t.prob)}`);
      });
    }
    if (treatment?.cause)      { lines.push(`──────────────────────────`); lines.push(`Cause      : ${treatment.cause}`); }
    if (treatment?.immediate)  lines.push(`Immediate  : ${treatment.immediate}`);
    if (treatment?.chemical)   lines.push(`Chemical   : ${treatment.chemical}`);
    if (treatment?.organic)    lines.push(`Organic    : ${treatment.organic}`);
    if (treatment?.prevention) lines.push(`Prevention : ${treatment.prevention}`);
    lines.push(`──────────────────────────`);
    lines.push(`Shared from PlantSight (Master's Thesis)`);
    const sharePayload = { message: lines.join("\n") };
    if (imageUri) sharePayload.url = imageUri;
    try { await Share.share(sharePayload); } catch (e) { console.warn("[Share]", e.message); }
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

          {top3.length > 0 && (
            <View style={s.chipRow}>
              {top3.map((item, i) => (
                <View
                  key={i}
                  style={[s.chip,
                    i === 0
                      ? { backgroundColor: sevCfg.bg,               borderColor: sevCfg.color + "77" }
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
            {mode === "edge" && (
              <View style={[s.inferBadge, {
                backgroundColor: _mock ? "rgba(255,171,64,0.12)" : "rgba(0,230,118,0.12)",
                borderColor:     _mock ? "rgba(255,171,64,0.40)" : "rgba(0,230,118,0.40)",
              }]}>
                <View style={[s.inferDot, { backgroundColor: _mock ? "#ffab40" : "#00e676" }]} />
                <Text style={[s.inferText, { color: _mock ? "#ffab40" : "#00e676" }]}>
                  {_mock ? "MOCK" : "TFLite"}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Segmentation card ──────────────── */}
        {hasSegmentation && (
          <View style={s.card}>
            <View style={s.sectionHeader}>
              <View style={[s.sectionBadge, { backgroundColor: "#ab47bc20", borderColor: "#ab47bc44" }]}>
                <Text style={[s.sectionBadgeText, { color: "#ab47bc" }]}>SEG</Text>
              </View>
              <Text style={s.sectionTitle}>Segmentation</Text>
            </View>
            <View style={s.segRow}>
              <View>
                <Text style={[s.segBig, { color: sevCfg.color }]}>{fmtConf((infected_area ?? 0) * 100)}</Text>
                <Text style={s.segSmall}>INFECTED AREA</Text>
              </View>
              <View>
                <Text style={[s.segBig, { color: "#00e676" }]}>{fmtConf((healthy_area ?? 0) * 100)}</Text>
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
              <Text style={s.noTreatTitle}>No treatment data available</Text>
              <Text style={s.noTreatSub}>Make sure the backend is running for Cloud / Hybrid modes</Text>
            </View>
          )}
        </View>

        {/* ── Confirm Diagnosis button ────────── */}
        {!confirmed ? (
          <TouchableOpacity style={s.confirmBtn} onPress={openConfirm}>
            <View style={s.confirmBtnInner}>
              <View style={s.confirmIcon}>
                <Text style={s.confirmIconText}>DB</Text>
              </View>
              <View style={s.confirmBtnText}>
                <Text style={s.confirmBtnTitle}>Confirm Diagnosis</Text>
                <Text style={s.confirmBtnSub}>Help improve the AI model</Text>
              </View>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={s.confirmedBadge}>
            <Text style={s.confirmedText}>Saved to training dataset</Text>
          </View>
        )}

        {/* ── New scan button ────────────────── */}
        <TouchableOpacity style={s.newScanBtn} onPress={() => navigation.goBack()}>
          <Text style={s.newScanText}>New Scan</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* ── Confirm Modal ──────────────────────── */}
      <Modal visible={confirmModal} transparent animationType="slide" onRequestClose={() => setConfirmModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>

            <Text style={s.modalTitle}>Confirm Diagnosis</Text>
            <Text style={s.modalSub}>Your feedback helps train a better model</Text>

            <View style={s.modalDiseaseBox}>
              <Text style={s.modalDiseaseLabel}>Model predicted:</Text>
              <Text style={s.modalDiseaseName}>{predicted_class.replace(/_/g, " ")}</Text>
              <Text style={[s.modalConf, { color: sevCfg.color }]}>{fmtConf(confidence)} confidence</Text>
            </View>

            {!isWrong ? (
              <>
                <Text style={s.modalQuestion}>Is this diagnosis correct?</Text>
                <View style={s.modalBtnRow}>
                  <TouchableOpacity
                    style={[s.modalBtn, s.modalBtnYes, s.modalBtnFlex]}
                    onPress={() => submitConfirm(true)}
                    disabled={confirming}
                  >
                    {confirming
                      ? <ActivityIndicator color="#080d08" size="small" />
                      : <Text style={s.modalBtnYesText}>Yes, correct</Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.modalBtn, s.modalBtnNo, s.modalBtnFlex]}
                    onPress={() => setIsWrong(true)}
                    disabled={confirming}
                  >
                    <Text style={s.modalBtnNoText}>No, fix it</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={s.modalQuestion}>What is the correct diagnosis?</Text>
                <TextInput
                  style={s.modalInput}
                  value={correction}
                  onChangeText={setCorrection}
                  placeholder="e.g. Tomato_Early_blight"
                  placeholderTextColor="rgba(232,245,233,0.25)"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[s.modalBtn, s.modalBtnYes, { marginTop: 12 }]}
                  onPress={() => submitConfirm(false)}
                  disabled={confirming || !correction.trim()}
                >
                  {confirming
                    ? <ActivityIndicator color="#080d08" size="small" />
                    : <Text style={s.modalBtnYesText}>Save correction</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity style={s.modalBtnCancel} onPress={() => setIsWrong(false)}>
                  <Text style={s.modalBtnCancelText}>Back</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={s.modalClose} onPress={() => setConfirmModal(false)}>
              <Text style={s.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  infectedBadge:     { position: "absolute", top: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 6,
                       backgroundColor: "rgba(8,13,8,0.82)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
                       borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  infectedTag:       { width: 24, height: 24, borderRadius: 5, backgroundColor: "rgba(255,112,67,0.22)", borderWidth: 1,
                       borderColor: "rgba(255,112,67,0.45)", alignItems: "center", justifyContent: "center" },
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
  confTrack:         { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden", marginBottom: 14 },
  confFill:          { height: "100%", borderRadius: 3 },
  chipRow:           { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip:              { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  chipText:          { fontSize: 11, fontWeight: "600" },
  divider:           { height: 1, backgroundColor: "rgba(255,255,255,0.07)", marginVertical: 14 },
  metaRow:           { flexDirection: "row", alignItems: "center", gap: 8 },
  metaTag:           { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  metaTagText:       { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  modePill:          { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  modePillDot:       { width: 16, height: 16, borderRadius: 4, alignItems: "center", justifyContent: "center" },
  modePillDotText:   { fontSize: 8, fontWeight: "900" },
  modePillLabel:     { fontSize: 11, fontWeight: "700" },
  latencyText:       { marginLeft: "auto", fontSize: 12, color: "rgba(232,245,233,0.35)", fontWeight: "600" },
  inferBadge:        { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1, marginLeft: 6 },
  inferDot:          { width: 5, height: 5, borderRadius: 3 },
  inferText:         { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },

  /* section header */
  sectionHeader:     { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  sectionBadge:      { width: 34, height: 34, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
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
  treatKey:          { fontSize: 10, color: "rgba(232,245,233,0.35)", fontWeight: "700", letterSpacing: 0.1, textTransform: "uppercase", marginBottom: 4 },
  treatVal:          { fontSize: 13, color: "rgba(232,245,233,0.8)", lineHeight: 19 },
  noTreat:           { paddingVertical: 16, alignItems: "center" },
  noTreatTitle:      { color: "rgba(232,245,233,0.4)", fontWeight: "700", fontSize: 13, textAlign: "center", marginBottom: 6 },
  noTreatSub:        { color: "rgba(232,245,233,0.22)", fontSize: 11, textAlign: "center", lineHeight: 17, paddingHorizontal: 16 },

  /* confirm button */
  confirmBtn:        { backgroundColor: "rgba(255,171,64,0.08)", borderWidth: 1.5, borderColor: "rgba(255,171,64,0.35)",
                       borderRadius: 14, padding: 16, marginBottom: 10 },
  confirmBtnInner:   { flexDirection: "row", alignItems: "center", gap: 14 },
  confirmIcon:       { width: 40, height: 40, borderRadius: 10, backgroundColor: "rgba(255,171,64,0.15)",
                       borderWidth: 1, borderColor: "rgba(255,171,64,0.35)", alignItems: "center", justifyContent: "center" },
  confirmIconText:   { color: "#ffab40", fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  confirmBtnText:    { flex: 1 },
  confirmBtnTitle:   { color: "#ffab40", fontWeight: "800", fontSize: 15, marginBottom: 2 },
  confirmBtnSub:     { color: "rgba(255,171,64,0.55)", fontSize: 11 },
  confirmedBadge:    { backgroundColor: "rgba(0,230,118,0.08)", borderWidth: 1, borderColor: "rgba(0,230,118,0.25)",
                       borderRadius: 14, padding: 14, marginBottom: 10, alignItems: "center" },
  confirmedText:     { color: "#00e676", fontWeight: "700", fontSize: 13 },

  /* new scan */
  newScanBtn:        { backgroundColor: "rgba(0,230,118,0.10)", borderWidth: 1.5, borderColor: "rgba(0,230,118,0.30)",
                       borderRadius: 14, padding: 18, alignItems: "center", marginTop: 8 },
  newScanText:       { color: "#00e676", fontSize: 16, fontWeight: "800" },

  /* modal */
  modalOverlay:      { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modalBox:          { backgroundColor: "#0f1a0f", borderTopLeftRadius: 24, borderTopRightRadius: 24,
                       padding: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  modalTitle:        { fontSize: 20, fontWeight: "900", color: "#e8f5e9", marginBottom: 4 },
  modalSub:          { fontSize: 12, color: "rgba(232,245,233,0.4)", marginBottom: 20 },
  modalDiseaseBox:   { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 14, marginBottom: 20,
                       borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  modalDiseaseLabel: { fontSize: 10, color: "rgba(232,245,233,0.35)", fontWeight: "700", textTransform: "uppercase", marginBottom: 4 },
  modalDiseaseName:  { fontSize: 18, fontWeight: "800", color: "#e8f5e9", marginBottom: 4 },
  modalConf:         { fontSize: 13, fontWeight: "700" },
  modalQuestion:     { fontSize: 15, color: "#e8f5e9", fontWeight: "700", marginBottom: 16 },
  modalBtnRow:       { flexDirection: "row", gap: 12, marginBottom: 12 },
  modalBtnFlex:      { flex: 1 },
  modalBtn:          { paddingVertical: 14, borderRadius: 12, alignItems: "center", borderWidth: 1 },
  modalBtnYes:       { backgroundColor: "#00e676", borderColor: "#00e676" },
  modalBtnYesText:   { color: "#080d08", fontWeight: "900", fontSize: 15 },
  modalBtnNo:        { backgroundColor: "rgba(255,82,82,0.12)", borderColor: "rgba(255,82,82,0.40)" },
  modalBtnNoText:    { color: "#ff5252", fontWeight: "800", fontSize: 15 },
  modalInput:        { backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
                       borderRadius: 10, padding: 14, color: "#e8f5e9", fontSize: 15 },
  modalBtnCancel:    { marginTop: 10, alignItems: "center", padding: 10 },
  modalBtnCancelText:{ color: "rgba(232,245,233,0.4)", fontSize: 13 },
  modalClose:        { marginTop: 16, alignItems: "center", padding: 10 },
  modalCloseText:    { color: "rgba(232,245,233,0.3)", fontSize: 13 },
});
