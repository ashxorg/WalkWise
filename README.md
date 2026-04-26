# WalkWise

AI walking companion: real-time object detection in your camera, with voice Q&A. YOLOv8 runs continuously in the browser, Google Vision + Gemini answer your questions about what you're looking at, and ElevenLabs speaks the answer.

Two buttons. Start, and Mic.

## Stack

- **Vite** — vanilla JS, no framework
- **ONNX Runtime Web** running **YOLOv8n** for live detection (WebGPU when available, WASM fallback)
- **Google Vision API** for label / object / text detection on demand
- **Gemini 2.0 Flash** for transcription + conversational answers
- **ElevenLabs** TTS for voice replies
- Works on any modern mobile browser (iOS Safari 16+, Chrome Android)

## Setup

```bash
npm install
```

### Add the YOLO model

Download `yolov8n.onnx` (~12 MB) and place it at `public/models/yolov8n.onnx`.

You can export it from Ultralytics:

```bash
pip install ultralytics
yolo export model=yolov8n.pt format=onnx opset=12 imgsz=640 simplify=True
```

Filename must be `yolov8n.onnx` and shape `1×3×640×640` input → `1×84×8400` output (standard Ultralytics export).

### Add API keys

Copy `.env.example` to `.env` and fill in three values:

```bash
cp .env.example .env
# then edit .env
```

```dotenv
VITE_GOOGLE_VISION_API_KEY=AIza…   # from Google Cloud — enable Cloud Vision API
VITE_GEMINI_API_KEY=AIza…          # from https://aistudio.google.com/app/apikey
VITE_ELEVENLABS_API_KEY=sk_…       # from elevenlabs.io → Profile → API Keys
VITE_ELEVENLABS_VOICE_ID=flHkNRp1BlvT73UL6gyz   # optional — default is "Sarah"
```

> ⚠️ **Security note.** These keys are inlined into the client bundle at build time so the browser can call the APIs directly. Anyone who loads the deployed site can extract them from DevTools and use your quota. Use restricted/IP-locked keys, or only deploy to audiences you trust.

### Run locally

```bash
npm run dev
```

Open the URL it prints (e.g. `http://localhost:5173`). On your phone, **camera requires HTTPS on iOS**, so the easiest path is to deploy to Vercel and open the live URL there.

End-users see one screen with two buttons: **Start** and **Ask**. There's no key prompt — keys are baked in.

## Deploy to Vercel

```bash
vercel
```

Or connect the repo in the Vercel dashboard. Vercel auto-detects Vite, runs `npm run build`, and serves `dist/`. The included `vercel.json` adds long cache headers for the model and WASM files.

**Don't forget the env vars.** In Vercel: Project Settings → Environment Variables, add the same `VITE_*` keys (matching `.env.example` exactly), then redeploy. Vite only inlines them at build time, so a redeploy is required after changing them.

## Project layout

```
src/
  main.js            entry: bootstraps everything
  state.js           tiny pub/sub store
  styles.css         all styling
  core/
    camera.js        getUserMedia, snapshot, crop helpers
    yolo.js          ONNX Runtime YOLOv8 inference loop
    tracker.js       IoU + lerp smoothing (ported from ObjectTracker.swift)
    audio.js         MediaRecorder wrapper for voice questions
  services/
    gemini.js        Gemini REST (transcription + answers)
    vision.js        Google Vision REST
    elevenlabs.js    TTS REST + playback
  ui/
    overlay.js       bounding boxes + labels canvas
    bottomBar.js     Start + Mic pill buttons
    detailPanel.js   sliding panel for object details
    settingsModal.js Preferences (FPS, voice override, speak-on-tap)
```

Inspired by the original Swift AR HUD prototype — see the green-on-black aesthetic, corner accents, and tap-to-inspect interactions ported from `ContentView.swift`.
