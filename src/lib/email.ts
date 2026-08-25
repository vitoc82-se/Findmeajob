import { APP_URL } from "./digest";

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
    ? `${n} nya jobb som matchar dig`
    : `${n} new job${n === 1 ? "" : "s"} that match you`;

  const intro = sv
    ? "God morgon! Här är nya jobb som matchar din profil (60+ träffsäkerhet):"
    : "Good morning! Here are new jobs that match your profile (60+ fit):";
  const cta = sv ? "Öppna Findmeajob" : "Open Findmeajob";
  const unsub = sv ? "Avsluta prenumerationen" : "Unsubscribe";

  const rows = matches
    .map((m) => {
      const meta = [m.job.employer, m.job.location]
        .filter((x): x is string => Boolean(x))
        .map(esc)
        .join(" · ");
      return `
      <tr><td style="padding:12px 0;border-bottom:1px solid #eee;">
        <div style="display:flex;justify-content:space-between;gap:12px;">
          <a href="${esc(m.job.url)}" style="font-weight:600;color:#111;text-decoration:none;font-size:15px;">${esc(m.job.headline)}</a>
          <span style="background:#e0e7ff;color:#3730a3;border-radius:4px;padding:2px 6px;font-size:12px;font-weight:700;white-space:nowrap;">${m.score}</span>
        </div>
        <div style="color:#666;font-size:13px;margin-top:2px;">${meta}</div>
        <div style="color:#333;font-size:13px;margin-top:4px;">${esc(m.rationale)}</div>
      </td></tr>`;
    })
    .join("");

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:8px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
      <span style="display:inline-grid;place-items:center;width:24px;height:24px;border-radius:6px;background:#4f46e5;color:#fff;font-weight:700;">F</span>
      <span style="font-weight:600;">Findmeajob</span>
    </div>
    <p style="color:#333;font-size:14px;">${intro}</p>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <div style="margin-top:16px;">
      <a href="${esc(APP_URL)}/app" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;">${cta} →</a>
    </div>
    <p style="color:#999;font-size:12px;margin-top:24px;">
      <a href="${esc(unsubUrl)}" style="color:#999;">${unsub}</a> · Findmeajob
    </p>
  </div>`;

  return { subject, html };
}
