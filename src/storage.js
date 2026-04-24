/**
 * storage.js — IndexedDB wrapper for persisting video clips
 */

const DB_NAME = 'PingPongerDB';
const DB_VERSION = 1;
const STORE_NAME = 'clips';

let dbInstance = null;

/**
 * Open (or create) the database and return the IDBDatabase instance.
 */
function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };

    request.onerror = (e) => {
      reject(new Error('IndexedDB open failed: ' + e.target.error));
    };
  });
}

/**
 * Save a video clip.
 * @param {Blob} blob - The video blob
 * @param {{ duration: number }} meta - Clip metadata
 * @returns {Promise<number>} The inserted clip ID
 */
export async function saveClip(blob, meta = {}) {
  const db = await openDB();
  const thumbnail = await generateThumbnail(blob);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const record = {
      blob,
      thumbnail,
      timestamp: Date.now(),
      duration: meta.duration || 0,
      detectionCount: meta.detectionCount || 0,
      maxScore: meta.maxScore || 0,
    };

    const request = store.add(record);
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(new Error('Failed to save clip: ' + e.target.error));
  });
}

/**
 * Get all clips (metadata only — no blob, for gallery listing).
 * @returns {Promise<Array>}
 */
export async function getAllClips() {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const clips = request.result.map((clip) => ({
        id: clip.id,
        thumbnail: clip.thumbnail,
        timestamp: clip.timestamp,
        duration: clip.duration,
        detectionCount: clip.detectionCount || 0,
        maxScore: clip.maxScore || 0,
      }));
      // Sort newest first
      clips.sort((a, b) => b.timestamp - a.timestamp);
      resolve(clips);
    };

    request.onerror = (e) => reject(new Error('Failed to get clips: ' + e.target.error));
  });
}

/**
 * Get a full clip (including blob) by ID.
 * @param {number} id
 * @returns {Promise<Object>}
 */
export async function getClip(id) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(new Error('Failed to get clip: ' + e.target.error));
  });
}

/**
 * Delete a clip by ID.
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function deleteClip(id) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(new Error('Failed to delete clip: ' + e.target.error));
  });
}

/**
 * Get total clip count.
 * @returns {Promise<number>}
 */
export async function getClipCount() {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.count();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(0);
  });
}

/**
 * Delete all clips.
 * @returns {Promise<void>}
 */
export async function deleteAllClips() {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(new Error('Failed to delete all clips: ' + e.target.error));
  });
}

/**
 * Extract the first frame of a video blob as a thumbnail data URL.
 * @param {Blob} blob
 * @returns {Promise<string>} data URL of the thumbnail
 */
function generateThumbnail(blob) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const url = URL.createObjectURL(blob);
    video.src = url;

    // Timeout — if thumbnail generation takes too long, give up
    const timeout = setTimeout(() => {
      cleanup();
      resolve('');
    }, 5000);

    function cleanup() {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      video.remove();
    }

    video.onloadeddata = () => {
      // Seek past the first frame to get a proper decoded frame
      video.currentTime = Math.min(0.3, video.duration * 0.2);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        // Use video's natural aspect ratio
        const vw = video.videoWidth || 320;
        const vh = video.videoHeight || 180;
        const thumbWidth = 320;
        const thumbHeight = Math.round((vh / vw) * thumbWidth);
        canvas.width = thumbWidth;
        canvas.height = thumbHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Verify the image isn't blank (check a few pixels)
        const sample = ctx.getImageData(0, 0, 1, 1).data;
        const isBlank = sample[0] === 0 && sample[1] === 0 && sample[2] === 0 && sample[3] === 0;

        const dataUrl = isBlank ? '' : canvas.toDataURL('image/jpeg', 0.75);
        cleanup();
        resolve(dataUrl);
      } catch (e) {
        cleanup();
        resolve('');
      }
    };

    video.onerror = () => {
      cleanup();
      resolve('');
    };
  });
}
