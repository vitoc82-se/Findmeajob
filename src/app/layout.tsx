import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import ConsentBanner from "@/components/ConsentBanner";
import { LangProvider } from "@/components/LangProvider";
import { DICTS } from "@/lib/i18n";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

// Swedish (latin) covers å ä ö, so the extra latin-ext files aren't downloaded.
const figtree = Figtree({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["700", "800"],
  display: "swap",
});

export const viewport: Viewport = { themeColor: "#1E6B52", width: "device-width", initialScale: 1 };

// Static metadata (Swedish, the default). Link previews and search engines don't
// send a language cookie, so they get Swedish either way.
const t = DICTS.sv;
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: t.metaTitle, template: `%s | ${SITE_NAME}` },
  description: t.metaDesc,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: t.metaTitle,
    description: t.metaDesc,
    url: "/",
    locale: "sv_SE",
  },
  twitter: { card: "summary_large_image", title: t.metaTitle, description: t.metaDesc },
  formatDetection: { telephone: false },
};

// The root layout is intentionally free of cookies, auth and headers so the public
// pages can be pre-rendered and cached. The sign-in SDK lives in AuthShell, used
// only by /app and /admin.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" className={`${figtree.variable} ${bricolage.variable}`}>
      <body className="min-h-screen font-sans text-ink antialiased" style={{ background: "var(--bg)" }}>
        <LangProvider>
          {children}
          <ConsentBanner />
        </LangProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
