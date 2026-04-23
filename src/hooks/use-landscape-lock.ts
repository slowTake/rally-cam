import { useEffect, useState } from "react";

/**
 * Attempts to lock screen orientation to landscape (works on Android Chrome
 * in fullscreen). Also exposes `isPortrait` for a CSS fallback overlay,
 * which is needed on iOS Safari where orientation lock isn't supported.
 */
export function useLandscapeLock() {
  const [isPortrait, setIsPortrait] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    if (!isTouch) return false;
    return window.matchMedia("(orientation: portrait)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const touchMql = window.matchMedia("(pointer: coarse)");
    const orientationMql = window.matchMedia("(orientation: portrait)");

    const update = () => {
      setIsPortrait(touchMql.matches && orientationMql.matches);
    };

    update();
    orientationMql.addEventListener?.("change", update);
    touchMql.addEventListener?.("change", update);

    // Best-effort orientation lock — only meaningful on touch devices.
    const orientation = (screen as unknown as { orientation?: ScreenOrientation })
      .orientation;
    const anyOrientation = orientation as unknown as {
      lock?: (o: string) => Promise<void>;
      unlock?: () => void;
    } | undefined;

    if (touchMql.matches && anyOrientation?.lock) {
      anyOrientation.lock("landscape").catch(() => {
        // Ignored — many browsers require fullscreen first or simply don't support it.
      });
    }

    return () => {
      orientationMql.removeEventListener?.("change", update);
      touchMql.removeEventListener?.("change", update);
      try {
        anyOrientation?.unlock?.();
      } catch {
        // ignore
      }
    };
  }, []);

  return { isPortrait };
}
