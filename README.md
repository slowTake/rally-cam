# 🏓 PingPonger

Record a ping pong match and get rally highlights automatically.

Uses the **BlurBall** deep learning model (HRNet) to detect the ball in real-time via your webcam. When a rally ends, the clip is saved to an in-browser gallery.

## Requirements

- Python 3.10+
- Node.js 18+
- Apple Silicon Mac (uses MPS GPU) or NVIDIA GPU

## Setup

```bash
# Install Python dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Install frontend dependencies
npm install
```

## Running

### Option A — Start script

```bash
./start.sh
```

### Option B — Manual (two terminals)

**Terminal 1** — Detection server:
```bash
source .venv/bin/activate
python3 -m server.server
```

**Terminal 2** — Frontend:
```bash
npx vite --port 5175 --host
```

Then open **https://localhost:5175/**

## Project Structure

```
PingPonger/
├── index.html            Vite entry point
├── index.css             Rally-Cam design system
├── src/                  Frontend modules
│   ├── app.js            Main controller (views, events, session)
│   ├── camera.js         Camera access & management
│   ├── detector.js       WebSocket client for ball detection
│   ├── recorder.js       MediaRecorder wrapper for clips
│   ├── gallery.js        Gallery rendering & playback
│   └── storage.js        IndexedDB persistence
├── server/               Python detection backend
│   ├── server.py         WebSocket server
│   ├── live_track.py     Model loading & detection utilities
│   ├── blurball.py       HRNet neural network definition
│   └── checkpoint/
│       └── blurball_ep27.pth   Pretrained weights (5.4MB)
├── start.sh              Launches both servers
├── vite.config.js        Vite + HTTPS config
├── package.json          Node dependencies
└── requirements.txt      Python dependencies
```

## How It Works

1. Browser captures webcam frames and sends them to the Python server via WebSocket
2. The server runs BlurBall inference on each frame (3-frame sliding window)
3. Detections (ball position, bounding box, confidence) are sent back to the browser
4. When the ball is moving, recording starts automatically
5. When the ball disappears, the clip is saved to the gallery (IndexedDB)

## Controls

- **START RECORDING** → opens the camera view
- **Red button** → starts a detection session
- Clips save automatically when a rally ends
- **VIEW GALLERY** → browse and download saved clips

## Attribution

- **Ball detection**: [BlurBall](https://arxiv.org/abs/2509.18387) by Gossard et al. (CVPR 2026 Workshops), built on [WASB](https://github.com/nttcom/WASB-SBDT/). MIT License.
- **UI design**: Inspired by the Rally-Cam project.
