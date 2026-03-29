# PlantSight — Master's Thesis Project

Plant disease detection app comparing **Edge AI**, **Hybrid AI**, and **Cloud AI** inference.

## Quick Start

### 1. Backend (FastAPI)
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Download model weights (see below)
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Web (React + Vite)
```bash
cd web
npm install
echo 'VITE_API_URL=http://localhost:8000' > .env.local
npm run dev   # → http://localhost:5173
```

### 3. Mobile (Expo)
```bash
cd mobile
npm install
# Set your LAN IP in .env:
echo 'EXPO_PUBLIC_API_URL=http://192.168.YOUR_IP:8000' > .env
npx expo start   # scan QR with Expo Go
```

## Model Downloads

| Model | Size | Purpose | Download |
|---|---|---|---|
| EfficientNet-B0 (PlantVillage) | ~20MB | Classification | HuggingFace / Kaggle |
| SAM ViT-B checkpoint | ~375MB | Segmentation | `wget https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth` |
| TFLite INT8 (mobile) | ~5MB | Edge inference | Convert from PyTorch (see docs) |

Place weights in `backend/assets/models/`.

## Project Structure
```
plantsight/
├── backend/    FastAPI + PyTorch + SAM
├── web/        React + Vite SPA
└── mobile/     React Native Expo
```
