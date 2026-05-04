import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { warmupEdgeModel } from "./src/utils/edgeInference";

import HomeScreen     from "./src/screens/HomeScreen";
import CameraScreen   from "./src/screens/CameraScreen";
import ResultScreen   from "./src/screens/ResultScreen";
import HistoryScreen  from "./src/screens/HistoryScreen";
import ResearchScreen from "./src/screens/ResearchScreen";

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function ScanStack() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
            <Stack.Screen name="Home"   component={HomeScreen}   />
            <Stack.Screen name="Camera" component={CameraScreen} />
            <Stack.Screen name="Result" component={ResultScreen} />
        </Stack.Navigator>
    );
}

export default function App() {
    useEffect(() => {
        // Pre-load TFLite model in background when app starts
        warmupEdgeModel().catch(() => {});
    }, []);

    return (
        <NavigationContainer>
            <Tab.Navigator
                screenOptions={{
                    headerShown: false,
                    tabBarStyle: {
                        backgroundColor     : "#0d150d",
                        borderTopColor      : "rgba(255,255,255,0.07)",
                        borderTopWidth      : 1,
                        height              : 62,
                        paddingBottom       : 8,
                        paddingTop          : 6,
                    },
                    tabBarActiveTintColor  : "#00e676",
                    tabBarInactiveTintColor: "rgba(232,245,233,0.28)",
                    tabBarLabelStyle       : { fontSize: 10, fontWeight: "700", letterSpacing: 0.1 },
                }}
            >
                <Tab.Screen name="Scan" component={ScanStack}
                            options={{ tabBarIcon: ({ color, focused }) => (
                                    <View style={{ width:30, height:30, borderRadius:8, alignItems:"center", justifyContent:"center",
                                        backgroundColor: focused ? "rgba(0,230,118,0.12)" : "transparent" }}>
                                        <Ionicons name={focused ? "leaf" : "leaf-outline"} size={20} color={color} />
                                    </View>
                                )}}
                />
                <Tab.Screen name="History" component={HistoryScreen}
                            options={{ tabBarIcon: ({ color, focused }) => (
                                    <View style={{ width:30, height:30, borderRadius:8, alignItems:"center", justifyContent:"center",
                                        backgroundColor: focused ? "rgba(0,230,118,0.12)" : "transparent" }}>
                                        <Ionicons name={focused ? "time" : "time-outline"} size={20} color={color} />
                                    </View>
                                )}}
                />
                <Tab.Screen name="Research" component={ResearchScreen}
                            options={{ tabBarIcon: ({ color, focused }) => (
                                    <View style={{ width:30, height:30, borderRadius:8, alignItems:"center", justifyContent:"center",
                                        backgroundColor: focused ? "rgba(0,230,118,0.12)" : "transparent" }}>
                                        <Ionicons name={focused ? "flask" : "flask-outline"} size={20} color={color} />
                                    </View>
                                )}}
                />
            </Tab.Navigator>
        </NavigationContainer>
    );
}