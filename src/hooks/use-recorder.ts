import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderStatus =
  | "idle"
  | "loading"
  | "ready"
  | "recording"
  | "denied"
  | "unsupported";

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
      // ignore
    }
  }
  return undefined;
}

export function useRecorder() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startTsRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);
  const stopResolveRef = useRef<((blob: Blob) => void) | null>(null);

  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Acquire camera on mount.
  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      ) {
        setStatus("unsupported");
        return;
      }

      setStatus("loading");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {
            /* autoplay may be blocked until user gesture */
          });
        }
        setStatus("ready");
      } catch (err) {
        const e = err as DOMException;
        if (
          e?.name === "NotAllowedError" ||
          e?.name === "SecurityError" ||
          e?.name === "PermissionDeniedError"
        ) {
          setStatus("denied");
        } else if (
          e?.name === "NotFoundError" ||
          e?.name === "OverconstrainedError" ||
          e?.name === "DevicesNotFoundError"
        ) {
          setStatus("unsupported");
        } else {
          setError(e?.message ?? "Camera error");
          setStatus("unsupported");
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      try {
        recorderRef.current?.stop();
      } catch {
        // ignore
      }
      recorderRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    if (!streamRef.current || status !== "ready") return;
    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(streamRef.current, { mimeType })
        : new MediaRecorder(streamRef.current);
    } catch (err) {
      setError((err as Error)?.message ?? "Recorder error");
      setStatus("unsupported");
      return;
    }
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      const resolver = stopResolveRef.current;
      stopResolveRef.current = null;
      resolver?.(blob);
    };
    recorderRef.current = recorder;
    recorder.start(1000);
    startTsRef.current = Date.now();
    setElapsedMs(0);
    tickRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - startTsRef.current);
    }, 250);
    setStatus("recording");
  }, [status]);

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(null);
        return;
      }
      stopResolveRef.current = (blob) => resolve(blob);
      try {
        recorder.stop();
      } catch {
        resolve(null);
      }
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      setStatus("ready");
    });
  }, []);

  return { status, error, elapsedMs, videoRef, start, stop };
}
