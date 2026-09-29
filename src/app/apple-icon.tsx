import { ImageResponse } from "next/og";
import { BrandMark, brandFonts } from "@/lib/brandMark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return new ImageResponse(<BrandMark size={180} />, { ...size, fonts: await brandFonts() });
}
