import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, Trash2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteClip, getClip, listClips, type ClipMeta } from "@/lib/clips-store";

export const Route = createFileRoute("/gallery")({
  head: () => ({
    meta: [
      { title: "Gallery — Ping Pong Highlights" },
      { name: "description", content: "Browse your saved ping pong clips." },
    ],
  }),
  component: GalleryPage,
});

function formatDuration(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ClipCard({ meta, onDeleted }: { meta: ClipMeta; onDeleted: () => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    getClip(meta.id).then((clip) => {
      if (revoked || !clip) return;
      objectUrl = URL.createObjectURL(clip.blob);
      setUrl(objectUrl);
    });
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [meta.id]);

  const handleDownload = async () => {
    const clip = await getClip(meta.id);
    if (!clip) return;
    const ext = clip.type.includes("mp4") ? "mp4" : "webm";
    const ts = new Date(clip.createdAt)
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const dlUrl = URL.createObjectURL(clip.blob);
    const a = document.createElement("a");
    a.href = dlUrl;
    a.download = `pingpong-match-${ts}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(dlUrl);
  };

  const handleDelete = async () => {
    if (!confirm("Delete this clip?")) return;
    await deleteClip(meta.id);
    onDeleted();
  };

  return (
    <div className="group rounded-lg border border-border bg-card overflow-hidden flex flex-col">
      <div className="aspect-video bg-black relative">
        {url ? (
          <video
            src={url}
            controls
            playsInline
            preload="metadata"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Video className="h-8 w-8 text-muted-foreground/50" />
          </div>
        )}
      </div>
      <div className="p-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{formatDate(meta.createdAt)}</p>
          <p className="text-xs text-muted-foreground">
            {formatDuration(meta.durationMs)} · {formatSize(meta.size)}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="icon" variant="ghost" onClick={handleDownload} aria-label="Download">
            <Download className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={handleDelete} aria-label="Delete">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function GalleryPage() {
  const [clips, setClips] = useState<ClipMeta[] | null>(null);

  const refresh = () => {
    listClips().then(setClips).catch(() => setClips([]));
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Home
          </Link>
          <Link to="/record">
            <Button size="sm">New recording</Button>
          </Link>
        </div>

        <h1 className="section-heading text-2xl sm:text-3xl mb-1">Gallery</h1>
        <p className="text-muted-foreground text-sm mb-6">
          Saved on this device only.
        </p>

        {clips === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : clips.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center">
            <Video className="h-10 w-10 mx-auto text-muted-foreground/60 mb-3" />
            <h2 className="font-semibold mb-1">No clips yet</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Record your first match to see it here.
            </p>
            <Link to="/record">
              <Button>Start recording</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {clips.map((c) => (
              <ClipCard key={c.id} meta={c} onDeleted={refresh} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
