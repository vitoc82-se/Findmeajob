// Only http(s) URLs are safe to use as link targets. Job URLs come from external
// sources (Platsbanken/joblinks/adzuna/remotive); without this, a `javascript:`
// or `data:` scheme would execute on click — React does NOT block javascript:
// hrefs, it only warns. Returns "#" for anything that isn't a valid http(s) URL.
export function safeHref(url: string | null | undefined): string {
  if (!url) return "#";
  try {
    const u = new URL(url.trim());
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch {
    /* not a valid absolute URL */
  }
  return "#";
}
