import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { ClerkProvider, SignInButton, UserButton } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Findmeajob — get matched, stop scrolling",
  description:
    "Give Findmeajob your CV once. It searches real job sources and ranks the roles that actually fit you.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
          <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-indigo-600 text-xs font-bold text-white">
                F
              </span>
              <span className="text-sm font-semibold tracking-tight">Findmeajob</span>
            </Link>
            <div>
              {userId ? (
                <UserButton />
              ) : (
                <SignInButton mode="redirect" forceRedirectUrl="/app">
                  <button className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
                    Sign in
                  </button>
                </SignInButton>
              )}
            </div>
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
