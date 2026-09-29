// Cookie-free visitor funnel. Independent of the (consent-gated) Meta Pixel so we
// can see where cold traffic drops off even when the banner is ignored. Sends only
// a step name + coarse source; see /api/v1/preview/event.

export const FUNNEL_STEPS = [
  "landing", // landing page viewed
  "landing_search", // search submitted from the landing page
  "try_open", // /try opened
  "results", // a results list with >0 matches was shown
  "cv_added", // CV parsed to sharpen matches
  "signup_click", // clicked any signup prompt
] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export const FUNNEL_SOURCES = ["fb", "other"] as const;
type FunnelSource = (typeof FUNNEL_SOURCES)[number];

const SRC_KEY = "fmaj-src";

// Decide the source once per browser session (first touch wins), so a Facebook
// visitor stays "fb" on /try even though the referrer is gone by then.
function detectSource(): FunnelSource {
  try {
    const saved = window.sessionStorage.getItem(SRC_KEY);
    if (saved === "fb" || saved === "other") return saved;
    const q = new URLSearchParams(window.location.search);
    const utm = (q.get("utm_source") ?? "").toLowerCase();
    const ref = document.referrer.toLowerCase();
    const fb =
      q.has("fbclid") ||
      /facebook|fb|instagram|meta/.test(utm) ||
      /facebook\.com|instagram\.com|fb\.com/.test(ref);
    const src: FunnelSource = fb ? "fb" : "other";
    window.sessionStorage.setItem(SRC_KEY, src);
    return src;
  } catch {
    return "other";
  }
}

export function trackFunnel(step: FunnelStep): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({ step, src: detectSource() });
    const url = "/api/v1/preview/event";
    if (navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))) return;
    void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  } catch {
    /* measurement must never break the page */
  }
}
