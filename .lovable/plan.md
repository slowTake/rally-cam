
## Add clear camera-permission prompt + denied fallback

### Current state
`src/routes/record.tsx` already has minimal `loading` / `denied` / `unsupported` states, but:
- `loading` just shows "Starting camera…" with no explanation of *why* the prompt appears or what to do.
- `denied` only offers "Try again" (full reload) and a tiny text link back home — no clear way to reach Gallery, no guidance on how to unblock the permission per-browser.
- The recorder hook auto-starts the camera on mount, so there's no explicit "Allow camera" CTA before the browser prompt fires — users see the system prompt with no app-side context.

### Fix (visual + UX only — no recorder logic changes)

**`src/routes/record.tsx` only.** Improve the three pre-record states already in the file:

1. **Loading state** — add a clear, friendly explainer above the spinner:
   - Heading: "Camera access needed"
   - Body: "Your browser will ask for permission to use the camera and microphone. Nothing is uploaded — clips stay on your device."
   - Keep the spinner + "Waiting for permission…" label.
   - Add a secondary "Back to home" link and a "Gallery" link so users are never trapped.

2. **Denied state** — expand the existing block:
   - Heading stays "Camera access blocked".
   - Add a short, generic how-to: "To enable: tap the lock/info icon in your browser's address bar → Site settings → allow Camera, then reload."
   - Buttons row: primary "Try again" (reload), secondary "Open Gallery" (`/gallery`), tertiary text link "Back to home" (`/`).

3. **Unsupported state** — keep current copy, but also add a "Gallery" button next to "Back to home" so the user can still browse saved clips on a device without a camera.

All three overlays sit above the video element with `z-20` (already the case) and use the existing token classes (`bg-background`, `text-foreground`, `Button` variants, `text-muted-foreground`). No new tokens, no new components, no changes to `useRecorder`, routing, or the recorder lifecycle.

### Out of scope
- No changes to `use-recorder.ts` (permission flow, auto-start behavior).
- No new pre-prompt "Allow camera" gate screen — adding one would change the recorder lifecycle (it currently auto-starts on mount), which the user said not to touch. The improved loading copy already explains the prompt before it appears in practice on most browsers, and the denied state now has full fallback navigation.
- No changes to landing, gallery, or review pages.
