import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { ClerkProvider, UserButton } from "@clerk/nextjs";
import { svSE } from "@clerk/localizations";
import SiteHeader from "./SiteHeader";
import { LANG_COOKIE, parseLang } from "@/lib/i18n";

// Wraps the signed-in areas (/app, /admin): this is the only place the Clerk SDK
// is loaded, so the public pages stay light.
export default async function AuthShell({ children, header = true }: { children: React.ReactNode; header?: boolean }) {
  await auth(); // ensures the request went through the auth middleware
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  return (
    <ClerkProvider localization={lang === "sv" ? svSE : undefined}>
      {header ? <SiteHeader right={<UserButton />} /> : null}
      {children}
    </ClerkProvider>
  );
}
