import type { Metadata } from "next";
import TryClient from "@/components/TryClient";
import { DICTS } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  path: "/try",
  title: DICTS.sv.tryTitle,
  description: DICTS.sv.tryDesc,
  lang: "sv",
});

export default function TryPage() {
  return <TryClient />;
}
