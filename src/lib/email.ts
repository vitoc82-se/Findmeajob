import { APP_URL } from "./digest";
import { safeHref } from "./url";

// Send one email via Resend's REST API (no SDK dependency). Returns ok/error so
// the caller (the cron) can log per-user failures without throwing.
export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY not set" };
  const from = process.env.DIGEST_FROM || "Findmeajob <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface DigestMatch {
  score: number;
  rationale: string;
  job: { headline: string; employer: string | null; location: string | null; url: string };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Build the digest email. Swedish for the "se" market, English otherwise.
export function buildDigestEmail(
  matches: DigestMatch[],
  lang: "sv" | "en",
  unsubUrl: string
): { subject: string; html: string } {
  const sv = lang === "sv";
  const n = matches.length;
  const subject = sv
    ? n === 1
      ? "1 nytt jobb som passar dig"
      : `${n} nya jobb som passar dig`
    : n === 1
      ? "1 new job that fits you"
      : `${n} new jobs that fit you`;

  const intro = sv
    ? "God morgon! Det har kommit nya jobb som passar dig:"
    : "Good morning! There are new jobs that fit you:";
  const cta = sv ? "Se alla dina träffar" : "See all your matches";
  const unsub = sv ? "Sluta få de här mejlen" : "Stop these emails";

  const rows = matches
    .map((m) => {
      const meta = [m.job.employer, m.job.location]
        .filter((x): x is string => Boolean(x))
        .map(esc)
        .join(" · ");
      return `
      <tr><td style="padding:12px 0;border-bottom:1px solid #E6E0D4;">
        <div style="display:flex;justify-content:space-between;gap:12px;">
          <a href="${esc(safeHref(m.job.url))}" style="font-weight:700;color:#1D2B24;text-decoration:none;font-size:15px;">${esc(m.job.headline)}</a>
          <span style="background:#FFD25A;color:#1D2B24;border-radius:8px;padding:3px 8px;font-size:13px;font-weight:800;white-space:nowrap;">${m.score}</span>
        </div>
        <div style="color:#666;font-size:13px;margin-top:2px;">${meta}</div>
        <div style="color:#333;font-size:13px;margin-top:4px;">${esc(m.rationale)}</div>
      </td></tr>`;
    })
    .join("");

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:8px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
      <span style="display:inline-grid;place-items:center;width:24px;height:24px;border-radius:6px;background:#1E6B52;color:#FFD25A;font-weight:800;">F</span>
      <span style="font-weight:800;color:#1E6B52;">Findmeajob</span>
    </div>
    <p style="color:#333;font-size:14px;">${intro}</p>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <div style="margin-top:16px;">
      <a href="${esc(APP_URL)}/app" style="display:inline-block;background:#1E6B52;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:600;">${cta}</a>
    </div>
    <p style="color:#999;font-size:12px;margin-top:24px;">
      <a href="${esc(unsubUrl)}" style="color:#999;">${unsub}</a> · Findmeajob
    </p>
  </div>`;

  return { subject, html };
}
