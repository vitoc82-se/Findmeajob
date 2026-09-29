import type { Metadata } from "next";

// Signed-in area: keep it out of search results.
export const metadata: Metadata = {
  title: "Your job search",
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
