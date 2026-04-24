/**
 * app.js — Main application controller (Rally-Cam UI + BlurBall detection)
 *
 * Wires together: views, camera, detector, recorder, gallery, storage.
 * Detection is powered by the BlurBall model via a Python WebSocket server.
 */

import { initCamera, stopCamera, getStream } from './camera.js';
import { BallDetector } from './detector.js';
import { startRecording, stopRecording, isRecording, startPreBuffer, stopPreBuffer } from './recorder.js';
import { saveClip, getClipCount } from './storage.js';
import { renderGallery } from './gallery.js';

/* ============================================================
   DOM Elements
   ============================================================ */
const loadingOverlay = document.getElementById('loading-overlay');

// Views
const viewHome = document.getElementById('view-home');
const viewRecord = document.getElementById('view-record');
const viewGallery = document.getElementById('view-gallery');

// Home
const btnStartRecording = document.getElementById('btn-start-recording');
const btnViewGallery = document.getElementById('btn-view-gallery');

// Record
const cameraVideo = document.getElementById('camera-video');
const detectionCanvas = document.getElementById('detection-canvas');
const btnBackHome = document.getElementById('btn-back-home');
const btnToggleSession = document.getElementById('btn-toggle-session');
const recordBtnInner = document.getElementById('record-btn-inner');
const recordingBadge = document.getElementById('recording-badge');
const hudStatus = document.getElementById('hud-status');
const hudFps = document.getElementById('hud-fps');
const clipsCount = document.getElementById('clips-count');
const clipToast = document.getElementById('clip-toast');

// Learning overlay
const learningOverlay = document.getElementById('learning-overlay');
const learningCountdown = document.getElementById('learning-countdown');
const learningRingProgress = document.getElementById('learning-ring-progress');

// Gallery
const btnGalleryBack = document.getElementById('btn-gallery-back');
const btnEmptyRecord = document.getElementById('btn-empty-record');

/* ============================================================
   State
   ============================================================ */
let detector = null;
let sessionActive = false;   // Whether the user has pressed Start
let sessionClipCount = 0;    // Clips saved in this session
let toastTimeout = null;

/* ============================================================
   View Router
   ============================================================ */
function showView(viewId) {
  [viewHome, viewRecord, viewGallery].forEach((v) => v.classList.remove('active'));

  switch (viewId) {
    case 'home':
      viewHome.classList.add('active');
      break;
    case 'record':
      viewRecord.classList.add('active');
      break;
    case 'gallery':
      viewGallery.classList.add('active');
      renderGallery();
      break;
  }
}

/* ============================================================
   Recording View Logic
   ============================================================ */

/**
 * Enter the recording view: init camera + detector.
 */
async function enterRecordView() {
  showView('record');
  sessionClipCount = 0;
  updateClipsCounter();
  setHudStatus('idle', 'Initializing…');

  try {
    await initCamera(cameraVideo);
    detector = new BallDetector(cameraVideo, detectionCanvas);

    // Monitor connection state
    detector.onConnectionChange((connected) => {
      if (!sessionActive) {
        setHudStatus(
          connected ? 'idle' : 'idle',
          connected ? 'Ready — press Start' : 'Server disconnected…'
        );
      }
    });

    setHudStatus('idle', 'Ready — press Start');
  } catch (err) {
    setHudStatus('idle', err.message);
    alert(err.message);
  }
}

/**
 * Leave the recording view: cleanup everything.
 */
function leaveRecordView() {
  stopSession();
  if (detector) {
    detector.stop();
    detector = null;
  }
  stopCamera(cameraVideo);
  showView('home');
}

/**
 * Start the detection/recording session.
 */
function startSession() {
  if (!detector) return;
  sessionActive = true;

  btnToggleSession.classList.add('active');
  btnToggleSession.title = 'Stop Session';
  setHudStatus('detected', 'Connecting to model…');

  // Show learning countdown overlay
  const CIRCUMFERENCE = 2 * Math.PI * 52; // matches SVG circle r=52
  learningOverlay.classList.remove('hidden', 'fade-out', 'ready');
  learningRingProgress.style.strokeDashoffset = CIRCUMFERENCE;
  learningCountdown.textContent = '…';

  // Wire up learning callbacks
  detector.onLearningProgress((progress) => {
    // Update ring
    const offset = CIRCUMFERENCE * (1 - progress);
    learningRingProgress.style.strokeDashoffset = offset;

    // Update countdown
    const remaining = Math.ceil(4 * (1 - progress));
    learningCountdown.textContent = Math.max(remaining, 1);
  });

  detector.onLearningComplete(() => {
    // Flash "GO!" and fade out
    learningOverlay.classList.add('ready');
    learningCountdown.textContent = 'GO!';
    learningRingProgress.style.strokeDashoffset = '0';

    setTimeout(() => {
      learningOverlay.classList.add('fade-out');
      setHudStatus('tracking', 'Ready — throw the ball!');

      // Start pre-buffer so we capture the serve
      const stream = getStream();
      if (stream) startPreBuffer(stream);

      setTimeout(() => {
        learningOverlay.classList.add('hidden');
        learningOverlay.classList.remove('fade-out', 'ready');
      }, 500);
    }, 800);
  });

  // Wire up detection callbacks
  detector.onMotionStart(async (pos) => {
    console.log('▶ onMotionStart — ball in play, starting recording');
    setHudStatus('recording', 'Ball in play — recording');
    recordingBadge.classList.remove('hidden');

    const stream = getStream();
    if (stream && !isRecording()) {
      startRecording(stream);
    }
  });

  detector.onMotionStop(async (pos) => {
    console.log('⏹ onMotionStop — ball gone, stopping recording');
    recordingBadge.classList.add('hidden');

    if (isRecording()) {
      try {
        const clip = await stopRecording();
        console.log(`📼 Clip recorded: ${clip.duration.toFixed(1)}s, blob=${clip.blob.size} bytes`);

        // Only save clips longer than 0.3 seconds
        if (clip.duration >= 0.3) {
          // Get detection stats from detector
          const stats = detector.getDetectionStats();
          await saveClip(clip.blob, {
            duration: clip.duration,
            detectionCount: stats.detectionCount,
            maxScore: stats.maxScore,
          });
          console.log('✅ Clip saved to gallery!');
          sessionClipCount++;
          updateClipsCounter();
          showToast();
        } else {
          console.log(`⏭ Clip too short (${clip.duration.toFixed(1)}s), skipping`);
        }

        setHudStatus('tracking', 'Rally ended — scanning…');
      } catch (err) {
        console.error('❌ Failed to save clip:', err);
        setHudStatus('tracking', 'Save error — scanning…');
      }
    } else {
      console.log('⚠ onMotionStop but not recording');
      setHudStatus('tracking', 'Ball gone — scanning…');
    }
  });

  detector.onFpsUpdate((fpsLabel) => {
    hudFps.querySelector('.hud-label').textContent = fpsLabel;
  });

  detector.start();
}

/**
 * Stop the session.
 */
async function stopSession() {
  if (!sessionActive) return;
  sessionActive = false;

  btnToggleSession.classList.remove('active');
  btnToggleSession.title = 'Start Session';

  // If currently recording, finalize the clip
  if (isRecording()) {
    try {
      const clip = await stopRecording();
      if (clip.duration >= 0.5) {
        const stats = detector ? detector.getDetectionStats() : {};
        await saveClip(clip.blob, {
          duration: clip.duration,
          detectionCount: stats.detectionCount || 0,
          maxScore: stats.maxScore || 0,
        });
        sessionClipCount++;
        updateClipsCounter();
        showToast();
      }
    } catch (e) {
      console.warn('Could not finalize recording:', e);
    }
  }

  recordingBadge.classList.add('hidden');

  // Stop pre-buffer
  stopPreBuffer();
  learningOverlay.classList.add('hidden');
  learningOverlay.classList.remove('fade-out', 'ready');

  if (detector) {
    detector.stop();
  }

  setHudStatus('idle', 'Stopped — press Start');
}

/* ============================================================
   UI Helpers
   ============================================================ */

function setHudStatus(state, label) {
  const dot = hudStatus.querySelector('.hud-dot');
  const labelEl = hudStatus.querySelector('.hud-label');

  dot.className = 'hud-dot ' + state;
  labelEl.textContent = label;
}

function updateClipsCounter() {
  clipsCount.textContent = sessionClipCount;
}

function showToast() {
  if (toastTimeout) clearTimeout(toastTimeout);
  clipToast.classList.remove('hidden');
  toastTimeout = setTimeout(() => {
    clipToast.classList.add('hidden');
  }, 2500);
}

/* ============================================================
   Event Listeners
   ============================================================ */

// Home → Record
btnStartRecording.addEventListener('click', enterRecordView);

// Home → Gallery
btnViewGallery.addEventListener('click', () => showView('gallery'));

// Record → Home
btnBackHome.addEventListener('click', leaveRecordView);

// Toggle session
btnToggleSession.addEventListener('click', () => {
  if (sessionActive) {
    stopSession();
  } else {
    startSession();
  }
});

// Gallery → Home
btnGalleryBack.addEventListener('click', () => showView('home'));

// Gallery empty state → Record
btnEmptyRecord.addEventListener('click', enterRecordView);

/* ============================================================
   Boot — Connect to detection server
   ============================================================ */

(async function boot() {
  // Quick check if detection server is reachable
  let serverReachable = false;
  try {
    const ws = new WebSocket('ws://localhost:8765');
    await new Promise((resolve) => {
      ws.onopen = () => { serverReachable = true; ws.close(); resolve(); };
      ws.onerror = () => resolve();
      setTimeout(resolve, 2000);
    });
  } catch (e) {
    // Server not running — that's ok, we'll show a warning
  }

  // Hide loading overlay
  loadingOverlay.classList.add('hidden');
  setTimeout(() => loadingOverlay.remove(), 500);

  if (!serverReachable) {
    console.warn('Detection server not running at ws://localhost:8765');
    console.warn('Start it with: python -m server.server');
  }

  console.log('PingPonger ready — BlurBall detection mode');

  // Update gallery button label with clip count
  const count = await getClipCount();
  if (count > 0) {
    btnViewGallery.dataset.label = `VIEW GALLERY (${count})`;
  }
})();
