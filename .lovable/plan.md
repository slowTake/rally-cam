
## Fix Landscape Orientation + Confirm Local-Only Storage

### Storage decision
Keep the MVP **fully client-side**. Recordings stay in-browser as a `Blob` (already implemented in `src/lib/recording-store.ts`). No upload, no Cloud Storage. Add a **Download** button on `/review` so the user can save the file to their phone's Files/Photos app if they want to keep it.

### Why landscape currently looks wrong
1. `useLandscapeLock` flags any portrait-shaped viewport as "needs rotation" — so the desktop preview window (and any non-touch device) gets the rotate overlay incorrectly.
2. The preview `<video>` uses `object-cover`, which crops the camera feed to fill the screen. The recorded file is fine — only the live preview looks off.
3. Front-facing cameras render un-mirrored in the preview, which feels unnatural (the saved file is unaffected).

### Fixes

**1. `src/hooks/use-landscape-lock.ts` — only enforce on touch devices**
- Detect touch via `matchMedia("(pointer: coarse)")`.
- Only set `isPortrait = true` when device is touch AND orientation is portrait.
- Desktops/laptops: never show the rotate overlay.

**2. `src/routes/record.tsx` — better preview rendering**
- Switch preview `<video>` from `object-cover` to `object-contain` so the full camera frame is visible (matches what's recorded).
- Mirror the preview (`scale-x-[-1]`) only when active track's `facingMode === "user"`. Recorded file remains un-mirrored.

**3. `src/routes/review.tsx` — local download + clarity**
- Add a **Download** button that saves the blob as `pingpong-match-{timestamp}.webm` via a temporary `<a download>` link.
- Add a small note under the video: "Saved in this browser tab only — download to keep it."

### Out of scope
- Cloud upload / Lovable Cloud Storage.
- Server-side transcoding.
- Persistent history across sessions.
