import { useState } from "react";
import { View, StyleSheet } from "react-native";
import HomeScreen   from "./src/screens/HomeScreen";
import CameraScreen from "./src/screens/CameraScreen";
import ResultScreen from "./src/screens/ResultScreen";

export default function App() {
  const [screen, setScreen] = useState("Home");
  const [params, setParams]  = useState({});

  const navigation = {
    navigate: (name, p = {}) => { setParams(p); setScreen(name); },
    goBack:   ()             => { setScreen("Home"); setParams({}); },
  };

  const route = { params };

  return (
    <View style={styles.root}>
      {screen === "Home"   && <HomeScreen   navigation={navigation} route={route} />}
      {screen === "Camera" && <CameraScreen navigation={navigation} route={route} />}
      {screen === "Result" && <ResultScreen navigation={navigation} route={route} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#080d08" },
});
