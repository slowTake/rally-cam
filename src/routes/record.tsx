import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRecorder } from "@/hooks/use-recorder";
import { useLandscapeLock } from "@/hooks/use-landscape-lock";
import { setRecording } from "@/lib/recording-store";

export const Route = createFileRoute("/record")({
  head: () => ({
    meta: [
      { title: "Record — Ping Pong Highlights" },
      { name: "description", content: "Record your ping pong match." },
    ],
  }),
  component: RecordPage,
});

function formatElapsed(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function RecordPage() {
  const { isPortrait } = useLandscapeLock();
  const { status, error, elapsedMs, videoRef, start, stop, facingMode } = useRecorder();
  const navigate = useNavigate();

  const handleToggle = async () => {
    if (status === "ready") {
      start();
    } else if (status === "recording") {
      const blob = await stop();
      if (blob && blob.size > 0) {
        setRecording(blob);
        navigate({ to: "/review" });
      }
    }
  };

  const recording = status === "recording";
  const mirrored = facingMode === "user";

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden">
      {/* Live preview */}
      <video
        ref={videoRef}
        className={`absolute inset-0 w-full h-full object-contain ${mirrored ? "-scale-x-100" : ""}`}
        muted
        playsInline
        autoPlay
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
        <div
          className={`px-3 py-1 rounded-full text-sm font-mono tabular-nums ${
            recording ? "bg-destructive text-destructive-foreground" : "bg-black/40"
          }`}
        >
          {recording && (
            <span className="inline-block h-2 w-2 rounded-full bg-destructive-foreground mr-2 animate-pulse" />
          )}
          {formatElapsed(elapsedMs)}
        </div>
      </div>

      {/* Record button */}
      {(status === "ready" || status === "recording") && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-8 z-10">
          <button
            onClick={handleToggle}
            aria-label={recording ? "Stop recording" : "Start recording"}
            className="relative h-20 w-20 rounded-full bg-white/10 backdrop-blur-sm border-4 border-white flex items-center justify-center active:scale-95 transition-transform"
          >
            {recording && (
              <span className="absolute inset-0 rounded-full border-4 border-destructive animate-ping" />
            )}
            <span
              className={
                recording
                  ? "h-7 w-7 rounded-md bg-destructive"
                  : "h-14 w-14 rounded-full bg-destructive"
              }
            />
          </button>
        </div>
      )}

      {/* Loading */}
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/80">
          <div className="text-center space-y-3">
            <div className="h-8 w-8 mx-auto rounded-full border-2 border-white/20 border-t-white animate-spin" />
            <p className="text-sm text-white/70">Starting camera…</p>
          </div>
        </div>
      )}

      {/* Permission denied */}
      {status === "denied" && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/90 px-6">
          <div className="max-w-sm text-center space-y-4">
            <h2 className="text-xl font-semibold">Camera access blocked</h2>
            <p className="text-sm text-white/70">
              Please allow camera access in your browser settings, then try again.
            </p>
            <Button onClick={() => window.location.reload()}>Try again</Button>
            <div>
              <Link to="/" className="text-sm text-white/60 underline">
                Back to home
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Unsupported */}
      {status === "unsupported" && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/90 px-6">
          <div className="max-w-sm text-center space-y-4">
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

      {/* Portrait fallback overlay */}
      {isPortrait && (
        <div className="absolute inset-0 flex items-center justify-center z-30 bg-black px-6">
          <div className="text-center space-y-4">
            <RotateCw className="h-12 w-12 mx-auto animate-pulse" />
            <h2 className="text-xl font-semibold">Rotate your device</h2>
            <p className="text-sm text-white/70 max-w-xs">
              Please turn your phone sideways to record in landscape.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
