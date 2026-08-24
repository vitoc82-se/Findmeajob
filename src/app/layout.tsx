import type { Metadata } from "next";
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
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
