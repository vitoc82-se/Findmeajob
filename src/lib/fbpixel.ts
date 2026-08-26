// Facebook (Meta) Pixel — CONSENT-GATED. The audience is in the EU, so the pixel
// loads ONLY after the visitor accepts cookies. If NEXT_PUBLIC_FB_PIXEL_ID is not
// set, nothing loads and the consent banner never shows (there's nothing to
// consent to). All the track helpers are no-ops until the pixel is actually live.

const CONSENT_KEY = "fmaj-cookie-consent"; // "granted" | "denied"

// NEXT_PUBLIC_ vars are inlined at build time, so this is a real string client-side.
export const PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID || "";

type Consent = "granted" | "denied";

interface FbWindow {
  fbq?: ((...args: unknown[]) => void) & Record<string, unknown>;
  _fbq?: unknown;
}

export function pixelConfigured(): boolean {
  return PIXEL_ID.length > 0;
}

export function getConsent(): Consent | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

function setConsent(v: Consent): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, v);
  } catch {
    /* private mode — the choice just won't persist across sessions */
  }
}

// Inject the Meta base script once, init the pixel, and fire the first PageView.
export function loadPixel(): void {
  if (typeof window === "undefined" || !pixelConfigured()) return;
  const w = window as unknown as FbWindow;
  if (w.fbq) return; // already loaded this session

  /* Meta's standard loader, typed loosely — it self-assigns onto window. */
  (function (f: any, b: any, e: string, v: string) {
    if (f.fbq) return;
    const n: any = (f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    });
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    const t = b.createElement(e);
    t.async = true;
    t.src = v;
    const s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

  w.fbq!("init", PIXEL_ID);
  w.fbq!("track", "PageView");
}

export function grantConsent(): void {
  setConsent("granted");
  loadPixel();
}

export function denyConsent(): void {
  setConsent("denied");
}

// Fire a standard event — only if the pixel is actually loaded (consent granted).
export function fbTrack(event: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as FbWindow;
  if (typeof w.fbq === "function") w.fbq("track", event, params);
}

// Like fbTrack, but at most once per browser (guarded by localStorage). Used for
// the signup conversion so it isn't double-counted. Only flags after a real fire,
// so a visitor who accepts later still gets the event.
export function fbTrackOnce(event: string, key: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as FbWindow;
  if (typeof w.fbq !== "function") return; // no consent/pixel yet — allow a later attempt
  const storageKey = `fmaj-fb-${key}`;
  try {
    if (window.localStorage.getItem(storageKey)) return;
    window.localStorage.setItem(storageKey, "1");
  } catch {
    /* if storage is unavailable we may double-count — acceptable */
  }
  w.fbq!("track", event, params);
}
