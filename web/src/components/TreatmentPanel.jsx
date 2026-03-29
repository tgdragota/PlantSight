const URGENCY_COLOR = { low: "#4caf50", medium: "#ff9800", high: "#f44336" };

export default function TreatmentPanel({ treatment }) {
  if (!treatment) return null;

  return (
    <div className="treatment-panel">
      <div className="treatment-header">
        <h3>💊 Treatment — {treatment.disease_name}</h3>
        {treatment.urgency && (
          <span
            className="urgency-badge"
            style={{ backgroundColor: URGENCY_COLOR[treatment.urgency] }}
          >
            {treatment.urgency.toUpperCase()} urgency
          </span>
        )}
      </div>

      {treatment.cause && (
        <p className="treatment-cause">
          <strong>Cause:</strong> {treatment.cause}
        </p>
      )}
      {treatment.symptoms && (
        <p className="treatment-symptoms">
          <strong>Symptoms:</strong> {treatment.symptoms}
        </p>
      )}

      <div className="treatment-sections">
        <TreatmentSection title="🌿 Organic" items={treatment.organic} color="#4caf50" />
        <TreatmentSection title="🧪 Chemical" items={treatment.chemical} color="#1a3c78" />
        <TreatmentSection title="🛡 Prevention" items={treatment.prevention} color="#6a0dad" />
      </div>
    </div>
  );
}

function TreatmentSection({ title, items, color }) {
  if (!items?.length) return null;
  return (
    <div className="treatment-section">
      <h4 style={{ color }}>{title}</h4>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
