import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The Findmeajob mark: a butter-yellow "score stamp" on leaf green. Used by the
// favicon, the Apple touch icon and the social-preview image so they stay in sync.
export const BRAND = { green: "#1E6B52", sun: "#FFD25A", ink: "#1D2B24", paper: "#FBF8F3" };

export function BrandMark({ size }: { size: number }) {
  const stamp = Math.round(size * 0.62);
  return (
    <div
      style={{
        width: size,
        height: size,
        background: BRAND.green,
        borderRadius: Math.round(size * 0.22),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: stamp,
          height: stamp,
          background: BRAND.sun,
          borderRadius: Math.round(stamp * 0.26),
          transform: "rotate(-6deg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: BRAND.ink,
          fontFamily: "Bricolage",
          fontSize: Math.round(stamp * 0.78),
          fontWeight: 800,
          lineHeight: 1,
        }}
      >
        F
      </div>
    </div>
  );
}

// Bricolage Grotesque ExtraBold for the generated images (icons, social preview).
// Falls back to the default font if the file is missing, rather than failing the image.
export async function brandFonts() {
  try {
    const data = await readFile(
      join(process.cwd(), "node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff"),
    );
    return [{ name: "Bricolage", data, weight: 800 as const, style: "normal" as const }];
  } catch {
    return [];
  }
}
