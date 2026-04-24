/**
 * detector.js — WebSocket-based ball detection using BlurBall model
 *
 * Detection pipeline:
 * 1. Capture frames from video at regular intervals
 * 2. Send as base64 JPEG to Python detection server via WebSocket
 * 3. Receive detection results (position, score, bounding box)
 * 4. Run state machine: ball appears → record, ball gone → stop & save
 *
 * The Python server runs the BlurBall HRNet model which uses 3-frame
 * sliding windows to detect ping pong balls with motion blur awareness.
 */

// WebSocket connection
const WS_URL = 'ws://localhost:8765';
const WS_RECONNECT_DELAY = 2000;

// Frame sending rate — send every Nth frame for performance
const SEND_EVERY_N_FRAMES = 2;

// JPEG quality for frame encoding (lower = faster transfer, less accurate)
const JPEG_QUALITY = 0.7;

// Send resolution — downscale frames before encoding
const SEND_WIDTH = 640;

// Motion / detection timing
const BALL_PRESENT_FRAMES = 2;    // Ball must be seen for N frames before "detected"
const BALL_GONE_FRAMES = 15;      // Ball must be gone for N frames before "lost"

// Trail visualization
const TRAIL_LENGTH = 40;

// Motion threshold: accumulated pixel movement before considering ball "in play"
const MOTION_THRESHOLD = 30;

export class BallDetector {
  /**
   * @param {HTMLVideoElement} videoEl
   * @param {HTMLCanvasElement} overlayCanvas
   */
  constructor(videoEl, overlayCanvas) {
    this.video = videoEl;
    this.canvas = overlayCanvas;
    this.ctx = overlayCanvas.getContext('2d');

    // WebSocket
    this.ws = null;
    this.wsConnected = false;
    this.wsReconnectTimer = null;

    // State
    this.running = false;
    this.animFrameId = null;
    this.ballDetected = false;     // True when actively recording
    this.ballPresent = false;      // True when ball is in frame
    this.presentCount = 0;
    this.goneCount = 0;
    this.lastDetection = null;     // Latest detection result from server
    this.detectionStartTime = 0;
    this.trail = [];               // Ball position trail for visualization
    this._motionAccum = 0;         // Accumulated motion in pixels

    // Frame sending
    this._sendCanvas = null;
    this._sendCtx = null;
    this._frameCounter = 0;
    this._pendingFrame = false;    // Throttle: don't send if previous still pending

    // FPS tracking
    this.frameCount = 0;
    this.lastFpsTime = 0;
    this.currentFps = 0;
    this.inferenceMs = 0;

    // Detection stats (for clip metadata)
    this.detectionCount = 0;
    this.maxScore = 0;

    // Callbacks
    this._onBallAppear = null;
    this._onBallDisappear = null;
    this._onFpsUpdate = null;
    this._onLearningProgress = null;
    this._onLearningComplete = null;
    this._onConnectionChange = null;

    // Learning phase
    this._learningStartTime = 0;
    this._learningDone = false;
    this._learningFramesSent = 0;
    this._learningFramesNeeded = 4; // Need 3 frames in buffer + 1 inference
  }

  // ── Callback setters ──────────────────────────────────────────────
  onBallAppear(cb) { this._onBallAppear = cb; }
  onBallDisappear(cb) { this._onBallDisappear = cb; }
  onFpsUpdate(cb) { this._onFpsUpdate = cb; }
  onLearningProgress(cb) { this._onLearningProgress = cb; }
  onLearningComplete(cb) { this._onLearningComplete = cb; }
  onConnectionChange(cb) { this._onConnectionChange = cb; }

  // Legacy compat
  onMotionStart(cb) { this._onBallAppear = cb; }
  onMotionStop(cb) { this._onBallDisappear = cb; }

  /**
   * Get detection stats for clip metadata.
   */
  getDetectionStats() {
    return {
      detectionCount: this.detectionCount,
      maxScore: this.maxScore,
    };
  }

  /**
   * Reset detection stats (call when a new clip starts).
   */
  resetDetectionStats() {
    this.detectionCount = 0;
    this.maxScore = 0;
  }

  // ── WebSocket ─────────────────────────────────────────────────────

  _connectWS() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    console.log('🔌 Connecting to detection server...');
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      console.log('✓ Connected to detection server');
      this.wsConnected = true;
      this._pendingFrame = false;
      if (this._onConnectionChange) this._onConnectionChange(true);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'detection') {
          this._handleDetection(data);
          this._pendingFrame = false;
        } else if (data.type === 'pong') {
          // keepalive response
        }
      } catch (e) {
        console.warn('Invalid message from server:', e);
      }
    };

    this.ws.onclose = () => {
      this.wsConnected = false;
      this._pendingFrame = false;
      if (this._onConnectionChange) this._onConnectionChange(false);

      if (this.running) {
        console.log('⚠ Connection lost, reconnecting...');
        this.wsReconnectTimer = setTimeout(() => this._connectWS(), WS_RECONNECT_DELAY);
      }
    };

    this.ws.onerror = (err) => {
      console.warn('WebSocket error:', err);
    };
  }

  _disconnectWS() {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect
      this.ws.close();
      this.ws = null;
    }
    this.wsConnected = false;
    this._pendingFrame = false;
  }

  // ── Frame sending ─────────────────────────────────────────────────

  _initSendCanvas() {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const scale = SEND_WIDTH / vw;

    this._sendCanvas = document.createElement('canvas');
    this._sendCanvas.width = SEND_WIDTH;
    this._sendCanvas.height = Math.round(vh * scale);
    this._sendCtx = this._sendCanvas.getContext('2d', { willReadFrequently: true });
  }

  _sendFrame() {
    if (!this.wsConnected || this._pendingFrame) return;
    if (!this._sendCanvas) this._initSendCanvas();

    try {
      // Draw video frame to offscreen canvas (downscaled)
      this._sendCtx.drawImage(this.video, 0, 0, this._sendCanvas.width, this._sendCanvas.height);

      // Convert to base64 JPEG
      const dataUrl = this._sendCanvas.toDataURL('image/jpeg', JPEG_QUALITY);
      const base64 = dataUrl.split(',')[1];

      this._pendingFrame = true;
      this.ws.send(JSON.stringify({
        type: 'frame',
        data: base64,
        width: this._sendCanvas.width,
        height: this._sendCanvas.height,
      }));

      // Track learning progress
      if (!this._learningDone) {
        this._learningFramesSent++;
      }
    } catch (e) {
      console.warn('Frame send error:', e);
      this._pendingFrame = false;
    }
  }

  // ── Detection handler ─────────────────────────────────────────────

  _handleDetection(data) {
    this.inferenceMs = data.inferenceMs || 0;

    // Use trail from live_track.py (server-side trail with score data)
    if (data.trail && data.trail.length > 0) {
      const vw = this.video.videoWidth;
      const vh = this.video.videoHeight;
      const scaleX = vw / SEND_WIDTH;
      const scaleY = vh / (this._sendCanvas ? this._sendCanvas.height : vh);

      this.trail = data.trail.map(t => ({
        x: t.x * scaleX,
        y: t.y * scaleY,
        s: t.s || 0,
      }));
    }

    // Handle learning phase (model needs 3 frames to fill buffer)
    if (!this._learningDone) {
      const progress = Math.min(this._learningFramesSent / this._learningFramesNeeded, 1);
      if (this._onLearningProgress) this._onLearningProgress(progress);

      if (this._learningFramesSent >= this._learningFramesNeeded) {
        this._learningDone = true;
        if (this._onLearningComplete) this._onLearningComplete();
      }
      return;
    }

    if (data.detected) {
      this.presentCount++;
      this.goneCount = 0;
      this.detectionCount++;
      if (data.score > this.maxScore) this.maxScore = data.score;

      // Scale detection coordinates back to video display size
      const vw = this.video.videoWidth;
      const vh = this.video.videoHeight;
      const scaleX = vw / SEND_WIDTH;
      const scaleY = vh / this._sendCanvas.height;

      const newDetection = {
        x: data.x * scaleX,
        y: data.y * scaleY,
        score: data.score,
        bbox: data.bbox ? [
          data.bbox[0] * scaleX,
          data.bbox[1] * scaleY,
          data.bbox[2] * scaleX,
          data.bbox[3] * scaleY,
        ] : null,
      };

      // ── Motion filtering: only trigger on MOVING balls ──
      if (this.lastDetection) {
        const dx = newDetection.x - this.lastDetection.x;
        const dy = newDetection.y - this.lastDetection.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        this._motionAccum += dist;
      }
      this.lastDetection = newDetection;

      // Ball must have moved enough to count as "in play"
      const ballIsMoving = this._motionAccum >= MOTION_THRESHOLD;

      // State machine: ball appears AND is moving → start recording
      if (ballIsMoving && !this.ballDetected) {
        this.ballPresent = true;
        this.ballDetected = true;
        this.detectionStartTime = performance.now();
        this.resetDetectionStats();
        this._motionAccum = 0;
        console.log('🏓 Ball in play — starting recording');
        if (this._onBallAppear) this._onBallAppear(this.lastDetection);
      }
    } else {
      this.presentCount = 0;
      this.goneCount++;

      // Reset motion accumulator when ball disappears
      if (this.goneCount >= 3) {
        this._motionAccum = 0;
      }

      if (this.ballPresent && this.goneCount >= BALL_GONE_FRAMES) {
        this.ballPresent = false;

        if (this.ballDetected) {
          this.ballDetected = false;
          const duration = ((performance.now() - this.detectionStartTime) / 1000).toFixed(1);
          console.log(`🛑 Ball gone — saving clip (${duration}s, ${this.detectionCount} detections)`);
          if (this._onBallDisappear) this._onBallDisappear(this.lastDetection);
        }
      }
    }
  }

  // ── Drawing ───────────────────────────────────────────────────────

  _drawOverlay() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);

    if (!this._learningDone) return;

    // Draw trail
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      const alpha = (i + 1) / this.trail.length;
      const r = Math.max(1, Math.floor(3 * alpha));

      this.ctx.beginPath();
      this.ctx.arc(t.x, t.y, r, 0, Math.PI * 2);

      if (this.ballDetected) {
        this.ctx.fillStyle = `rgba(239, 68, 68, ${alpha * 0.8})`;
      } else {
        this.ctx.fillStyle = `rgba(0, 229, 255, ${alpha * 0.6})`;
      }
      this.ctx.fill();
    }

    // Draw detection
    if (this.lastDetection && this.ballPresent) {
      this._drawDetection(this.lastDetection);
    }
  }

  _drawDetection(det) {
    const ctx = this.ctx;
    const { x, y, bbox, score } = det;

    // Bounding box
    if (bbox) {
      const [x1, y1, x2, y2] = bbox;
      const bw = x2 - x1;
      const bh = y2 - y1;

      ctx.strokeStyle = this.ballDetected
        ? 'rgba(239, 68, 68, 0.8)'
        : 'rgba(0, 229, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x1 - 6, y1 - 6, bw + 12, bh + 12);
      ctx.setLineDash([]);

      ctx.strokeStyle = this.ballDetected
        ? 'rgba(239, 68, 68, 0.6)'
        : 'rgba(0, 229, 255, 0.4)';
      ctx.strokeRect(x1, y1, bw, bh);
    }

    // Center dot
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = this.ballDetected
      ? 'rgba(239, 68, 68, 0.9)'
      : 'rgba(0, 229, 255, 0.9)';
    ctx.fill();

    // Crosshair
    const cs = 12;
    ctx.beginPath();
    ctx.moveTo(x - cs, y);
    ctx.lineTo(x + cs, y);
    ctx.moveTo(x, y - cs);
    ctx.lineTo(x, y + cs);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Label (counter-mirrored for CSS scaleX(-1))
    const label = this.ballDetected
      ? `● REC  ${score.toFixed(1)}`
      : `○ BALL  ${score.toFixed(1)}`;
    ctx.save();
    ctx.translate(x + 18, y - 6);
    ctx.scale(-1, 1);
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = this.ballDetected
      ? 'rgba(239, 68, 68, 0.9)'
      : 'rgba(0, 229, 255, 0.9)';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  // ── Main loop ─────────────────────────────────────────────────────

  start() {
    if (this.running) return;
    this.running = true;

    const w = this.video.videoWidth;
    const h = this.video.videoHeight;
    this.canvas.width = w;
    this.canvas.height = h;

    // Reset state
    this.ballDetected = false;
    this.ballPresent = false;
    this.presentCount = 0;
    this.goneCount = 0;
    this.lastDetection = null;
    this.trail = [];
    this.frameCount = 0;
    this.lastFpsTime = performance.now();
    this._frameCounter = 0;
    this._learningStartTime = performance.now();
    this._learningDone = false;
    this._learningFramesSent = 0;
    this._sendCanvas = null;
    this._sendCtx = null;

    // Connect to server
    this._connectWS();

    // Start render/send loop
    this._loop();
  }

  stop() {
    this.running = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this._disconnectWS();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _loop() {
    if (!this.running) return;
    this.animFrameId = requestAnimationFrame(() => this._loop());

    // FPS tracking
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsTime >= 1000) {
      this.currentFps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsTime = now;
      if (this._onFpsUpdate) {
        const fpsLabel = this.inferenceMs > 0
          ? `${this.currentFps} fps · ${this.inferenceMs.toFixed(0)}ms`
          : `${this.currentFps} fps`;
        this._onFpsUpdate(fpsLabel);
      }
    }

    // Send frame at throttled rate
    this._frameCounter++;
    if (this._frameCounter % SEND_EVERY_N_FRAMES === 0) {
      this._sendFrame();
    }

    // Always draw overlay
    this._drawOverlay();
  }
}
