import {
  View, Text, TouchableOpacity, Image,
  ActivityIndicator, StyleSheet, Alert,
  ScrollView, SafeAreaView, StatusBar,
} from "react-native";
import { useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { diagnoseImage, uriToBlob } from "../api/plantApi";
import { runEdgeInference } from "../utils/edgeInference";
import { buildHistoryRecord, saveHistoryRecord } from "../utils/historyStorage";
import { Ionicons } from "@expo/vector-icons";

const MODE_CFG = {
  edge:   { color: "#00e676", label: "Edge AI",  icon: "hardware-chip" },
  hybrid: { color: "#ab47bc", label: "Hybrid",   icon: "git-merge"     },
  cloud:  { color: "#42a5f5", label: "Cloud AI", icon: "cloud"         },
};

export default function CameraScreen({ route, navigation }) {
  const { mode } = route.params;
  const cfg = MODE_CFG[mode] || MODE_CFG.cloud;

  const [imageUri, setImageUri] = useState(null);
  const [loading,  setLoading]  = useState(false);

  const pickImage = async (source) => {
    const perm = source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!perm.granted) {
      Alert.alert("Permission required", "Please grant access in Settings.");
      return;
    }

    const fn = source === "camera"
      ? ImagePicker.launchCameraAsync
      : ImagePicker.launchImageLibraryAsync;

    const result = await fn({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (!result.canceled) setImageUri(result.assets[0].uri);
  };

  const CONFIDENCE_THRESHOLD = 0.0; // disabled — INT8 model gives low raw confidence, always proceed

  const diagnose = async () => {
    if (!imageUri) return;
    setLoading(true);
    try {
      let result;
      if (mode === "edge") {
        result = await runEdgeInference(imageUri);
      } else {
        const blob = await uriToBlob(imageUri);
        result = await diagnoseImage(blob, mode);
      }

      // ── Validate: reject non-leaf images ──────────────────────────
      const conf = result.confidence > 1 ? result.confidence / 100 : result.confidence;
      if (conf < CONFIDENCE_THRESHOLD) {
        Alert.alert(
          "Image Not Recognized",
          `The model is not confident this is a plant leaf (${Math.round(conf * 100)}% confidence).\n\nPlease use a clear, well-lit photo of a single leaf.`,
          [
            { text: "Try Again", style: "cancel", onPress: () => setImageUri(null) },
            {
              text: "Continue Anyway",
              onPress: async () => {
                await saveHistoryRecord(buildHistoryRecord(result, imageUri, mode));
                navigation.navigate("Result", { result, imageUri, mode });
              },
            },
          ]
        );
        return;
      }

      // ── Save to local history ─────────────────────────────────────
      await saveHistoryRecord(buildHistoryRecord(result, imageUri, mode));

      navigation.navigate("Result", { result, imageUri, mode });
    } catch (e) {
      Alert.alert("Diagnosis failed", e.message || "Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#080d08" />

      {/* ── Header ───────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Scan Plant</Text>
        <View style={[s.modePill, { backgroundColor: cfg.color + "18", borderColor: cfg.color + "55" }]}>
          <Ionicons name={cfg.icon} size={13} color={cfg.color} />
          <Text style={[s.modePillText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Source buttons ────────────────────── */}
        <View style={s.sourceRow}>
          <TouchableOpacity style={s.sourceBtn} onPress={() => pickImage("camera")}>
            <View style={s.sourceBtnIcon}>
              <Text style={s.sourceBtnIconText}>CAM</Text>
            </View>
            <Text style={s.sourceBtnText}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.sourceBtn} onPress={() => pickImage("gallery")}>
            <View style={[s.sourceBtnIcon, { backgroundColor: "rgba(66,165,245,0.12)", borderColor: "rgba(66,165,245,0.30)" }]}>
              <Text style={[s.sourceBtnIconText, { color: "#42a5f5" }]}>IMG</Text>
            </View>
            <Text style={s.sourceBtnText}>Gallery</Text>
          </TouchableOpacity>
        </View>

        {/* ── Image preview ────────────────────── */}
        {imageUri ? (
          <View style={[s.previewWrap, { borderColor: cfg.color + "55" }]}>
            <Image source={{ uri: imageUri }} style={s.preview} resizeMode="cover" />
            <View style={[s.previewBadge, { backgroundColor: cfg.color + "22", borderColor: cfg.color + "55" }]}>
              <Ionicons name={cfg.icon} size={11} color={cfg.color} />
              <Text style={[s.previewBadgeText, { color: cfg.color }]}>
                {cfg.label} mode
              </Text>
            </View>
            <TouchableOpacity style={s.changeBtn} onPress={() => setImageUri(null)}>
              <Text style={s.changeBtnText}>Change photo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.previewEmpty}>
            <View style={s.previewEmptyOrb}>
              <Text style={s.previewEmptyOrbText}>PS</Text>
            </View>
            <Text style={s.previewEmptyTitle}>No photo selected</Text>
            <Text style={s.previewEmptyDesc}>
              Use the buttons above to take or select a clear leaf photo
            </Text>
          </View>
        )}

        {/* ── Tips card ────────────────────────── */}
        <View style={s.tipsCard}>
          <View style={s.tipsTitleRow}>
            <View style={s.tipsDot} />
            <Text style={s.tipsTitle}>Tips for best accuracy</Text>
          </View>
          {[
            "Fill the frame with a single leaf",
            "Use natural light, avoid flash",
            "Keep camera steady — no blur",
            "Show both healthy and affected areas",
          ].map((tip, i) => (
            <Text key={i} style={s.tipItem}>· {tip}</Text>
          ))}
        </View>

        {/* ── Diagnose button ───────────────────── */}
        {imageUri && !loading && (
          <TouchableOpacity
            style={[s.diagnoseBtn, { backgroundColor: cfg.color, shadowColor: cfg.color }]}
            onPress={diagnose}
          >
            <Text style={s.diagnoseBtnText}>Diagnose Plant</Text>
          </TouchableOpacity>
        )}

        {/* ── Loading ───────────────────────────── */}
        {loading && (
          <View style={s.loadingBox}>
            <ActivityIndicator size="large" color={cfg.color} />
            <Text style={[s.loadingTitle, { color: cfg.color }]}>
              {mode === "edge" ? "Running on-device..." : `Running ${cfg.label}...`}
            </Text>
            <Text style={s.loadingDesc}>
              {mode === "edge"
                ? "Classifying on device — no internet needed"
                : "Sending to server for analysis"}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: "#080d08" },
  scroll:           { padding: 18, paddingBottom: 48 },

  /* header */
  header:           { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                      paddingHorizontal: 18, paddingVertical: 12,
                      borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)" },
  backBtn:          { padding: 6 },
  backText:         { color: "#00e676", fontWeight: "700", fontSize: 15 },
  headerTitle:      { color: "#e8f5e9", fontWeight: "800", fontSize: 16 },
  modePill:         { flexDirection: "row", alignItems: "center", gap: 6,
                      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  modePillText:     { fontSize: 11, fontWeight: "700" },

  /* source buttons */
  sourceRow:        { flexDirection: "row", gap: 12, marginBottom: 16 },
  sourceBtn:        { flex: 1, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.10)", borderRadius: 12,
                      paddingVertical: 18, alignItems: "center", gap: 8 },
  sourceBtnIcon:    { width: 44, height: 44, borderRadius: 22,
                      backgroundColor: "rgba(0,230,118,0.12)", borderWidth: 1,
                      borderColor: "rgba(0,230,118,0.30)", alignItems: "center", justifyContent: "center" },
  sourceBtnIconText:{ color: "#00e676", fontWeight: "900", fontSize: 10, letterSpacing: 0.5 },
  sourceBtnText:    { color: "#e8f5e9", fontWeight: "700", fontSize: 13 },

  /* preview */
  previewWrap:      { borderRadius: 14, overflow: "hidden", borderWidth: 1.5,
                      marginBottom: 16, backgroundColor: "#0d150d" },
  preview:          { width: "100%", height: 280 },
  previewBadge:     { position: "absolute", top: 10, left: 10, paddingHorizontal: 10,
                      paddingVertical: 4, borderRadius: 20, borderWidth: 1,
                      flexDirection: "row", alignItems: "center", gap: 5 },
  previewBadgeText: { fontSize: 11, fontWeight: "700" },
  changeBtn:        { position: "absolute", bottom: 10, right: 10,
                      backgroundColor: "rgba(8,13,8,0.80)", paddingHorizontal: 12,
                      paddingVertical: 6, borderRadius: 20,
                      borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  changeBtnText:    { color: "rgba(232,245,233,0.7)", fontSize: 11, fontWeight: "600" },

  previewEmpty:     { backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.07)", borderRadius: 14, borderStyle: "dashed",
                      height: 220, alignItems: "center", justifyContent: "center",
                      marginBottom: 16, gap: 10 },
  previewEmptyOrb:  { width: 56, height: 56, borderRadius: 28,
                      backgroundColor: "rgba(0,230,118,0.08)", borderWidth: 1,
                      borderColor: "rgba(0,230,118,0.20)", alignItems: "center", justifyContent: "center" },
  previewEmptyOrbText: { color: "rgba(0,230,118,0.4)", fontWeight: "900", fontSize: 14, letterSpacing: 1 },
  previewEmptyTitle:{ color: "rgba(232,245,233,0.4)", fontWeight: "700", fontSize: 15 },
  previewEmptyDesc: { color: "rgba(232,245,233,0.25)", fontSize: 12, textAlign: "center",
                      paddingHorizontal: 32, lineHeight: 18 },

  /* tips */
  tipsCard:         { backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.07)", borderRadius: 12,
                      padding: 14, marginBottom: 16 },
  tipsTitleRow:     { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  tipsDot:          { width: 6, height: 6, borderRadius: 3, backgroundColor: "#00e676" },
  tipsTitle:        { color: "#e8f5e9", fontWeight: "700", fontSize: 13 },
  tipItem:          { color: "rgba(232,245,233,0.5)", fontSize: 12, lineHeight: 22 },

  /* diagnose */
  diagnoseBtn:      { borderRadius: 14, padding: 18, alignItems: "center",
                      shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 4 },
                      marginBottom: 12 },
  diagnoseBtnText:  { color: "#080d08", fontSize: 17, fontWeight: "800", letterSpacing: 0.2 },

  /* loading */
  loadingBox:       { alignItems: "center", gap: 10, padding: 24 },
  loadingTitle:     { fontSize: 15, fontWeight: "700" },
  loadingDesc:      { color: "rgba(232,245,233,0.4)", fontSize: 12, textAlign: "center" },
});
