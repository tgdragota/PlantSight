/**
 * SettingsScreen — schimba URL-ul serverului fara rebuild
 *
 * Cum folosesti:
 * 1. Pornesti tunelul Cloudflare pe EC2: cloudflared tunnel run
 * 2. Copiezi URL-ul nou (ex: https://abc123.trycloudflare.com)
 * 3. Deschizi Settings in aplicatie, lipesti URL-ul, Save
 * 4. Gata — toate request-urile merg catre noul URL
 */

import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, ScrollView,
} from "react-native";
import { getApiBase, setApiBase, checkHealth } from "../api/plantApi";

export default function SettingsScreen() {
  const [url, setUrl]           = useState("");
  const [saved, setSaved]       = useState("");
  const [testing, setTesting]   = useState(false);
  const [status, setStatus]     = useState(null); // null | "ok" | "error"

  useEffect(() => {
    getApiBase().then((base) => {
      setUrl(base);
      setSaved(base);
    });
  }, []);

  async function handleSave() {
    if (!url.startsWith("http")) {
      Alert.alert("URL invalid", "URL-ul trebuie sa inceapa cu https:// sau http://");
      return;
    }
    await setApiBase(url);
    setSaved(url);
    setStatus(null);
    Alert.alert("Salvat", "URL-ul serverului a fost actualizat.");
  }

  async function handleTest() {
    await setApiBase(url); // salveaza inainte de test
    setTesting(true);
    setStatus(null);
    const ok = await checkHealth();
    setTesting(false);
    setStatus(ok ? "ok" : "error");
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Server Settings</Text>

      <Text style={styles.label}>API URL curent (salvat)</Text>
      <Text style={styles.savedUrl}>{saved}</Text>

      <Text style={styles.label}>URL nou (lipeste tunelul Cloudflare)</Text>
      <TextInput
        style={styles.input}
        value={url}
        onChangeText={setUrl}
        placeholder="https://xxxx.trycloudflare.com"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />

      <TouchableOpacity style={styles.btnTest} onPress={handleTest} disabled={testing}>
        {testing
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.btnText}>Testeaza conexiunea</Text>
        }
      </TouchableOpacity>

      {status === "ok" && (
        <Text style={styles.statusOk}>✓ Server online — conexiune OK</Text>
      )}
      {status === "error" && (
        <Text style={styles.statusErr}>✗ Server offline sau URL gresit</Text>
      )}

      <TouchableOpacity style={styles.btnSave} onPress={handleSave}>
        <Text style={styles.btnText}>Salveaza URL</Text>
      </TouchableOpacity>

      <View style={styles.hint}>
        <Text style={styles.hintTitle}>Cum obtii URL-ul tunelului:</Text>
        <Text style={styles.hintText}>
          1. Conecteaza-te la EC2 prin SSH{"\n"}
          2. Ruleaza: cloudflared tunnel run{"\n"}
          3. Copiaza URL-ul afisat (ex: https://abc123.trycloudflare.com){"\n"}
          4. Lipeste-l mai sus si apasa Salveaza
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: "#F8F9FA",
    flexGrow: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1F497D",
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#595959",
    marginBottom: 4,
    marginTop: 16,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  savedUrl: {
    fontSize: 13,
    color: "#375623",
    fontFamily: "Courier",
    backgroundColor: "#E2EFDA",
    padding: 8,
    borderRadius: 6,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#BDD7EE",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#1F497D",
    fontFamily: "Courier",
  },
  btnTest: {
    backgroundColor: "#2E75B6",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 16,
  },
  btnSave: {
    backgroundColor: "#375623",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 10,
  },
  btnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
  },
  statusOk: {
    color: "#375623",
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 8,
    fontSize: 14,
  },
  statusErr: {
    color: "#CC0000",
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 8,
    fontSize: 14,
  },
  hint: {
    marginTop: 32,
    backgroundColor: "#FFF8F5",
    borderLeftWidth: 3,
    borderLeftColor: "#833C00",
    padding: 12,
    borderRadius: 6,
  },
  hintTitle: {
    fontWeight: "bold",
    color: "#833C00",
    marginBottom: 6,
    fontSize: 13,
  },
  hintText: {
    color: "#595959",
    fontSize: 13,
    lineHeight: 20,
  },
});
