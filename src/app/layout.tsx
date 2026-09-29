import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { auth } from "@clerk/nextjs/server";
import { ClerkProvider, SignInButton, UserButton } from "@clerk/nextjs";
import { svSE } from "@clerk/localizations";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import ConsentBanner from "@/components/ConsentBanner";
import { LangProvider } from "@/components/LangProvider";
import LangSwitch from "@/components/LangSwitch";
import { DICTS, LANG_COOKIE, parseLang } from "@/lib/i18n";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin", "latin-ext"], variable: "--font-sans", display: "swap" });
const bricolage = Bricolage_Grotesque({
  subsets: ["latin", "latin-ext"],
  variable: "--font-display",
  weight: ["500", "700", "800"],
  display: "swap",
});

export const viewport: Viewport = { themeColor: "#1E6B52", width: "device-width", initialScale: 1 };

export async function generateMetadata(): Promise<Metadata> {
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  const t = DICTS[lang];
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t.metaTitle, template: `%s | ${SITE_NAME}` },
    description: t.metaDesc,
    applicationName: SITE_NAME,
    formatDetection: { telephone: false },
  };
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
    <ClerkProvider localization={lang === "sv" ? svSE : undefined}>
      <html lang={lang} className={`${figtree.variable} ${bricolage.variable}`}>
        <body className="min-h-screen font-sans text-ink antialiased" style={{ background: "var(--bg)" }}>
          <LangProvider lang={lang}>
          <header className="flex items-center justify-between border-b border-[color:var(--line)] bg-white px-6 py-3">
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
              {userId ? (
                <UserButton />
              ) : (
                <SignInButton mode="redirect" forceRedirectUrl="/app">
                  <button className="rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">
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
