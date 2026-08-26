"use client";

import { useEffect, useState } from "react";
import { pixelConfigured, getConsent, grantConsent, denyConsent, loadPixel } from "@/lib/fbpixel";

// GDPR cookie-consent gate for the Facebook Pixel. Shows only when a pixel is
// configured AND the visitor hasn't decided yet. Returning visitors who already
// accepted get the pixel (re)loaded silently; those who declined get nothing.
export default function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!pixelConfigured()) return; // nothing to consent to
    const consent = getConsent();
    if (consent === "granted") loadPixel();
    else if (consent === null) setVisible(true);
    // "denied" → load nothing, stay hidden
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4">
      <div className="flex w-full max-w-2xl flex-col gap-3 rounded-xl border border-[color:var(--line)] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-600">
          We use cookies to measure our advertising so we can reach more job seekers. You can
          decline — the app works either way. See our{" "}
          <a href="/privacy" className="underline underline-offset-2 hover:text-ink">
            privacy policy
          </a>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => {
              denyConsent();
              setVisible(false);
            }}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:border-neutral-500"
          >
            Decline
          </button>
          <button
            onClick={() => {
              grantConsent();
              setVisible(false);
            }}
            className="rounded-md bg-ink px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
