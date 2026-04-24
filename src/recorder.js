/**
 * recorder.js — MediaRecorder wrapper for capturing video clips
 *
 * Simple approach: start a fresh recorder when ball is in play,
 * stop it when the ball disappears. Each clip is a clean recording.
 */

let mediaRecorder = null;
let chunks = [];
let recordingStartTime = 0;
let resolveStop = null;

/**
 * Start recording the stream.
 * @param {MediaStream} stream
 */
export function startRecording(stream) {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    console.warn('Recorder already active, stopping first');
    mediaRecorder.stop();
  }

  chunks = [];
  const mimeType = _getMimeType();

  try {
    mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 2_500_000,
    });
  } catch (e) {
    // Fallback without specifying mime
    console.warn('MediaRecorder fallback:', e.message);
    mediaRecorder = new MediaRecorder(stream);
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: mediaRecorder.mimeType || mimeType });
    const duration = (performance.now() - recordingStartTime) / 1000;

    console.log(`📹 MediaRecorder stopped: ${chunks.length} chunks, ${blob.size} bytes, ${duration.toFixed(1)}s`);

    if (resolveStop) {
      resolveStop({ blob, duration });
      resolveStop = null;
    }
    chunks = [];
  };

  mediaRecorder.onerror = (e) => {
    console.error('MediaRecorder error:', e.error);
  };

  recordingStartTime = performance.now();
  mediaRecorder.start(250); // Collect data every 250ms
  console.log(`🔴 Recording started (${mimeType})`);
}

/**
 * Stop recording and return the clip.
 * @returns {Promise<{blob: Blob, duration: number}>}
 */
export function stopRecording() {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      reject(new Error('Not recording'));
      return;
    }

    resolveStop = resolve;

    // Request any pending data before stopping
    if (mediaRecorder.state === 'recording') {
      mediaRecorder.requestData();
    }

    // Small delay to ensure last chunk arrives
    setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
    }, 100);
  });
}

/**
 * Check if currently recording.
 * @returns {boolean}
 */
export function isRecording() {
  return mediaRecorder !== null && mediaRecorder.state === 'recording';
}

/**
 * Start pre-buffer (no-op for now — kept for API compat).
 */
export function startPreBuffer(stream) {
  // Pre-buffer disabled — using clean start/stop per rally instead
}

/**
 * Stop pre-buffer (no-op for now — kept for API compat).
 */
export function stopPreBuffer() {
  // Pre-buffer disabled
}

/* ---- Helpers ---- */

function _getMimeType() {
  const types = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}
