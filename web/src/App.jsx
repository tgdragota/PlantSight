import { useState, useEffect } from "react";
import Home from "./pages/Home";
import History from "./pages/History";
import Dashboard from "./pages/Dashboard";
import Benchmark from "./pages/Benchmark";
import About from "./pages/About";
import { checkHealth } from "./api/plantApi";
import "./App.css";

const INITIAL_STATS = {
  edge:   { count: 0, totalLatency: 0, totalConfidence: 0 },
  hybrid: { count: 0, totalLatency: 0, totalConfidence: 0 },
  cloud:  { count: 0, totalLatency: 0, totalConfidence: 0 },
};

const NAV = [
  { id: "home",      label: "Diagnose",  icon: "🔍" },
  { id: "benchmark", label: "Benchmark", icon: "⚡" },
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "history",   label: "History",   icon: "📋" },
  { id: "about",     label: "Research",  icon: "🔬" },
];

export default function App() {
  const [page, setPage] = useState("home");
  const [serverUp, setServerUp] = useState(null);
  const [sessionStats, setSessionStats] = useState(INITIAL_STATS);

  useEffect(() => {
    checkHealth().then(setServerUp);
    const interval = setInterval(() => checkHealth().then(setServerUp), 30_000);
    return () => clearInterval(interval);
  }, []);

  const addScanResult = (mode, latency_ms, confidence) => {
    setSessionStats((prev) => ({
      ...prev,
      [mode]: {
        count: prev[mode].count + 1,
        totalLatency: prev[mode].totalLatency + latency_ms,
        totalConfidence: prev[mode].totalConfidence + confidence,
      },
    }));
  };

  const totalScans = Object.values(sessionStats).reduce((s, m) => s + m.count, 0);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <span className="logo">🌿</span>
          <h1 className="app-title">PlantSight</h1>
          <span className="app-subtitle">AI Research Platform</span>
        </div>

        <nav className="app-nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`nav-btn ${page === item.id ? "active" : ""}`}
              onClick={() => setPage(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="header-right">
          {totalScans > 0 && (
            <div className="session-counter">
              <span className="session-count">{totalScans}</span>
              <span className="session-label">scans</span>
            </div>
          )}
          <div className="server-status">
            <span className={`status-dot ${serverUp === null ? "checking" : serverUp ? "online" : "offline"}`} />
            <span className="status-label">
              {serverUp === null ? "Checking..." : serverUp ? "API online" : "API offline"}
            </span>
          </div>
        </div>
      </header>

      <main className="app-main">
        {page === "home"      && <Home      serverUp={serverUp} sessionStats={sessionStats} onScanResult={addScanResult} />}
        {page === "benchmark" && <Benchmark serverUp={serverUp} onScanResult={addScanResult} />}
        {page === "dashboard" && <Dashboard sessionStats={sessionStats} />}
        {page === "history"   && <History />}
        {page === "about"     && <About />}
      </main>

      <footer className="app-footer">
        <span>PlantSight</span>
        <span className="footer-sep">·</span>
        <span>Master's Thesis — Edge / Hybrid / Cloud AI Comparison</span>
        <span className="footer-sep">·</span>
        <span>PlantVillage Dataset · EfficientNet-B0 · SAM</span>
      </footer>
    </div>
  );
}
