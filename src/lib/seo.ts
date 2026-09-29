import type { Metadata } from "next";
import { SITE_NAME } from "./site";

const OG_ALT = "Findmeajob: se vilka jobb du faktiskt matchar";

// One place that builds a page's metadata so title, description, canonical URL,
// Open Graph and Twitter tags can never drift apart. Open Graph / Twitter objects
// replace (not merge with) the parent's, so every page must restate them.
export function pageMetadata(o: {
  path: string; // e.g. "/try": becomes the canonical URL (query strings are dropped)
  title?: string; // omitted = the site default (home page)
  fullTitle?: string; // used for social cards; defaults to `${title} | Findmeajob`
  description: string;
  lang: "sv" | "en";
  noindex?: boolean;
}): Metadata {
  const social = o.fullTitle ?? (o.title ? `${o.title} | ${SITE_NAME}` : SITE_NAME);
  return {
    ...(o.title ? { title: o.title } : {}),
    description: o.description,
    alternates: { canonical: o.path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: social,
      description: o.description,
      url: o.path,
      locale: o.lang === "sv" ? "sv_SE" : "en_US",
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: OG_ALT }],
    },
    twitter: {
      card: "summary_large_image",
      title: social,
      description: o.description,
      images: [{ url: "/twitter-image", width: 1200, height: 630, alt: OG_ALT }],
    },
    ...(o.noindex ? { robots: { index: false, follow: false } } : {}),
  };
}
