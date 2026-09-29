import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { auth } from "@clerk/nextjs/server";
import { ClerkProvider, SignInButton, UserButton } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import ConsentBanner from "@/components/ConsentBanner";
import { LangProvider } from "@/components/LangProvider";
import LangSwitch from "@/components/LangSwitch";
import { DICTS, LANG_COOKIE, parseLang } from "@/lib/i18n";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = DICTS[parseLang((await cookies()).get(LANG_COOKIE)?.value)];
  return { title: t.metaTitle, description: t.metaDesc };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  const t = DICTS[lang];

  return (
    <ClerkProvider>
      <html lang={lang} className={`${GeistSans.variable} ${GeistMono.variable}`}>
        <body className="min-h-screen font-sans text-ink antialiased" style={{ background: "var(--bg)" }}>
          <LangProvider lang={lang}>
          <header className="flex items-center justify-between border-b border-[color:var(--line)] bg-white px-6 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-ink text-xs font-bold text-white">
                F
              </span>
              <span className="text-sm font-semibold tracking-tight">Findmeajob</span>
            </Link>
            <div className="flex items-center gap-3">
              <LangSwitch />
              {userId ? (
                <UserButton />
              ) : (
                <SignInButton mode="redirect" forceRedirectUrl="/app">
                  <button className="rounded-md bg-ink px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">
                    {t.signIn}
                  </button>
                </SignInButton>
              )}
            </div>
          </header>
            {children}
            <ConsentBanner />
          </LangProvider>
          <Analytics />
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
