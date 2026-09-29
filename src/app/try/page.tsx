import type { Metadata } from "next";
import { cookies } from "next/headers";
import TryClient from "@/components/TryClient";
import { DICTS, LANG_COOKIE, parseLang } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  const t = DICTS[lang];
  return pageMetadata({ path: "/try", title: t.tryTitle, description: t.tryDesc, lang });
}

export default function TryPage() {
  return <TryClient />;
}
