/**
 * The page's own origin is almost always right, because the GM reached the
 * server over the network the phones are on. `PUBLIC_ORIGIN` is the tiebreaker
 * for the one case the page cannot fix: a GM on `localhost`, whose QR code
 * would send every phone to its own browser's error page.
 */
import { useEffect, useState } from "react";

/** Hosts that mean "this device", and so mean nothing to a phone. */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);

export function isLoopback(origin: string): boolean {
  try {
    return LOOPBACK.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export function joinOrigin(pageOrigin: string, publicOrigin: string | null): string {
  if (publicOrigin && isLoopback(pageOrigin) && !isLoopback(publicOrigin)) {
    return publicOrigin.replace(/\/+$/, "");
  }
  return pageOrigin.replace(/\/+$/, "");
}

/** The code rides in the query so a scan lands on a form that only asks a name. */
export function joinLink(origin: string, code: string): string {
  return code ? `${origin}/?c=${encodeURIComponent(code)}` : `${origin}/`;
}

export const CODE_PARAM = "c";

let cached: Promise<string | null> | null = null;

export function fetchPublicOrigin(): Promise<string | null> {
  cached ??= fetch("/api/config")
    .then((response) => (response.ok ? response.json() : null))
    .then((body: { publicOrigin?: string } | null) => body?.publicOrigin ?? null)
    .catch(() => null);
  return cached;
}

/**
 * Renders the page origin first and corrects it once the config lands: the
 * alternative is a blank space on the one screen everybody is looking at.
 */
export function useJoinLink(code: string): { origin: string; link: string } {
  const [origin, setOrigin] = useState(() =>
    typeof window === "undefined" ? "" : window.location.origin,
  );

  useEffect(() => {
    const page = window.location.origin;
    setOrigin(page);
    if (!isLoopback(page)) return; // nothing the server could improve on
    let live = true;
    void fetchPublicOrigin().then((published) => {
      if (live) setOrigin(joinOrigin(page, published));
    });
    return () => {
      live = false;
    };
  }, []);

  return { origin, link: joinLink(origin, code) };
}
