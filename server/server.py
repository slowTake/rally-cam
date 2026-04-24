#!/usr/bin/env python3
"""
PingPonger Detection Server

WebSocket server that runs BlurBall (HRNet) inference on webcam frames
sent from the browser. Returns ball detection results in real time.

Usage:
    python -m server.server
    python -m server.server --port 8765 --threshold 0.5
"""

import argparse
import asyncio
import base64
import json
import os
import time
from collections import deque

import cv2
import numpy as np
import torch
import torchvision.transforms as T
import websockets

from .live_track import (
    load_model,
    detect_ball,
    get_affine_transform,
    MODEL_CFG,
)

# Default checkpoint path (relative to this file)
DEFAULT_CHECKPOINT = os.path.join(
    os.path.dirname(__file__), "checkpoint", "blurball_ep27.pth"
)


# ── Tracker Engine ─────────────────────────────────────────────────────────

class TrackerEngine:
    """Wraps model loading, preprocessing, and per-frame detection."""

    def __init__(self, model_path, device, threshold=0.5):
        self.threshold = threshold
        self.device = device

        self.model = load_model(model_path, device)

        # Preprocessing — matches BlurBall training pipeline
        self.inp_w = MODEL_CFG["inp_width"]   # 512
        self.inp_h = MODEL_CFG["inp_height"]  # 288
        self.preprocess = T.Compose([
            T.ToPILImage(),
            T.Resize((self.inp_h, self.inp_w)),
            T.ToTensor(),
            T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])

        # 3-frame sliding window
        self.frame_buffer = deque(maxlen=3)
        self.inv_affine = None
        self.frame_w = 0
        self.frame_h = 0

    def _setup_affine(self, w, h):
        """Compute inverse affine (heatmap → original coords)."""
        if w == self.frame_w and h == self.frame_h:
            return
        self.frame_w = w
        self.frame_h = h
        c = np.array([w / 2.0, h / 2.0], dtype=np.float32)
        s = max(h, w) * 1.0
        self.inv_affine = get_affine_transform(c, s, 0, [self.inp_w, self.inp_h], inv=1)

    def process_frame(self, frame_rgb):
        """
        Process one RGB frame through the model.
        Returns (detection_dict, heatmap_or_None).
        """
        h, w = frame_rgb.shape[:2]
        self._setup_affine(w, h)

        frame_tensor = self.preprocess(frame_rgb)
        self.frame_buffer.append(frame_tensor)

        result = {"detected": False, "x": 0, "y": 0, "score": 0, "bbox": None}

        # Need 3 frames to run inference
        if len(self.frame_buffer) < 3:
            return result, None

        with torch.no_grad():
            # Stack 3 frames → [1, 9, H, W]
            input_tensor = torch.cat(list(self.frame_buffer), dim=0).unsqueeze(0).to(self.device)
            preds = self.model(input_tensor)
            # Heatmap for the middle frame (index 1)
            hm = preds[0][0, 1].sigmoid().cpu().numpy()

        detections = detect_ball(hm, self.threshold, self.inv_affine)

        if detections:
            det = detections[0]  # Best detection
            result = {
                "detected": True,
                "x": det["cx"],
                "y": det["cy"],
                "score": det["score"],
                "bbox": [det["x1"], det["y1"], det["x2"], det["y2"]],
            }

        return result, hm


# ── WebSocket Server ───────────────────────────────────────────────────────

class DetectionServer:
    def __init__(self, engine):
        self.engine = engine
        self.clients = set()

    async def handler(self, websocket):
        self.clients.add(websocket)
        client_addr = websocket.remote_address
        print(f"🔗 Client connected: {client_addr}")

        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    msg_type = data.get("type", "")

                    if msg_type == "frame":
                        # Decode base64 JPEG → numpy RGB
                        img_bytes = base64.b64decode(data["data"])
                        nparr = np.frombuffer(img_bytes, np.uint8)
                        frame_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                        if frame_bgr is None:
                            continue
                        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)

                        t0 = time.time()
                        result, _ = self.engine.process_frame(frame_rgb)
                        dt = time.time() - t0

                        response = {
                            "type": "detection",
                            "detected": result["detected"],
                            "x": round(result["x"], 1),
                            "y": round(result["y"], 1),
                            "score": round(result["score"], 2),
                            "bbox": [round(v, 1) for v in result["bbox"]] if result["bbox"] else None,
                            "inferenceMs": round(dt * 1000, 1),
                        }
                        await websocket.send(json.dumps(response))

                    elif msg_type == "set_threshold":
                        self.engine.threshold = float(data.get("value", 0.5))
                        await websocket.send(json.dumps({
                            "type": "threshold_set",
                            "value": self.engine.threshold,
                        }))

                    elif msg_type == "ping":
                        await websocket.send(json.dumps({"type": "pong"}))

                except json.JSONDecodeError:
                    pass
                except Exception as e:
                    print(f"⚠ Frame processing error: {e}")
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": str(e),
                    }))

        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.discard(websocket)
            print(f"🔌 Client disconnected: {client_addr}")


async def main(args):
    # Select device
    device = "cpu"
    if torch.backends.mps.is_available():
        device = "mps"
        print("✓ Using MPS (Apple Silicon GPU)")
    elif torch.cuda.is_available():
        device = "cuda"
        print("✓ Using CUDA GPU")
    else:
        print("⚠ Using CPU (inference will be slower)")

    # Load model
    engine = TrackerEngine(args.model_path, device, args.threshold)

    # Warm up with dummy frames
    print("⏳ Warming up model...")
    dummy = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
    for _ in range(4):
        engine.process_frame(dummy)
    print("✓ Model warmed up")

    # Start server
    server = DetectionServer(engine)
    print(f"\n🏓 Detection server running on ws://localhost:{args.port}")
    print(f"   Threshold: {args.threshold}")
    print(f"   Device: {device}")
    print(f"   Model: BlurBall (HRNet)")
    print(f"   Waiting for browser connection...\n")

    async with websockets.serve(
        server.handler,
        "localhost",
        args.port,
        max_size=10 * 1024 * 1024,  # 10MB max message
        ping_interval=20,
        ping_timeout=60,
    ):
        await asyncio.Future()  # Run forever


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PingPonger Detection Server")
    parser.add_argument("--model_path", type=str,
                        default=DEFAULT_CHECKPOINT,
                        help="Path to BlurBall checkpoint")
    parser.add_argument("--port", type=int, default=8765,
                        help="WebSocket port (default: 8765)")
    parser.add_argument("--threshold", type=float, default=0.5,
                        help="Detection score threshold (default: 0.5)")
    args = parser.parse_args()
    asyncio.run(main(args))
