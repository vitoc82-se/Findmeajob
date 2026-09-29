"use client";

import Link from "next/link";
import SiteHeader from "./SiteHeader";
import { useT } from "./LangProvider";

export default function NotFoundView() {
  const t = useT();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-xl px-5 py-16 sm:px-6 sm:py-24">
        <div className="stamp ml-1 grid h-16 w-16 place-items-center rounded-[14px] bg-sun font-display text-2xl font-extrabold" aria-hidden>
          404
        </div>
        <h1 className="mt-6 font-display text-4xl font-extrabold leading-tight">{t.nfTitle}</h1>
        <p className="mt-3 text-lg text-neutral-600">{t.nfBody}</p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-full bg-brand px-7 py-3.5 text-[17px] font-bold text-white hover:bg-brand-dark"
        >
          {t.nfCta}
        </Link>
      </main>
    </>
  );
}
