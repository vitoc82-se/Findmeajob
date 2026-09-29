"use client";

import { useEffect } from "react";
import { useAuth, useClerk } from "@clerk/nextjs";

// /sign-in and /sign-up: a tiny page that hands off to Clerk's hosted sign-in or
// sign-up (or straight into the app if already signed in). Keeps the auth SDK out
// of every page except the ones that need it.
export default function AuthRedirect({ mode }: { mode: "sign-in" | "sign-up" }) {
  const { isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      window.location.replace("/app");
      return;
    }
    if (mode === "sign-up") void clerk.redirectToSignUp({ signUpForceRedirectUrl: "/app", signUpFallbackRedirectUrl: "/app" });
    else void clerk.redirectToSignIn({ signInForceRedirectUrl: "/app", signInFallbackRedirectUrl: "/app" });
  }, [isLoaded, isSignedIn, mode, clerk]);

  return (
    <main className="mx-auto max-w-xl px-5 py-20 text-center text-neutral-600">
      <p role="status">…</p>
    </main>
  );
}
