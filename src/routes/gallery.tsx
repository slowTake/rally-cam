import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, Share2, Sparkles, Trash2, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

function formatLongDuration(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => n.toString().padStart(2, "0")).join(":");
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

function tipForDuration(ms: number) {
  if (ms < 30_000) return "Short rally clip — great for quick highlights.";
  if (ms < 120_000) return "Standard match clip — solid length for review.";
  return "Long session — consider trimming into shorter highlights.";
}

function downloadClipBlob(blob: Blob, type: string, createdAt: number) {
  const ext = type.includes("mp4") ? "mp4" : "webm";
  const ts = new Date(createdAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dlUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = dlUrl;
  a.download = `pingpong-match-${ts}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(dlUrl);
}

function ClipCard({ meta, onDeleted }: { meta: ClipMeta; onDeleted: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [clipAnalyzeOpen, setClipAnalyzeOpen] = useState(false);

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
    downloadClipBlob(clip.blob, clip.type, clip.createdAt);
  };

  const handleShare = async () => {
    const clip = await getClip(meta.id);
    if (!clip) return;
    const ext = clip.type.includes("mp4") ? "mp4" : "webm";
    const ts = new Date(clip.createdAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `pingpong-match-${ts}.${ext}`;
    const file = new File([clip.blob], filename, { type: clip.type });

    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
      share?: (data: ShareData) => Promise<void>;
    };

    if (nav.canShare?.({ files: [file] }) && nav.share) {
      try {
        await nav.share({ files: [file], title: "Ping pong clip" });
        return;
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") return;
        // fall through to download fallback
      }
    }

    downloadClipBlob(clip.blob, clip.type, clip.createdAt);
    toast("Sharing not supported — clip downloaded instead.");
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
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setClipAnalyzeOpen(true)}
            aria-label="Analyze"
          >
            <Sparkles className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={handleShare} aria-label="Share">
            <Share2 className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={handleDownload} aria-label="Download">
            <Download className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={handleDelete} aria-label="Delete">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={clipAnalyzeOpen} onOpenChange={setClipAnalyzeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clip analysis</DialogTitle>
            <DialogDescription>Local summary — nothing leaves your device.</DialogDescription>
          </DialogHeader>
          <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-muted-foreground">Created</dt>
            <dd>{formatDate(meta.createdAt)}</dd>
            <dt className="text-muted-foreground">Duration</dt>
            <dd>{formatDuration(meta.durationMs)}</dd>
            <dt className="text-muted-foreground">Size</dt>
            <dd>{formatSize(meta.size)}</dd>
            <dt className="text-muted-foreground">Format</dt>
            <dd className="truncate">{meta.type || "video/webm"}</dd>
          </dl>
          <p className="text-sm text-foreground/90 border-t border-border pt-3">
            {tipForDuration(meta.durationMs)}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GalleryPage() {
  const [clips, setClips] = useState<ClipMeta[] | null>(null);
  const [analyzeOpen, setAnalyzeOpen] = useState(false);

  const refresh = () => {
    listClips().then(setClips).catch(() => setClips([]));
  };

  useEffect(() => {
    refresh();
  }, []);

  const stats = clips && clips.length > 0
    ? (() => {
        const total = clips.length;
        const totalDuration = clips.reduce((acc, c) => acc + c.durationMs, 0);
        const totalSize = clips.reduce((acc, c) => acc + c.size, 0);
        const avgDuration = Math.round(totalDuration / total);
        const created = clips.map((c) => c.createdAt);
        const first = Math.min(...created);
        const latest = Math.max(...created);
        return { total, totalDuration, totalSize, avgDuration, first, latest };
      })()
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <Link to="/">
            <Button variant="default" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to home
            </Button>
          </Link>
        </div>

        <div className="flex items-start justify-between gap-4 mb-1">
          <h1 className="section-heading text-2xl sm:text-3xl">Gallery</h1>
          {clips && clips.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 shrink-0"
              onClick={() => setAnalyzeOpen(true)}
            >
              <Sparkles className="h-4 w-4" />
              Analyze all
            </Button>
          )}
        </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 max-w-4xl">
            {clips.map((c) => (
              <ClipCard key={c.id} meta={c} onDeleted={refresh} />
            ))}
          </div>
        )}
      </div>

      <Dialog open={analyzeOpen} onOpenChange={setAnalyzeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Library analysis</DialogTitle>
            <DialogDescription>
              Local summary across all saved clips — nothing leaves your device.
            </DialogDescription>
          </DialogHeader>
          {stats && (
            <>
              <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                <dt className="text-muted-foreground">Total clips</dt>
                <dd>{stats.total}</dd>
                <dt className="text-muted-foreground">Total duration</dt>
                <dd>{formatLongDuration(stats.totalDuration)}</dd>
                <dt className="text-muted-foreground">Total storage</dt>
                <dd>{formatSize(stats.totalSize)}</dd>
                <dt className="text-muted-foreground">Average length</dt>
                <dd>{formatDuration(stats.avgDuration)}</dd>
                <dt className="text-muted-foreground">First clip</dt>
                <dd>{formatDate(stats.first)}</dd>
                <dt className="text-muted-foreground">Latest clip</dt>
                <dd>{formatDate(stats.latest)}</dd>
              </dl>
              <p className="text-sm text-foreground/90 border-t border-border pt-3">
                {tipForDuration(stats.avgDuration)}
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
