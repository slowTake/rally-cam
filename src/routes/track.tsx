import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Images } from "lucide-react";

export const Route = createFileRoute("/track")({
  head: () => ({
    meta: [
      { title: "Tracking — Ping Pong Highlights" },
      {
        name: "description",
        content:
          "Live tracking stream served directly from the backend as MJPEG.",
      },
    ],
  }),
  component: TrackPage,
});

const STREAM_URL = "http://localhost:8000/video_feed";

function TrackPage() {
  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden">
      {/* MJPEG stream from backend (bounding boxes + UI baked in) */}
      <img
        src={STREAM_URL}
        alt="Live tracking stream"
        className="absolute inset-0 w-full h-full object-contain"
        style={{ maxWidth: "100%", height: "auto" }}
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

        <Link
          to="/gallery"
          className="inline-flex items-center gap-1.5 h-10 px-3 rounded-full bg-black/40 hover:bg-black/60 transition-colors text-sm"
          aria-label="Open gallery"
        >
          <Images className="h-4 w-4" />
          <span>Gallery</span>
        </Link>
      </div>
    </div>
  );
}
