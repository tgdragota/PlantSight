import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, SafeAreaView, StatusBar, Animated, Easing,
} from "react-native";
import { useState, useEffect, useCallback, useRef } from "react";
import { checkHealth } from "../api/plantApi";

const MODES = [
  {
    key:   "edge",
    tag:   "E",
    label: "Edge AI",
    desc:  "On-device · Fully offline · Fastest",
    color: "#00e676",
    bg:    "rgba(0,230,118,0.08)",
    border:"rgba(0,230,118,0.30)",
  },
  {
    key:   "hybrid",
    tag:   "H",
    label: "Hybrid",
    desc:  "Edge classify + Cloud segment",
    color: "#ab47bc",
    bg:    "rgba(171,71,188,0.08)",
    border:"rgba(171,71,188,0.30)",
  },
  {
    key:   "cloud",
    tag:   "C",
    label: "Cloud AI",
    desc:  "Full server GPU inference",
    color: "#42a5f5",
    bg:    "rgba(66,165,245,0.08)",
    border:"rgba(66,165,245,0.30)",
  },
];

export default function HomeScreen({ navigation }) {
  const [mode, setMode]       = useState("cloud");
  const [serverUp, setServer] = useState(null);

  // ── Animation refs ────────────────────────────
  const ring1Scale = useRef(new Animated.Value(1)).current;
  const ring2Scale = useRef(new Animated.Value(1)).current;
  const ring1Opacity = useRef(new Animated.Value(0.15)).current;
  const ring2Opacity = useRef(new Animated.Value(0.25)).current;
  const scanY       = useRef(new Animated.Value(-18)).current;
  const corePulse   = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Outer ring — slow breathe
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ring1Scale,   { toValue: 1.12, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(ring1Opacity, { toValue: 0.30, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(ring1Scale,   { toValue: 1.00, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(ring1Opacity, { toValue: 0.12, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ])
    ).start();

    // Middle ring — offset phase
    Animated.loop(
      Animated.sequence([
        Animated.delay(500),
        Animated.parallel([
          Animated.timing(ring2Scale,   { toValue: 1.10, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(ring2Opacity, { toValue: 0.42, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(ring2Scale,   { toValue: 1.00, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(ring2Opacity, { toValue: 0.22, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ])
    ).start();

    // Core glow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(corePulse, { toValue: 1.08, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(corePulse, { toValue: 1.00, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    // Scan line — sweep up and down inside inner ring
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanY, { toValue: 18, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(scanY, { toValue: -18, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const checkServer = useCallback(async () => {
    const up = await checkHealth();
    setServer(up);
    if (!up) setMode("edge");
  }, []);

  useEffect(() => { checkServer(); }, [checkServer]);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#080d08" />

      {/* ── Header ───────────────────────────── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.headerLogo}>PS</Text>
          <View>
            <Text style={s.headerTitle}>PlantSight</Text>
            <Text style={s.headerSub}>AI Research Platform</Text>
          </View>
        </View>
        <View style={[s.statusDot, {
          backgroundColor: serverUp === null ? "#ffab40" : serverUp ? "#00e676" : "#ff5252",
          shadowColor:     serverUp === null ? "#ffab40" : serverUp ? "#00e676" : "#ff5252",
        }]} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero banner ──────────────────────── */}
        <View style={s.hero}>

          {/* Animated scan orb */}
          <View style={s.orbContainer}>
            {/* Outer pulsing ring */}
            <Animated.View style={[s.ring1, {
              transform: [{ scale: ring1Scale }],
              opacity: ring1Opacity,
            }]} />
            {/* Middle pulsing ring */}
            <Animated.View style={[s.ring2, {
              transform: [{ scale: ring2Scale }],
              opacity: ring2Opacity,
            }]} />
            {/* Inner core with scan line */}
            <Animated.View style={[s.ring3, { transform: [{ scale: corePulse }] }]}>
              <Text style={s.heroAI}>AI</Text>
              {/* Scan line sweeps inside */}
              <Animated.View style={[s.scanLine, {
                transform: [{ translateY: scanY }],
              }]} />
            </Animated.View>
          </View>

          <View style={s.heroText}>
            <View style={s.heroTag}>
              <Text style={s.heroTagText}>Master's Thesis · AI Research</Text>
            </View>
            <Text style={s.heroTitle}>Detect Plant{"\n"}Disease with{" "}
              <Text style={s.heroGreen}>AI</Text>
            </Text>
            <Text style={s.heroSub}>
              Compare Edge, Hybrid & Cloud inference in real-time
            </Text>
          </View>
        </View>

        {/* ── Server status ────────────────────── */}
        <View style={[s.statusBar, {
          backgroundColor: serverUp ? "rgba(0,230,118,0.08)" : serverUp === false ? "rgba(255,82,82,0.08)" : "rgba(255,171,64,0.08)",
          borderColor:     serverUp ? "rgba(0,230,118,0.25)" : serverUp === false ? "rgba(255,82,82,0.25)" : "rgba(255,171,64,0.25)",
        }]}>
          <Text style={s.statusText}>
            {serverUp === null ? "Checking server..." : serverUp ? "API online — all modes available" : "Server offline — Edge mode only"}
          </Text>
        </View>

        {/* ── Mode selector ────────────────────── */}
        <Text style={s.sectionLabel}>SELECT INFERENCE MODE</Text>
        {MODES.map((m) => {
          const disabled = m.key !== "edge" && !serverUp;
          const active   = mode === m.key;
          return (
            <TouchableOpacity
              key={m.key}
              disabled={disabled}
              onPress={() => setMode(m.key)}
              style={[s.modeCard,
                { borderColor: active ? m.border : "rgba(255,255,255,0.08)",
                  backgroundColor: active ? m.bg : "rgba(255,255,255,0.03)" },
                disabled && s.modeDisabled,
              ]}
            >
              <View style={[s.modeAccent, { backgroundColor: m.color }]} />
              <View style={[s.modeTag, { backgroundColor: m.color + "22", borderColor: m.color + "55" }]}>
                <Text style={[s.modeTagText, { color: m.color }]}>{m.tag}</Text>
              </View>
              <View style={s.modeBody}>
                <Text style={[s.modeLabel, { color: active ? m.color : "#e8f5e9" }]}>{m.label}</Text>
                <Text style={s.modeDesc} numberOfLines={1}>{m.desc}</Text>
              </View>
              {active && (
                <View style={[s.modeCheck, { backgroundColor: m.color }]}>
                  <Text style={s.modeCheckText}>{"✓"}</Text>
                </View>
              )}
              {disabled && (
                <View style={s.modeLockBox}>
                  <Text style={s.modeLockText}>OFF</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {/* ── CTA button ───────────────────────── */}
        <TouchableOpacity
          style={s.cameraBtn}
          onPress={() => navigation.navigate("Camera", { mode })}
        >
          <Text style={s.cameraBtnText}>Scan a Plant</Text>
        </TouchableOpacity>

        <Text style={s.hint}>
          Tomato · Potato · Corn · Grape · Apple · Pepper · Cherry · Peach
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: "#080d08" },
  scroll:       { padding: 18, paddingBottom: 48 },

  /* header */
  header:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  paddingHorizontal: 20, paddingVertical: 14,
                  borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)",
                  backgroundColor: "rgba(8,13,8,0.95)" },
  headerLeft:   { flexDirection: "row", alignItems: "center", gap: 10 },
  headerLogo:   { width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(0,230,118,0.15)",
                  borderWidth: 1, borderColor: "rgba(0,230,118,0.3)",
                  textAlign: "center", lineHeight: 32,
                  fontSize: 11, fontWeight: "900", color: "#00e676", letterSpacing: 0.5,
                  overflow: "hidden" },
  headerTitle:  { fontSize: 19, fontWeight: "800", color: "#00e676", letterSpacing: -0.5 },
  headerSub:    { fontSize: 9, color: "rgba(232,245,233,0.35)", textTransform: "uppercase", letterSpacing: 0.12, marginTop: 1 },
  statusDot:    { width: 9, height: 9, borderRadius: 5, shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },

  /* hero */
  hero:         { flexDirection: "row", alignItems: "center", gap: 16,
                  backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 16,
                  borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
                  padding: 20, marginBottom: 14 },

  /* animated orb */
  orbContainer: { width: 88, height: 88, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  ring1:        { position: "absolute", width: 88, height: 88, borderRadius: 44,
                  borderWidth: 1, borderColor: "#00e676" },
  ring2:        { position: "absolute", width: 66, height: 66, borderRadius: 33,
                  borderWidth: 1.5, borderColor: "#00e676" },
  ring3:        { width: 46, height: 46, borderRadius: 23,
                  borderWidth: 1.5, borderColor: "rgba(0,230,118,0.60)",
                  backgroundColor: "rgba(0,230,118,0.10)",
                  alignItems: "center", justifyContent: "center",
                  overflow: "hidden" },
  heroAI:       { fontSize: 14, color: "#00e676", fontWeight: "900", letterSpacing: 1 },
  scanLine:     { position: "absolute", left: 3, right: 3, height: 1.5,
                  backgroundColor: "rgba(0,230,118,0.85)",
                  shadowColor: "#00e676", shadowOpacity: 0.9, shadowRadius: 4,
                  shadowOffset: { width: 0, height: 0 } },

  heroText:     { flex: 1 },
  heroTag:      { backgroundColor: "rgba(0,230,118,0.10)", borderWidth: 1, borderColor: "rgba(0,230,118,0.25)",
                  borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start", marginBottom: 8 },
  heroTagText:  { fontSize: 9, color: "#00e676", fontWeight: "700", letterSpacing: 0.1, textTransform: "uppercase" },
  heroTitle:    { fontSize: 22, fontWeight: "800", color: "#e8f5e9", lineHeight: 28, letterSpacing: -0.5, marginBottom: 6 },
  heroGreen:    { color: "#00e676" },
  heroSub:      { fontSize: 12, color: "rgba(232,245,233,0.5)", lineHeight: 17 },

  /* status */
  statusBar:    { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 20 },
  statusText:   { fontSize: 12, color: "rgba(232,245,233,0.7)", textAlign: "center", fontWeight: "600" },

  /* modes */
  sectionLabel: { fontSize: 10, color: "rgba(232,245,233,0.3)", fontWeight: "700",
                  letterSpacing: 0.14, textTransform: "uppercase", marginBottom: 10 },
  modeCard:     { flexDirection: "row", alignItems: "center", borderRadius: 12,
                  borderWidth: 1, padding: 14, marginBottom: 10, gap: 12 },
  modeDisabled: { opacity: 0.3 },
  modeAccent:   { width: 3, height: 44, borderRadius: 2 },
  modeTag:      { width: 34, height: 34, borderRadius: 8, borderWidth: 1,
                  alignItems: "center", justifyContent: "center" },
  modeTagText:  { fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
  modeBody:     { flex: 1 },
  modeLabel:    { fontSize: 15, fontWeight: "700", marginBottom: 3 },
  modeDesc:     { fontSize: 11, color: "rgba(232,245,233,0.45)" },
  modeCheck:    { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  modeCheckText:{ color: "#080d08", fontWeight: "900", fontSize: 14 },
  modeLockBox:  { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
                  backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)" },
  modeLockText: { fontSize: 9, color: "rgba(232,245,233,0.3)", fontWeight: "700", letterSpacing: 0.5 },

  /* CTA */
  cameraBtn:    { backgroundColor: "#00e676", borderRadius: 14, padding: 18,
                  alignItems: "center", marginTop: 20, marginBottom: 16,
                  shadowColor: "#00e676", shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 4 } },
  cameraBtnText:{ color: "#080d08", fontSize: 17, fontWeight: "800", letterSpacing: 0.2 },
  hint:         { textAlign: "center", color: "rgba(232,245,233,0.25)", fontSize: 11, lineHeight: 18 },
});
