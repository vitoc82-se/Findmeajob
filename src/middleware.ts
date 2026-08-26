import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// The landing page and health check are public; everything else (the /app and
// its API routes) requires sign-in. Unauthenticated visitors to protected routes
// are redirected to Clerk's hosted sign-in.
// Public routes: landing, health, and the cron + unsubscribe endpoints (which
// verify their own CRON_SECRET / HMAC token instead of a Clerk session).
const isPublic = createRouteMatcher([
  "/",
  "/privacy",
  "/api/health",
  "/api/cron/(.*)",
  "/api/digest/unsubscribe",
  // Maintenance endpoints gate themselves on CRON_SECRET (no Clerk session).
  "/api/admin/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next internals and static files unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpg|jpeg|gif|png|svg|ico|webp|woff2?|ttf|otf)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
