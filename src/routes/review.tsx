import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
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
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="flex items-center justify-between p-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-white/80 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Home
        </Link>
        <h1 className="text-sm font-medium text-white/80">Review</h1>
        <div className="w-12" />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <video
          src={url}
          controls
          playsInline
          className="max-w-full max-h-[70vh] rounded-lg bg-black"
        />
      </div>

      <div className="p-4 flex items-center justify-center gap-3">
        <Button variant="secondary" onClick={handleRetake}>
          Retake
        </Button>
        <Button disabled title="Coming soon">
          Analyze
        </Button>
      </div>
    </div>
  );
}
