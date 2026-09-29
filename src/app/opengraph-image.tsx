import { ImageResponse } from "next/og";
import { BRAND, brandFonts } from "@/lib/brandMark";

// Social preview (Facebook, LinkedIn, WhatsApp, X). Swedish, because link
// crawlers send no language cookie and the default audience is Swedish.
export const alt = "Findmeajob: se vilka jobb du faktiskt matchar";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ROWS = [
  { score: 92, title: "Lagerarbetare, dagtid", meta: "Malmö", bg: BRAND.sun },
  { score: 85, title: "Butikssäljare", meta: "Lund", bg: BRAND.sun },
  { score: 67, title: "Kundtjänst", meta: "Distans", bg: "#F3E6BE" },
];

export default async function OgImage() {
  const fonts = await brandFonts();
  const family = fonts.length ? "Bricolage" : "sans-serif";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: BRAND.paper,
          fontFamily: family,
          color: BRAND.ink,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 640, padding: "64px 0 64px 72px" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 34, fontWeight: 800, color: BRAND.green }}>
            Findmeajob
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 76, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2 }}>
              Se vilka jobb du faktiskt matchar.
            </div>
            <div style={{ display: "flex", marginTop: 24, fontSize: 30, color: "#5B6B62" }}>
              Gratis. Inget konto. Riktiga annonser.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flex: 1, background: "#E4F1E8", margin: "48px 48px 48px 24px", borderRadius: 32, padding: 32, flexDirection: "column", justifyContent: "center" }}>
          {ROWS.map((r) => (
            <div
              key={r.title}
              style={{ display: "flex", alignItems: "center", background: "#fff", borderRadius: 20, padding: 20, marginTop: 12, marginBottom: 12 }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 76,
                  flexShrink: 0,
                  height: 76,
                  borderRadius: 20,
                  background: r.bg,
                  fontSize: 38,
                  fontWeight: 800,
                  transform: "rotate(-4deg)",
                }}
              >
                {r.score}
              </div>
              <div style={{ display: "flex", flexDirection: "column", marginLeft: 20 }}>
                <div style={{ display: "flex", fontSize: 28, fontWeight: 800 }}>{r.title}</div>
                <div style={{ display: "flex", fontSize: 22, color: "#5B6B62" }}>{r.meta}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
