import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import AuthRedirect from "@/components/AuthRedirect";

export const metadata: Metadata = { title: "Logga in", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <ClerkProvider>
      <AuthRedirect mode="sign-up" />
    </ClerkProvider>
  );
}
