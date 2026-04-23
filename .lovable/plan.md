
## Recording UI — Camera Preview + Record Button (Landscape-Locked)

Build the core recording screen: live camera preview with a single button to start/stop recording. The recording experience is **landscape-first** so the wide ping pong table fits naturally in frame.

### Scope
- Replace the placeholder on `/` with a clean landing that links to `/record`.
- Build `/record` with live camera preview, start/stop button, and landscape orientation enforcement.
- Add `/review` as a stub destination after recording stops.

### `/` — Landing (portrait-friendly)
- Title: "Ping Pong Highlights"
- Tagline: "Record a match, get rally highlights."
- Primary button: "Start Recording" → `/record`.
- Small hint below: "Tip: turn your phone sideways for best results."
- Dark, centered, mobile-first.

### `/record` — Camera + Recording (landscape-locked)

Layout (full viewport, dark, designed for landscape):
```text
┌──────────────────────────────────────────────┐
│ ←                  00:23                     │
│                                              │
│                                              │
│            [ live camera preview ]           │
│                                              │
│                                              │
│                    ( ⬤ )                     │
└──────────────────────────────────────────────┘
```

Landscape enforcement (layered, since browsers vary):
1. **Try to lock**: on mount, call `screen.orientation.lock("landscape")`. Works on Android Chrome when in fullscreen; silently fails elsewhere — that's fine.
2. **Request fullscreen** (optional, on user gesture) to make the lock effective on supporting devices.
3. **CSS rotate fallback**: when `window.matchMedia("(orientation: portrait)")` matches, show a full-screen overlay with a rotating-phone icon and the message "Please rotate your device to landscape." The camera UI is hidden until the user rotates. This guarantees correct framing on iOS Safari (which doesn't support orientation lock).
4. On unmount: `screen.orientation.unlock()` and exit fullscreen if we entered it.

Recording behavior:
- On mount (after orientation OK): request `getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: true })` and attach to a muted, autoplay, `playsInline` `<video>` (object-cover).
- Record button states:
  - **Idle**: large red circle. Tap → start `MediaRecorder`, button becomes a red square, timer starts.
  - **Recording**: red square with a pulsing ring, timer counts mm:ss.
  - Tap again → stop, assemble chunks into one `Blob` (`video/webm`), stash it, navigate to `/review`.
- Top-left back link returns to `/` and stops the stream.

Permission / unsupported states:
- **Permission denied**: message + "Try again" button.
- **No camera / unsupported browser**: friendly message + back link.
- **Portrait**: rotation prompt overlay (above).
- Loading spinner while acquiring the stream.

### `/review` — Stub
- Plays back the recorded blob in `<video controls playsInline>` (also presented landscape-friendly).
- Buttons: "Retake" (→ `/record`) and "Analyze" (disabled placeholder for next step).

### Technical details
- **Routes**:
  - `src/routes/index.tsx` — replace placeholder with landing.
  - `src/routes/record.tsx` — new.
  - `src/routes/review.tsx` — new (stub).
- **Recording store**: `src/lib/recording-store.ts` — module-level `{ blob, url }` holder with `setRecording` / `getRecording` / `clearRecording`. Avoids serializing a Blob through router state.
- **Recorder hook**: `src/hooks/use-recorder.ts` — wraps `getUserMedia` + `MediaRecorder`. Exposes `{ status, videoRef, start, stop, elapsedMs, error }` where `status ∈ "idle" | "loading" | "ready" | "recording" | "denied" | "unsupported"`. Picks the first supported MIME via `MediaRecorder.isTypeSupported` (vp9/opus → vp8 → default).
- **Orientation hook**: `src/hooks/use-landscape-lock.ts` — attempts `screen.orientation.lock`, exposes `isPortrait` for the CSS fallback overlay, cleans up on unmount.
- **Cleanup**: stop all tracks on unmount; revoke blob URLs when starting a retake.
- **Styling**: Tailwind, `bg-black` recording surface, existing shadcn `Button` for secondary actions; record button is a custom circular control sized for thumb use.

### Out of scope
- Front/rear toggle, zoom, framing guides.
- Real rally analysis + highlights list (next step).
- Uploading or persistent storage.
