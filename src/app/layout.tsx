import type { Metadata } from "next";
import { ClerkProvider, UserButton } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Findmeajob",
  description: "Paste your CV, get a ranked list of jobs that fit.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
          <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
            <span className="text-sm font-semibold">Findmeajob</span>
            <UserButton />
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
