import type { Metadata } from "next";
import AuthShell from "@/components/AuthShell";

// Signed-in area: keep it out of search results.
export const metadata: Metadata = {
  title: "Din jobbsökning",
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
