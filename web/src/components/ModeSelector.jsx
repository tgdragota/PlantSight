export default function ModeSelector({ mode, onChange, serverUp }) {
  const modes = [
    {
      key: "edge",
      label: "⚡ Edge",
      desc: "On-device · Offline · Fastest",
      disabled: false,
    },
    {
      key: "hybrid",
      label: "⚡☁ Hybrid",
      desc: "Edge classify + Cloud segment",
      disabled: !serverUp,
    },
    {
      key: "cloud",
      label: "☁ Cloud",
      desc: "Full server · Best accuracy",
      disabled: !serverUp,
    },
  ];

  return (
    <div className="mode-selector">
      <p className="mode-label">Inference mode:</p>
      <div className="mode-buttons">
        {modes.map((m) => (
          <button
            key={m.key}
            disabled={m.disabled}
            onClick={() => onChange(m.key)}
            className={`mode-btn ${mode === m.key ? "active" : ""} ${m.disabled ? "disabled" : ""}`}
            title={m.disabled ? "Server offline" : m.desc}
          >
            <span className="mode-btn-label">{m.label}</span>
            <span className="mode-btn-desc">{m.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
