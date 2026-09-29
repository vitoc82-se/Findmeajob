import { ImageResponse } from "next/og";
import { BrandMark, brandFonts } from "@/lib/brandMark";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default async function Icon() {
  return new ImageResponse(<BrandMark size={64} />, { ...size, fonts: await brandFonts() });
}
