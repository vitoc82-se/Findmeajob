"use client";

import Link from "next/link";
import { useT } from "@/components/LangProvider";

// Any uncaught error inside a page. Shows a plain, human message: never the raw
// error text or a stack trace.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  return (
    <main className="mx-auto max-w-xl px-5 py-16 sm:px-6 sm:py-24">
      <h1 className="font-display text-4xl font-extrabold leading-tight">{t.errTitle}</h1>
      <p className="mt-3 text-lg text-neutral-600">{t.errBody}</p>
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button
          onClick={() => reset()}
          className="rounded-full bg-brand px-7 py-3.5 text-[17px] font-bold text-white hover:bg-brand-dark"
        >
          {t.errRetry}
        </button>
        <Link href="/" className="font-semibold text-brand hover:underline">
          {t.nfCta}
        </Link>
      </div>
    </main>
  );
}
