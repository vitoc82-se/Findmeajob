"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LangSwitch from "./LangSwitch";
import { useT } from "./LangProvider";

// Header for the public, pre-rendered pages. It deliberately has NO sign-in SDK:
// "Logga in" is a plain link, so visitors don't download ~250 kB of auth code just
// to read the landing page. A signed-in visitor (Clerk's __session cookie) sees a
// shortcut into the app instead.
export default function SiteHeader({ right }: { right?: React.ReactNode }) {
  const t = useT();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (right) return;
    setSignedIn(/(?:^|; )__session=/.test(document.cookie));
  }, [right]);

  return (
    <header className="flex items-center justify-between border-b border-[color:var(--line)] bg-white px-5 py-3 sm:px-6">
      <Link href="/" className="flex items-center gap-2">
        <span aria-hidden className="grid h-8 w-8 place-items-center rounded-[9px] bg-brand">
          <span className="grid h-5 w-5 -rotate-6 place-items-center rounded-[6px] bg-sun font-display text-[13px] font-extrabold leading-none text-ink">
            F
          </span>
        </span>
        <span className="font-display text-lg font-extrabold tracking-tight text-brand">Findmeajob</span>
      </Link>
      <div className="flex items-center gap-3">
        <LangSwitch />
        {right ?? (
          <Link
            href={signedIn ? "/app" : "/sign-in"}
            className="rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            {signedIn ? t.openApp : t.signIn}
          </Link>
        )}
      </div>
    </header>
  );
}
