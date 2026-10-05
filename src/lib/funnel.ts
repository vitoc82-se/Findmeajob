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

// Which campaign / ad brought the visitor: utm_campaign (+ utm_content, e.g. the ad
// name) from the landing URL, kept for the browser session (first touch wins) so it
// survives landing -> /try. Lowercase letters, digits, "-" and "_" only, so it is safe
// to store and to show. Empty when the visit carried no utm tags.
const CAMP_KEY = "fmaj-camp";
const cleanTag = (v: string | null) =>
  (v ?? "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);

function detectCampaign(): string {
  try {
    const saved = window.sessionStorage.getItem(CAMP_KEY);
    if (saved !== null) return saved;
    const q = new URLSearchParams(window.location.search);
    const campaign = cleanTag(q.get("utm_campaign"));
    const content = cleanTag(q.get("utm_content"));
    const camp = campaign ? (content ? `${campaign}.${content}` : campaign) : "";
    window.sessionStorage.setItem(CAMP_KEY, camp);
    return camp;
  } catch {
    return "";
  }
}

export function trackFunnel(step: FunnelStep): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({ step, src: detectSource(), camp: detectCampaign() });
    const url = "/api/v1/preview/event";
    if (navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))) return;
    void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  } catch {
    /* measurement must never break the page */
  }
}
