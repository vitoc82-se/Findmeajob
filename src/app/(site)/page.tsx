import type { Metadata } from "next";
import LandingView from "@/components/LandingView";
import { DICTS } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  path: "/",
  fullTitle: DICTS.sv.metaTitle,
  description: DICTS.sv.metaDesc,
  lang: "sv",
});

// Public landing page: pre-rendered and served from the CDN.
export default function Landing() {
  return <LandingView />;
}
