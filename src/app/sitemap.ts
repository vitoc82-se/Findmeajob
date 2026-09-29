import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Public, indexable pages only. /app and /admin are behind sign-in.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/try`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
