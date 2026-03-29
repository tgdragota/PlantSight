const ARCHITECTURES = [
  {
    key: "edge",
    icon: "📱",
    label: "Edge AI",
    color: "#00e676",
    tagline: "Fully offline · On-device inference",
    desc: "The Edge mode runs a quantized TFLite INT8 model directly on the device CPU/GPU without any network call. This enables completely offline operation — critical in rural agricultural settings with no internet access.",
    pros: ["No network latency", "Works offline", "Privacy-preserving", "Low server cost"],
    cons: ["Lower accuracy due to quantization", "No segmentation overlay", "Device hardware dependent"],
    models: ["EfficientNet-B0 → TFLite INT8", "38-class PlantVillage classifier", "~8MB model size"],
    metric: "Target: < 200ms on mid-range device",
  },
  {
    key: "hybrid",
    icon: "🔀",
    label: "Hybrid AI",
    color: "#ab47bc",
    tagline: "Best of both worlds · Smart offloading",
    desc: "Hybrid mode performs disease classification on-device (Edge) for low latency, then offloads the segmentation task to the Cloud server only when connectivity is available. This balances accuracy, latency, and server cost.",
    pros: ["Fast classification response", "High-quality segmentation", "Adaptive to connectivity", "Balanced server load"],
    cons: ["Requires internet for segmentation", "More complex architecture", "Two-phase latency"],
    models: ["Edge: TFLite INT8 classifier", "Cloud: SAM ViT-B segmentor", "Split inference pipeline"],
    metric: "Target: < 800ms for full result",
  },
  {
    key: "cloud",
    icon: "☁️",
    label: "Cloud AI",
    color: "#42a5f5",
    tagline: "Maximum accuracy · GPU-powered",
    desc: "Cloud mode sends the image to the FastAPI server where the full-precision EfficientNet-B0 classifier and SAM ViT-B segmentation model run on server GPU. Highest accuracy and richest output, but requires internet connection.",
    pros: ["Highest accuracy", "Full segmentation overlay", "Large model capacity", "Easily updatable models"],
    cons: ["Requires internet", "Higher latency", "Server infrastructure cost", "Privacy concerns"],
    models: ["EfficientNet-B0 (full precision)", "SAM ViT-B (375MB)", "FastAPI + PyTorch backend"],
    metric: "Target: < 2000ms including network",
  },
];

const RQS = [
  { id: "RQ1", text: "Does Edge AI inference latency meet real-time usability thresholds (< 200ms) on consumer mobile hardware?" },
  { id: "RQ2", text: "What accuracy trade-off (Δ top-1 accuracy) results from INT8 quantization of EfficientNet-B0 on the PlantVillage dataset?" },
  { id: "RQ3", text: "Can Hybrid AI achieve Cloud-level segmentation quality while reducing server compute cost by at least 50%?" },
  { id: "RQ4", text: "How does inference mode (Edge / Hybrid / Cloud) affect user-perceived response time and diagnostic confidence?" },
];

export default function About() {
  return (
    <div className="about-page">
      <div className="page-header">
        <h2 className="page-title">🔬 Research Overview</h2>
        <p className="page-sub">
          Master's Thesis — Comparative study of Edge AI, Hybrid AI, and Cloud AI inference architectures for mobile plant disease detection
        </p>
      </div>

      {/* ── Abstract ─────────────────────────── */}
      <div className="about-abstract glass-card">
        <h3 className="about-section-title">Abstract</h3>
        <p>
          PlantSight investigates three distinct AI deployment strategies for real-time plant disease
          detection on mobile devices. Using the PlantVillage dataset (54,306 images, 38 classes),
          we fine-tune an EfficientNet-B0 classifier and integrate Segment Anything Model (SAM)
          for visual disease localization. The research compares <strong>Edge</strong> (fully
          on-device TFLite INT8), <strong>Hybrid</strong> (on-device classification +
          cloud segmentation), and <strong>Cloud</strong> (full server GPU inference) across
          latency, accuracy, energy consumption, and scalability dimensions.
        </p>
      </div>

      {/* ── Architecture cards ───────────────── */}
      <h3 className="about-section-title about-section-gap">Inference Architectures</h3>
      <div className="about-arch-grid">
        {ARCHITECTURES.map((arch) => (
          <div className="about-arch-card glass-card" key={arch.key} style={{ "--arch-color": arch.color }}>
            <div className="arch-card-header">
              <span className="arch-icon">{arch.icon}</span>
              <div>
                <div className="arch-name" style={{ color: arch.color }}>{arch.label}</div>
                <div className="arch-tagline">{arch.tagline}</div>
              </div>
            </div>
            <p className="arch-desc">{arch.desc}</p>
            <div className="arch-models">
              {arch.models.map((m, i) => (
                <span key={i} className="arch-model-tag" style={{ borderColor: `${arch.color}44`, color: arch.color }}>
                  {m}
                </span>
              ))}
            </div>
            <div className="arch-pros-cons">
              <div className="arch-pros">
                <div className="arch-list-title">✅ Advantages</div>
                {arch.pros.map((p, i) => <div key={i} className="arch-list-item">{p}</div>)}
              </div>
              <div className="arch-cons">
                <div className="arch-list-title">❌ Limitations</div>
                {arch.cons.map((c, i) => <div key={i} className="arch-list-item">{c}</div>)}
              </div>
            </div>
            <div className="arch-metric" style={{ borderColor: `${arch.color}33`, color: arch.color }}>
              🎯 {arch.metric}
            </div>
          </div>
        ))}
      </div>

      {/* ── Research Questions ───────────────── */}
      <h3 className="about-section-title about-section-gap">Research Questions</h3>
      <div className="about-rqs">
        {RQS.map((rq) => (
          <div className="about-rq glass-card" key={rq.id}>
            <span className="rq-id">{rq.id}</span>
            <p className="rq-text">{rq.text}</p>
          </div>
        ))}
      </div>

      {/* ── Methodology ─────────────────────── */}
      <div className="about-method glass-card" style={{ marginTop: 24 }}>
        <h3 className="about-section-title">Methodology</h3>
        <div className="method-grid">
          <div className="method-step">
            <div className="method-num">01</div>
            <div className="method-title">Dataset</div>
            <p>PlantVillage: 54,306 RGB images · 14 crops · 38 disease classes · 80/10/10 split</p>
          </div>
          <div className="method-step">
            <div className="method-num">02</div>
            <div className="method-title">Model Training</div>
            <p>Fine-tune EfficientNet-B0 with transfer learning · data augmentation · label smoothing</p>
          </div>
          <div className="method-step">
            <div className="method-num">03</div>
            <div className="method-title">Quantization</div>
            <p>Post-training INT8 quantization → TFLite conversion for Edge deployment</p>
          </div>
          <div className="method-step">
            <div className="method-num">04</div>
            <div className="method-title">Segmentation</div>
            <p>SAM ViT-B zero-shot segmentation · center-point prompt · disease mask overlay</p>
          </div>
          <div className="method-step">
            <div className="method-num">05</div>
            <div className="method-title">Evaluation</div>
            <p>50 test images · 3 runs each mode · metrics: latency P50/P95, top-1 accuracy, mIoU</p>
          </div>
          <div className="method-step">
            <div className="method-num">06</div>
            <div className="method-title">Analysis</div>
            <p>Statistical comparison · trade-off analysis · recommendations for deployment context</p>
          </div>
        </div>
      </div>

      {/* ── Tech stack ──────────────────────── */}
      <div className="about-stack glass-card" style={{ marginTop: 16 }}>
        <h3 className="about-section-title">Technology Stack</h3>
        <div className="stack-row">
          {[
            { label: "Backend", items: ["FastAPI", "PyTorch", "EfficientNet-B0", "SAM ViT-B", "SQLite"] },
            { label: "Web",     items: ["React 18", "Vite", "Glassmorphism CSS"] },
            { label: "Mobile",  items: ["React Native", "Expo SDK 51", "TFLite"] },
            { label: "Data",    items: ["PlantVillage", "38 classes", "54K images"] },
          ].map((col) => (
            <div className="stack-col" key={col.label}>
              <div className="stack-col-label">{col.label}</div>
              {col.items.map((item) => (
                <span key={item} className="stack-tag">{item}</span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
