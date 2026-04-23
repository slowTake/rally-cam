
## Add Gallery Navigation + Confirm Local Storage

### Current state
- Landing page (`/`) already has a "View Gallery" button — no change needed.
- Recording page (`/record`) has no link to the gallery.
- Storage is already 100% local-on-device via **IndexedDB** (`src/lib/clips-store.ts`). IndexedDB is the correct local browser storage for video Blobs (regular `localStorage` only holds ~5MB of strings and can't store Blobs efficiently — videos would not fit). Nothing leaves the device.

### Changes

**1. `src/routes/record.tsx` — add a Gallery button to the camera screen**
- Add a small icon+label button in the **top bar**, opposite the existing back arrow, that links to `/gallery`. Uses the `Images` icon from lucide-react, styled to match the existing top-bar back button (`bg-black/40` pill, white icon).
- Visible in both `ready` (before recording) and after recording finishes — but **hidden while `recording === true`** so it can't be tapped mid-record by accident.
- The post-recording navigation already routes to `/review`, which has its own "Gallery" link, so users always have a path to the gallery from every state.

**2. Storage clarification (no code change)**
- Keep using the existing IndexedDB store (`clips-store.ts`). It persists across sessions, stays on-device, and handles video Blobs correctly.
- No switch to `localStorage` — it's the wrong primitive for video data.

### Out of scope
- No changes to landing page (button already exists).
- No changes to gallery, review, or recording logic.
- No new storage layer.
