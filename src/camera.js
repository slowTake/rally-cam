/**
 * camera.js — Camera access and management
 */

let currentStream = null;

/**
 * Initialize the camera and bind to a video element.
 * @param {HTMLVideoElement} videoEl
 * @returns {Promise<MediaStream>}
 */
export async function initCamera(videoEl) {
  // Stop any existing stream first
  stopCamera(videoEl);

  const constraints = {
    video: {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  };

  try {
    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    videoEl.srcObject = currentStream;

    // Wait for video to be ready
    await new Promise((resolve, reject) => {
      videoEl.onloadedmetadata = () => {
        videoEl.play().then(resolve).catch(reject);
      };
      videoEl.onerror = reject;
    });

    return currentStream;
  } catch (err) {
    console.error('Camera init failed:', err);
    throw new Error(
      err.name === 'NotAllowedError'
        ? 'Camera permission denied. Please allow camera access and try again.'
        : err.name === 'NotFoundError'
          ? 'No camera found. Please connect a camera and try again.'
          : `Camera error: ${err.message}`
    );
  }
}

/**
 * Stop the camera and release resources.
 * @param {HTMLVideoElement} videoEl
 */
export function stopCamera(videoEl) {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
  }
  if (videoEl) {
    videoEl.srcObject = null;
  }
}

/**
 * Get the current active stream.
 * @returns {MediaStream|null}
 */
export function getStream() {
  return currentStream;
}
