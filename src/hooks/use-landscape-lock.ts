import { useEffect, useState } from "react";

/**
 * Attempts to lock screen orientation to landscape (works on Android Chrome
 * in fullscreen). Also exposes `isPortrait` for a CSS fallback overlay,
 * which is needed on iOS Safari where orientation lock isn't supported.
 */
export function useLandscapeLock() {
  const [isPortrait, setIsPortrait] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(orientation: portrait)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mql = window.matchMedia("(orientation: portrait)");
    const onChange = (e: MediaQueryListEvent) => setIsPortrait(e.matches);
    setIsPortrait(mql.matches);
    mql.addEventListener?.("change", onChange);

    // Best-effort orientation lock. Silently ignored on unsupported browsers.
    const orientation = (screen as unknown as { orientation?: ScreenOrientation })
      .orientation;
    const anyOrientation = orientation as unknown as {
      lock?: (o: string) => Promise<void>;
      unlock?: () => void;
    } | undefined;

    if (anyOrientation?.lock) {
      anyOrientation.lock("landscape").catch(() => {
        // Ignored — many browsers require fullscreen first or simply don't support it.
      });
    }

    return () => {
      mql.removeEventListener?.("change", onChange);
      try {
        anyOrientation?.unlock?.();
      } catch {
        // ignore
      }
    };
  }, []);

  return { isPortrait };
}
