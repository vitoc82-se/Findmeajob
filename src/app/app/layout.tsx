import type { Metadata } from "next";
import { cookies } from "next/headers";
import { DICTS, LANG_COOKIE, parseLang } from "@/lib/i18n";

// Signed-in area: keep it out of search results.
export async function generateMetadata(): Promise<Metadata> {
  const t = DICTS[parseLang((await cookies()).get(LANG_COOKIE)?.value)];
  return { title: t.aTitleSearch, robots: { index: false, follow: false } };
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
