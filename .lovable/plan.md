

## Add Analyze + Share to Gallery

### Goal
Per-clip "Analyze" and "Share" actions on each gallery card, plus a top-level "Analyze All" button. Analyze produces a lightweight client-side summary (count, total duration, average length, total size, date range). Share uses the native Web Share API to send the actual video file to other apps, with a download fallback when sharing isn't supported.

### Changes — `src/routes/gallery.tsx` only

**1. New imports**
- Add `Share2`, `Sparkles` from `lucide-react`.
- Add `useState` is already imported.
- Add `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription` from `@/components/ui/dialog`.
- Add `toast` from `sonner` for share/copy feedback.

**2. Per-clip Share button (in `ClipCard`)**
- New icon button next to Download/Delete using `Share2`.
- Handler: load the clip blob, build a `File` from it (`new File([blob], filename, { type })`), then:
  - If `navigator.canShare?.({ files: [file] })` → `navigator.share({ files: [file], title: "Ping pong clip" })`.
  - Else fall back to triggering the existing download flow and toast: "Sharing not supported — clip downloaded instead."
- Wrap in try/catch; ignore `AbortError` (user cancelled share sheet).

**3. Per-clip Analyze button (in `ClipCard`)**
- New icon button using `Sparkles`.
- Opens a small dialog with this clip's stats: created date, duration, file size, MIME type, and a one-line "Tip" string chosen from duration buckets (e.g. <30s "Short rally clip", 30s–2min "Standard match clip", >2min "Long session — consider trimming").
- This is local/heuristic only — no AI call, no upload. Keeps the gallery promise of "Saved on this device only."

**4. Top-level "Analyze all" button (in `GalleryPage`)**
- Shown only when `clips && clips.length > 0`, placed in a flex row next to the "Gallery" heading (heading on left, button on right).
- Uses `Sparkles` icon, `variant="outline"`, `size="sm"`.
- Opens a dialog summarizing the full library:
  - Total clips
  - Total duration (sum of `durationMs`, formatted `HH:MM:SS`)
  - Total storage (sum of `size`, formatted via existing `formatSize`)
  - Average clip length
  - First clip date / latest clip date (from `createdAt` min/max)
  - Same heuristic tip based on average duration.

**5. State**
- `const [analyzeOpen, setAnalyzeOpen] = useState(false)` at gallery level.
- `const [clipAnalyzeOpen, setClipAnalyzeOpen] = useState(false)` inside `ClipCard`.

### Out of scope
- No server upload, no cloud storage, no AI Gateway call — clips stay local as the page already promises. (Happy to add a Lovable Cloud upload + AI-powered analysis as a follow-up if you want real ML insight; that's a bigger change requiring backend setup.)
- No changes to `clips-store.ts`, recorder, or other routes.
- No new dependencies — `Dialog`, `sonner`, and `lucide-react` icons already exist in the project.

### Notes
- Web Share API with files works on iOS Safari, Android Chrome, and most mobile browsers; desktop browsers mostly fall back to the download path, which is why the fallback exists.
- If you'd rather the "Share" button always download + copy a "shareable link" instead, say the word — but real link sharing requires uploading the clip somewhere (Lovable Cloud Storage), which the current local-only design avoids.

