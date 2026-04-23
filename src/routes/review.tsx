import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearRecording, getRecording } from "@/lib/recording-store";

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Review — Ping Pong Highlights" },
      { name: "description", content: "Review your recorded match." },
    ],
  }),
  component: ReviewPage,
});

function ReviewPage() {
  const navigate = useNavigate();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const { url } = getRecording();
    setUrl(url);
  }, []);

  const handleRetake = () => {
    clearRecording();
    navigate({ to: "/record" });
  };

  const handleDownload = () => {
    const { blob, url } = getRecording();
    if (!blob || !url) return;
    const ext = blob.type.includes("mp4") ? "mp4" : "webm";
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pingpong-match-${ts}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!url) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-6 text-center space-y-4">
        <h1 className="text-2xl font-semibold">No recording found</h1>
        <p className="text-muted-foreground">Record a match to review it here.</p>
        <Link to="/record">
          <Button>Start recording</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col">
      <div className="flex items-center justify-between p-3 shrink-0">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-white/80 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Home
        </Link>
        <h1 className="text-sm font-medium text-white/80">Review</h1>
        <Link
          to="/gallery"
          className="inline-flex items-center gap-1 text-sm text-white/80 hover:text-white"
        >
          <Images className="h-4 w-4" />
          Gallery
        </Link>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center px-3">
        <video
          src={url}
          controls
          playsInline
          className="max-w-full max-h-full rounded-lg bg-black"
        />
      </div>

      <div className="shrink-0 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-2">
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={handleRetake}>
            Retake
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          <Button size="sm" disabled title="Coming soon">
            Analyze
          </Button>
        </div>
        <p className="text-[11px] text-white/50 text-center">
          Saved on this device — also visible in your Gallery.
        </p>
      </div>
    </div>
  );
}
