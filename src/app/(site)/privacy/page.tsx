import type { Metadata } from "next";
import PrivacyView from "@/components/PrivacyView";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  path: "/privacy",
  title: "Integritetspolicy",
  description:
    "Vilka uppgifter Findmeajob sparar, varför, vilka som hjälper oss att hantera dem och vilka rättigheter du har enligt GDPR.",
  lang: "sv",
});

export default function Privacy() {
  return <PrivacyView />;
}
