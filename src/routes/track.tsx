import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Images, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveClip } from "@/lib/clips-store";

export const Route = createFileRoute("/track")({
  head: () => ({
    meta: [
      { title: "Tracking — Ping Pong Highlights" },
      {
        name: "description",
        content:
          "Live webcam tracking with server-driven bounding boxes over WebSocket.",
      },
    ],
  }),
  component: TrackPage,
});

const WS_URL = "ws://localhost:8000/ws/track";
const TARGET_FPS = 30;
const JPEG_QUALITY = 0.6;
const SEND_WIDTH = 640; // downscaled width for the frame sent to server

type WSStatus = "connecting" | "open" | "closed" | "error";

type TrackMessage = {
  visi?: boolean;
  bbox?: [number, number, number, number];
};

function formatElapsed(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

function TrackPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null); // visible: video + bbox composite
  const sendCanvasRef = useRef<HTMLCanvasElement | null>(null); // hidden: downscaled JPEG source
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);
  const lastBoxRef = useRef<{
    bbox: [number, number, number, number];
    sentW: number;
    sentH: number;
  } | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recStartRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  const [camStatus, setCamStatus] = useState<
    "idle" | "loading" | "ready" | "denied" | "unsupported"
  >("idle");
  const [wsStatus, setWsStatus] = useState<WSStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const navigate = useNavigate();

  // Acquire webcam
  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        setCamStatus("unsupported");
        return;
      }
      setCamStatus("loading");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {
            /* gesture may be required */
          });
        }
        setCamStatus("ready");
      } catch (err) {
        const e = err as DOMException;
        if (
          e?.name === "NotAllowedError" ||
          e?.name === "SecurityError" ||
          e?.name === "PermissionDeniedError"
        ) {
          setCamStatus("denied");
        } else {
          setError(e?.message ?? "Camera error");
          setCamStatus("unsupported");
        }
      }
    }
    init();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // WebSocket lifecycle
  useEffect(() => {
    let ws: WebSocket | null = null;
    let closedByUs = false;
    function connect() {
      try {
        ws = new WebSocket(WS_URL);
        wsRef.current = ws;
        setWsStatus("connecting");
        ws.onopen = () => setWsStatus("open");
        ws.onclose = () => {
          setWsStatus("closed");
          if (!closedByUs) {
            // simple backoff retry
            setTimeout(connect, 1500);
          }
        };
        ws.onerror = () => setWsStatus("error");
        ws.onmessage = (evt) => {
          try {
            const data: TrackMessage = JSON.parse(
              typeof evt.data === "string" ? evt.data : "",
            );
            if (data?.visi && Array.isArray(data.bbox) && data.bbox.length === 4) {
              const sendCanvas = sendCanvasRef.current;
              lastBoxRef.current = {
                bbox: data.bbox as [number, number, number, number],
                sentW: sendCanvas?.width ?? SEND_WIDTH,
                sentH: sendCanvas?.height ?? SEND_WIDTH,
              };
            } else {
              lastBoxRef.current = null;
            }
          } catch {
            /* ignore malformed messages */
          }
        };
      } catch {
        setWsStatus("error");
      }
    }
    connect();
    return () => {
      closedByUs = true;
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    };
  }, []);

  // Render loop: draw video to overlay canvas + bbox, throttle sends to TARGET_FPS
  useEffect(() => {
    if (camStatus !== "ready") return;
    const video = videoRef.current;
    const overlay = overlayRef.current;
    const sendCanvas = sendCanvasRef.current;
    if (!video || !overlay || !sendCanvas) return;

    const overlayCtx = overlay.getContext("2d");
    const sendCtx = sendCanvas.getContext("2d");
    if (!overlayCtx || !sendCtx) return;

    const frameInterval = 1000 / TARGET_FPS;
    let stopped = false;

    const loop = () => {
      if (stopped) return;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw && vh) {
        if (overlay.width !== vw || overlay.height !== vh) {
          overlay.width = vw;
          overlay.height = vh;
        }
        const ratio = vh / vw;
        const sw = SEND_WIDTH;
        const sh = Math.round(sw * ratio);
        if (sendCanvas.width !== sw || sendCanvas.height !== sh) {
          sendCanvas.width = sw;
          sendCanvas.height = sh;
        }

        // Draw the live frame onto the visible overlay canvas
        overlayCtx.drawImage(video, 0, 0, vw, vh);

        // Draw bbox if we have one (scale from sent-frame coords to overlay coords)
        const box = lastBoxRef.current;
        if (box) {
          const [x1, y1, x2, y2] = box.bbox;
          const sx = vw / box.sentW;
          const sy = vh / box.sentH;
          const rx = x1 * sx;
          const ry = y1 * sy;
          const rw = (x2 - x1) * sx;
          const rh = (y2 - y1) * sy;
          overlayCtx.lineWidth = Math.max(3, Math.round(vw / 320));
          overlayCtx.strokeStyle = "#00ff44";
          overlayCtx.shadowColor = "rgba(0,0,0,0.6)";
          overlayCtx.shadowBlur = 6;
          overlayCtx.strokeRect(rx, ry, rw, rh);
          overlayCtx.shadowBlur = 0;
        }

        // Throttled send
        const now = performance.now();
        if (
          now - lastSentRef.current >= frameInterval &&
          wsRef.current?.readyState === WebSocket.OPEN
        ) {
          lastSentRef.current = now;
          sendCtx.drawImage(video, 0, 0, sendCanvas.width, sendCanvas.height);
          const dataUrl = sendCanvas.toDataURL("image/jpeg", JPEG_QUALITY);
          // Strip "data:image/jpeg;base64," prefix to send pure base64
          const base64 = dataUrl.split(",")[1] ?? dataUrl;
          try {
            wsRef.current.send(JSON.stringify({ image: base64 }));
          } catch {
            /* ignore transient send errors */
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [camStatus]);

  const startRecording = useCallback(() => {
    const overlay = overlayRef.current;
    const audioStream = streamRef.current;
    if (!overlay || !audioStream) return;
    if (typeof MediaRecorder === "undefined") return;

    const canvasStream = overlay.captureStream(TARGET_FPS);
    audioStream.getAudioTracks().forEach((t) => canvasStream.addTrack(t));

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(canvasStream, { mimeType })
        : new MediaRecorder(canvasStream);
    } catch (err) {
      setError((err as Error)?.message ?? "Recorder error");
      return;
    }
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      const type = recorder.mimeType || mimeType || "video/webm";
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
      } catch {
        /* ignore */
      }
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
      {/* Hidden source video (drawn into canvas) */}
      <video ref={videoRef} className="hidden" muted playsInline autoPlay />
      {/* Hidden downscale canvas for sending */}
      <canvas ref={sendCanvasRef} className="hidden" />

      {/* Visible composited canvas */}
      <canvas
        ref={overlayRef}
        className="absolute inset-0 w-full h-full object-contain"
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
            {recording && (
              <span className="inline-block h-2 w-2 rounded-full bg-white mr-2 animate-pulse" />
            )}
            {formatElapsed(elapsedMs)}
          </div>

          <div
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-full bg-black/40 text-xs"
            title={`WebSocket: ${wsStatus}`}
          >
            {wsStatus === "open" ? (
              <Wifi className="h-4 w-4 text-emerald-400" />
            ) : (
              <WifiOff
                className={`h-4 w-4 ${
                  wsStatus === "connecting" ? "text-yellow-400" : "text-red-400"
                }`}
              />
            )}
            <span className="capitalize">{wsStatus}</span>
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
      {camStatus === "ready" && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-8 z-10">
          <button
            onClick={handleToggle}
            aria-label={recording ? "Stop recording" : "Start recording"}
            className="relative h-20 w-20 rounded-full bg-white/10 backdrop-blur-sm border-4 border-white flex items-center justify-center active:scale-95 transition-transform"
          >
            {recording && (
              <span
                className="absolute inset-0 rounded-full border-4 animate-ping"
                style={{ borderColor: "#ff2d2d" }}
              />
            )}
            <span
              className={
                recording ? "h-7 w-7 rounded-md" : "h-14 w-14 rounded-full"
              }
              style={{ backgroundColor: "#ff2d2d" }}
            />
          </button>
        </div>
      )}

      {/* Loading */}
      {camStatus === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/90 px-6">
          <div className="max-w-sm w-full text-center space-y-5">
            <h2 className="text-xl font-semibold">Camera access needed</h2>
            <p className="text-sm text-white/70">
              Allow camera and microphone to begin tracking. Frames are sent to
              your local tracker at <code>{WS_URL}</code>.
            </p>
            <div className="h-8 w-8 mx-auto rounded-full border-2 border-white/20 border-t-white animate-spin" />
          </div>
        </div>
      )}

      {/* Denied */}
      {camStatus === "denied" && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/90 px-6">
          <div className="max-w-sm w-full text-center space-y-4">
            <h2 className="text-xl font-semibold">Camera access blocked</h2>
            <p className="text-sm text-white/70">
              Please allow camera access to use tracking.
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              <Button onClick={() => window.location.reload()}>Try again</Button>
              <Link to="/">
                <Button variant="secondary">Back to home</Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Unsupported */}
      {camStatus === "unsupported" && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/90 px-6">
          <div className="max-w-sm w-full text-center space-y-4">
            <h2 className="text-xl font-semibold">Camera not available</h2>
            <p className="text-sm text-white/70">
              {error ?? "Your browser or device doesn't support recording."}
            </p>
            <Link to="/">
              <Button variant="secondary">Back to home</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
