## Ai Hackathon Project Submission

A ping pong game recorder with local video storage and per-clip diagnostics, native mobile sharing, and a real-time WebSocket integration for AI-powered highlight clip generator.

**🏆 Top 3 Placement — AI Hackathon** This project was recognized for its efficient, privacy-focused approach to media management and its innovative use of real-time AI processing.

---

## Project Goal
The goal of this enhancement is to provide per-clip "Analyze" and "Share" actions on each gallery card, alongside a top-level "Analyze All" button. It bridges the gap between local-first storage and high-performance AI analysis via WebSockets.

---

## Key Features

### AI-Driven Highlight Extraction
* **WebSocket Integration:** The application connects to a backend via WebSockets to stream video data for live processing.
* **Automated Rally Detection:** An AI model analyzes the incoming stream to identify specific rallies or points of interest.
* **Auto-Clipping:** Once detected, highlights are automatically sliced and saved as individual clips to the local gallery in real-time.

### Local Analysis & Insights
* **Per-Clip Stats:** Instant access to created date, duration, file size, and MIME type.
* **Smart Tips:** A local heuristic engine provides one-line "Tips" based on duration (e.g., <30s: "Short rally clip", >2min: "Long session — consider trimming").
* **Library Overview:** A top-level "Analyze All" dashboard providing cumulative stats:
    * Total number of clips.
    * Total storage footprint (formatted via `formatSize`).
    * Aggregate duration (Formatted as `HH:MM:SS`).
    * Average clip length.
    * Date range (First vs. Latest capture).

### Native Sharing & Export
* **Web Share API:** Uses `navigator.share` to pass the actual video file (`File` object) directly to native apps like WhatsApp, Instagram, or AirDrop.
* **Smart Fallback:** If the browser or OS doesn't support file sharing, the system automatically triggers a local download and notifies the user via a toast: *"Sharing not supported — clip downloaded instead."*

---

## 🛠 Technical Implementation

### Components & Dependencies
* **Icons:** `Share2` and `Sparkles` from `lucide-react`.
* **UI:** `Dialog`, `DialogHeader`, `DialogTitle`, and `Toast` from the `@/components/ui` (Radix/Shadcn).
* **State Management:** Local React `useState` hooks manage modal visibility for both individual and global analysis.

### Implementation Details: `src/routes/gallery.tsx`
The logic is contained within the gallery route to maintain the promise of "Saved on this device only." 

* **Share Handler:** Builds a `File` from the clip blob: `new File([blob], filename, { type })`.
* **Local-Only Analysis:** No AI Gateway or Cloud calls are used for the summary stats, keeping the metadata private and instant.

---

## Privacy & Data Flow
* **Local Storage:** All clips are saved in the browser's IndexedDB. 
* **Hybrid AI Processing:** While the WebSocket handles intensive rally detection tasks, the resulting clips and their metadata analysis remain 100% client-side.
* **No Cloud Dependence:** No server upload or cloud storage is required for viewing or sharing; the app uses the native file system and Web APIs.

---

## Usage

1.  **AI Highlights:** Start a recording session to allow the WebSocket to identify and generate rally clips automatically.
2.  **Analyze Clip:** Click the **Sparkles** icon on any card to see file metadata and length-based tips.
3.  **Share Media:** Click the **Share** icon to send the file to another app or download it automatically as a fallback.
4.  **Full Gallery Stats:** Use the **Analyze All** button next to the Gallery heading for a complete library audit.
