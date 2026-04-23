
## Fix: Auto-save clips to Gallery on stop

### The bug
After stopping a recording, the blob is only kept in **memory** (`setRecording` in `src/lib/recording-store.ts`) — it's never written to **IndexedDB** (`saveClip` in `src/lib/clips-store.ts`). That's why the Gallery is empty: nothing ever gets persisted. The "Download" button on `/review` just exports the in-memory blob; it doesn't save to the gallery either. The footer text on `/review` ("also visible in your Gallery") is currently a lie.

### Fix

**`src/routes/record.tsx` — persist on stop**

In `handleToggle`, after `stop()` returns the blob, also call `saveClip` so the recording is written to IndexedDB before navigating to `/review`:

```ts
const blob = await stop();
if (blob && blob.size > 0) {
  setRecording(blob);
  await saveClip({ blob, durationMs: elapsedMs }); // NEW
  navigate({ to: "/review" });
}
```

Add the import: `import { saveClip } from "@/lib/clips-store";`

That's it. After this change:
- Every stopped recording auto-appears in `/gallery`.
- Download is still optional (it's just a way to export off-device).
- No other files change. Existing IndexedDB store, gallery UI, and review screen all keep working as-is.

### Why no schema/UI change
- `saveClip` already accepts `{ blob, durationMs }` and the recorder already exposes `elapsedMs`.
- Gallery already lists clips from IndexedDB, so once we save, they show up automatically.

### Out of scope
- Retroactively saving clips that were recorded before this fix (those blobs are gone).
- De-duplicating if the user navigates back to `/record` and stops again (each stop = one new clip, which is the intended behavior).
