"""
EfficientNet-B0 disease classifier wrapper.
Falls back to mock mode if model weights are not found.
"""
import json
import io
import time
import random

from PIL import Image
from config import settings


# 38 PlantVillage classes
DEFAULT_CLASSES = [
    "Apple___Apple_scab", "Apple___Black_rot", "Apple___Cedar_apple_rust", "Apple___healthy",
    "Blueberry___healthy", "Cherry___healthy", "Cherry___Powdery_mildew",
    "Corn___Cercospora_leaf_spot", "Corn___Common_rust", "Corn___healthy", "Corn___Northern_Leaf_Blight",
    "Grape___Black_rot", "Grape___Esca_(Black_Measles)", "Grape___healthy", "Grape___Leaf_blight",
    "Orange___Haunglongbing_(Citrus_greening)",
    "Peach___Bacterial_spot", "Peach___healthy",
    "Pepper,_bell___Bacterial_spot", "Pepper,_bell___healthy",
    "Potato___Early_blight", "Potato___healthy", "Potato___Late_blight",
    "Raspberry___healthy", "Soybean___healthy",
    "Squash___Powdery_mildew", "Strawberry___healthy", "Strawberry___Leaf_scorch",
    "Tomato___Bacterial_spot", "Tomato___Early_blight", "Tomato___healthy",
    "Tomato___Late_blight", "Tomato___Leaf_Mold", "Tomato___Septoria_leaf_spot",
    "Tomato___Spider_mites", "Tomato___Target_Spot",
    "Tomato___Tomato_mosaic_virus", "Tomato___Tomato_Yellow_Leaf_Curl_Virus",
]


class PlantClassifier:
    def __init__(self):
        self.model = None
        self.classes: list[str] = DEFAULT_CLASSES
        self.mock_mode = False
        self.device = None
        self.transform = None

    def load(self):
        """Load weights and class names. Falls back to mock mode if missing."""
        # Try to load class_names.json if it exists
        try:
            with open(settings.CLASS_NAMES_JSON) as f:
                self.classes = json.load(f)
        except FileNotFoundError:
            print("[Classifier] class_names.json not found — using default 38 PlantVillage classes")

        # Try to load real model
        try:
            import torch
            from torchvision import transforms
            import timm

            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            self.transform = transforms.Compose([
                transforms.Resize((settings.IMG_SIZE, settings.IMG_SIZE)),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ])

            from torchvision.models import efficientnet_b0
            self.model = efficientnet_b0(weights=None)
            # Replace classifier head for correct number of classes
            import torch.nn as nn
            self.model.classifier[1] = nn.Linear(self.model.classifier[1].in_features, len(self.classes))
            checkpoint = torch.load(settings.CLASSIFIER_WEIGHTS, map_location=self.device, weights_only=False)
            # Handle both plain state_dict and full checkpoint formats
            if isinstance(checkpoint, dict):
                state = (
                    checkpoint.get("model_state_dict") or
                    checkpoint.get("state_dict") or
                    checkpoint.get("model") or
                    checkpoint  # assume it IS the state dict
                )
            else:
                state = checkpoint
            self.model.load_state_dict(state, strict=False)
            self.model.to(self.device).eval()
            print(f"[Classifier] Loaded {len(self.classes)} classes on {self.device}")

        except (FileNotFoundError, ImportError, Exception) as e:
            print(f"[Classifier] Could not load real model: {e}")
            print("[Classifier] *** RUNNING IN MOCK MODE — returning simulated results ***")
            self.mock_mode = True
            self.model = "mock"

    def predict(self, image_bytes: bytes) -> dict:
        """Run inference. Uses real model or mock results."""
        if self.model is None:
            raise RuntimeError("Classifier not loaded. Call classifier.load() first.")

        t0 = time.time()

        if self.mock_mode:
            return self._mock_predict(image_bytes, t0)
        return self._real_predict(image_bytes, t0)

    def _mock_predict(self, image_bytes: bytes, t0: float) -> dict:
        """Return realistic simulated results — picks a random tomato disease."""
        # Validate image is readable
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        # Simulate some processing time
        time.sleep(random.uniform(0.05, 0.15))

        # Pick a disease class (weighted toward tomato since that's the photo)
        tomato_classes = [c for c in self.classes if c.startswith("Tomato")]
        main_class = random.choice(tomato_classes) if tomato_classes else self.classes[0]

        # Generate realistic confidence values
        main_conf = round(random.uniform(0.78, 0.97), 4)
        second_conf = round(random.uniform(0.01, 0.12), 4)
        third_conf = round(1.0 - main_conf - second_conf, 4)

        if "___" in main_class:
            plant, disease = main_class.split("___", 1)
        else:
            plant, disease = main_class, "Healthy"

        if "healthy" in disease.lower():
            severity = "healthy"
        elif main_conf > 0.85:
            severity = "severe"
        elif main_conf > 0.65:
            severity = "moderate"
        else:
            severity = "mild"

        # Pick 2 runner-up classes
        others = [c for c in self.classes if c != main_class]
        random.shuffle(others)

        return {
            "disease_class": main_class,
            "disease_label": disease.replace("_", " "),
            "plant": plant,
            "confidence": main_conf,
            "top3": [
                {"label": disease.replace("_", " "), "confidence": main_conf},
                {"label": others[0].split("___")[-1].replace("_", " "), "confidence": second_conf},
                {"label": others[1].split("___")[-1].replace("_", " "), "confidence": third_conf},
            ],
            "severity": severity,
            "model_used": "mock_classifier",
            "latency_ms": round((time.time() - t0) * 1000, 1),
        }

    def _real_predict(self, image_bytes: bytes, t0: float) -> dict:
        """Real model inference."""
        import torch

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        x = self.transform(img).unsqueeze(0).to(self.device)

        with torch.no_grad():
            logits = self.model(x)
            probs = torch.softmax(logits, dim=1)[0]

        top3_idx = probs.topk(3).indices.tolist()
        top3_vals = probs.topk(3).values.tolist()

        best_idx = top3_idx[0]
        best_class = self.classes[best_idx]
        confidence = float(top3_vals[0])

        if "___" in best_class:
            plant, disease = best_class.split("___", 1)
        else:
            plant, disease = best_class, "Healthy"

        if "healthy" in disease.lower():
            severity = "healthy"
        elif confidence > 0.85:
            severity = "severe"
        elif confidence > 0.65:
            severity = "moderate"
        else:
            severity = "mild"

        return {
            "disease_class": best_class,
            "disease_label": disease.replace("_", " "),
            "plant": plant,
            "confidence": round(confidence, 4),
            "top3": [
                {"label": self.classes[i].split("___")[-1].replace("_", " "), "confidence": round(float(v), 4)}
                for i, v in zip(top3_idx, top3_vals)
            ],
            "severity": severity,
            "model_used": "efficientnet_b0_fp32",
            "latency_ms": round((time.time() - t0) * 1000, 1),
        }


# Singleton
classifier = PlantClassifier()
