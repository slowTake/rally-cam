import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Images, Video } from "lucide-react";
import { saveClip } from "@/lib/clips-store";

export const Route = createFileRoute("/track")({
  head: () => ({
    meta: [
      { title: "Tracking — Ping Pong Highlights" },
      { name: "description", content: "Live server-rendered MJPEG stream." },
    ],
  }),
  component: TrackPage,
});

const STREAM_URL = "http://localhost:8000/video_feed";
const TARGET_FPS = 30;

function formatElapsed(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function TrackPage() {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recStartRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const navigate = useNavigate();

  // Draw the incoming MJPEG stream to a hidden canvas so we can record it
  useEffect(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let stopped = false;
    const loop = () => {
      if (stopped) return;
      if (img.naturalWidth && img.naturalHeight) {
        if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
        }
        ctx.drawImage(img, 0, 0);
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const startRecording = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof MediaRecorder === "undefined") return;

    const stream = canvas.captureStream(TARGET_FPS);
    const mimeType = "video/webm";
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch {
      recorder = new MediaRecorder(stream);
    }

    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      const type = recorder.mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      if (blob.size > 0) {
        const duration = Date.now() - recStartRef.current;
        await saveClip({ blob, durationMs: duration });
        navigate({ to: "/gallery" });
      }
    };
    recorderRef.current = recorder;
    recorder.start(1000);
    recStartRef.current = Date.now();
    setElapsedMs(0);
    tickRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - recStartRef.current);
    }, 250);
    setRecording(true);
  }, [navigate]);

  const stopRecording = useCallback(() => {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") {
      try {
        r.stop();
      } catch {}
    }
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setRecording(false);
  }, []);

  const handleToggle = () => {
    if (recording) stopRecording();
    else startRecording();
  };

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden">
      {/* Hidden canvas required to convert Image to Video record stream */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Visible MJPEG Stream straight from Python server! */}
      <img
        ref={imgRef}
        src={STREAM_URL}
        crossOrigin="anonymous"
        className="absolute inset-0 w-full h-full object-contain"
        alt="Live Ping Pong Track"
      />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10 bg-gradient-to-b from-black/60 to-transparent">
        <Link
          to="/"
          className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-black/40 hover:bg-black/60 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>

        <div className="flex items-center gap-2">
          <div
            className={`px-3 py-1 rounded-full text-sm font-mono tabular-nums ${
              recording ? "text-white" : "bg-black/40"
            }`}
            style={recording ? { backgroundColor: "#ff2d2d" } : undefined}
          >
            {recording && <span className="inline-block h-2 w-2 rounded-full bg-white mr-2 animate-pulse" />}
            {formatElapsed(elapsedMs)}
          </div>

          <div
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-full bg-black/40 text-xs"
            title="Local Server Feed"
          >
            <Video className="h-4 w-4 text-emerald-400" />
            <span>Feed Active</span>
          </div>

          {!recording && (
            <Link
              to="/gallery"
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-full bg-black/40 hover:bg-black/60 transition-colors text-sm"
              aria-label="Open gallery"
            >
              <Images className="h-4 w-4" />
              <span>Gallery</span>
            </Link>
          )}
        </div>
      </div>

      {/* Record button */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-8 z-10">
        <button
          onClick={handleToggle}
          aria-label={recording ? "Stop recording" : "Start recording"}
          className="relative h-20 w-20 rounded-full bg-white/10 backdrop-blur-sm border-4 border-white flex items-center justify-center active:scale-95 transition-transform"
        >
          {recording && (
            <span className="absolute inset-0 rounded-full border-4 animate-ping" style={{ borderColor: "#ff2d2d" }} />
          )}
          <span
            className={recording ? "h-7 w-7 rounded-md" : "h-14 w-14 rounded-full"}
            style={{ backgroundColor: "#ff2d2d" }}
          />
        </button>
      </div>
    </div>
  );
}
