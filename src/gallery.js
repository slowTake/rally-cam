/**
 * gallery.js — Gallery rendering and playback (Rally-Cam style)
 *
 * Cards show inline video players like rally-cam, with metadata + action buttons.
 */

import { getAllClips, getClip, deleteClip, deleteAllClips } from './storage.js';

// DOM elements
const galleryGrid = document.getElementById('gallery-grid');
const galleryEmpty = document.getElementById('gallery-empty');
const galleryCount = document.getElementById('gallery-count');
const playbackModal = document.getElementById('playback-modal');
const playbackVideo = document.getElementById('playback-video');
const modalDate = document.getElementById('modal-date');
const modalDuration = document.getElementById('modal-duration');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnDeleteClip = document.getElementById('btn-delete-clip');
const btnDeleteAll = document.getElementById('btn-delete-all');
const btnDownloadClip = document.getElementById('btn-download-clip');

let currentClipId = null;
let currentBlobUrl = null;
let currentClipBlob = null;

// Track blob URLs for cleanup
const cardBlobUrls = [];

function cleanupCardUrls() {
  cardBlobUrls.forEach((url) => URL.revokeObjectURL(url));
  cardBlobUrls.length = 0;
}

/**
 * Render the gallery grid.
 */
export async function renderGallery() {
  cleanupCardUrls();
  const clips = await getAllClips();

  const count = clips.length;
  galleryCount.textContent = count > 0
    ? `${count} clip${count !== 1 ? 's' : ''} — saved on this device only.`
    : 'Saved on this device only.';

  // Show/hide delete all button
  if (btnDeleteAll) {
    btnDeleteAll.style.display = count > 0 ? 'inline-flex' : 'none';
  }

  if (count === 0) {
    galleryGrid.innerHTML = '';
    galleryGrid.style.display = 'none';
    galleryEmpty.classList.remove('hidden');
    return;
  }

  galleryEmpty.classList.add('hidden');
  galleryGrid.style.display = 'grid';

  // Build cards — each card gets its own video player
  galleryGrid.innerHTML = '';

  for (const clip of clips) {
    const card = document.createElement('div');
    card.className = 'clip-card';
    card.dataset.id = clip.id;

    // Video wrapper
    const videoWrapper = document.createElement('div');
    videoWrapper.className = 'clip-video-wrapper';

    // Load the actual video blob
    try {
      const fullClip = await getClip(clip.id);
      if (fullClip && fullClip.blob) {
        const url = URL.createObjectURL(fullClip.blob);
        cardBlobUrls.push(url);
        const video = document.createElement('video');
        video.src = url;
        video.controls = true;
        video.playsInline = true;
        video.preload = 'metadata';
        videoWrapper.appendChild(video);
      } else {
        videoWrapper.innerHTML = `<div class="clip-video-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        </div>`;
      }
    } catch {
      videoWrapper.innerHTML = `<div class="clip-video-placeholder">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      </div>`;
    }

    // Info row
    const infoRow = document.createElement('div');
    infoRow.className = 'clip-info-row';

    infoRow.innerHTML = `
      <div class="clip-meta">
        <p class="clip-meta-title">${formatDate(clip.timestamp)}</p>
        <p class="clip-meta-sub">${formatDuration(clip.duration)}</p>
      </div>
      <div class="clip-actions">
        <button class="clip-action-btn" data-action="download" title="Download" aria-label="Download">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
        </button>
        <button class="clip-action-btn" data-action="delete" title="Delete" aria-label="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          </svg>
        </button>
      </div>
    `;

    card.appendChild(videoWrapper);
    card.appendChild(infoRow);
    galleryGrid.appendChild(card);

    // Action handlers
    const downloadBtn = infoRow.querySelector('[data-action="download"]');
    const deleteBtn = infoRow.querySelector('[data-action="delete"]');

    downloadBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const c = await getClip(clip.id);
      if (!c) return;
      const ext = (c.blob.type || '').includes('mp4') ? 'mp4' : 'webm';
      const ts = new Date(clip.timestamp).toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(c.blob);
      a.download = `pingpong-${ts}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    });

    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this clip?')) return;
      await deleteClip(clip.id);
      await renderGallery();
    });
  }
}

/**
 * Delete all clips.
 */
async function handleDeleteAll() {
  if (!confirm('Delete all clips? This cannot be undone.')) return;
  try {
    await deleteAllClips();
    await renderGallery();
  } catch (err) {
    console.error('Failed to delete all clips:', err);
  }
}

/**
 * Download clip from modal.
 */
function handleDownload() {
  if (!currentClipBlob) return;
  const ext = (currentClipBlob.type || '').includes('mp4') ? 'mp4' : 'webm';
  const filename = `pingpong_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.${ext}`;
  const url = URL.createObjectURL(currentClipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Bind delete all
if (btnDeleteAll) {
  btnDeleteAll.addEventListener('click', handleDeleteAll);
}

// Bind download
if (btnDownloadClip) {
  btnDownloadClip.addEventListener('click', handleDownload);
}

// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !playbackModal.classList.contains('hidden')) {
    closeModal();
  }
});

function closeModal() {
  playbackVideo.pause();
  playbackVideo.src = '';
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
  currentClipId = null;
  currentClipBlob = null;
  playbackModal.classList.add('hidden');
}

// Modal close button
btnCloseModal.addEventListener('click', closeModal);
playbackModal.addEventListener('click', (e) => {
  if (e.target === playbackModal) closeModal();
});

// Modal delete button
btnDeleteClip.addEventListener('click', async () => {
  if (currentClipId === null) return;
  const id = currentClipId;
  closeModal();
  await deleteClip(id);
  await renderGallery();
});

/* ---- Formatting helpers ---- */

function formatDate(ts) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}
