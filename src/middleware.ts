import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Auth runs ONLY for the signed-in app, the sign-in hand-off pages and the API.
// The public pages (/, /try, /privacy, the 404) are pre-rendered and never touch
// this middleware, which is what keeps them fast.
//
// Within what does run: /app, /admin and most of /api require sign-in. Public
// exceptions are the try-before-signup preview API, health check, cron and
// unsubscribe endpoints (which verify their own CRON_SECRET / HMAC token), and the
// sign-in / sign-up hand-off pages.
const isPublic = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/v1/preview/(.*)",
  "/api/health",
  "/api/cron/(.*)",
  "/api/digest/unsubscribe",
  "/api/admin/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/app(.*)", "/admin(.*)", "/sign-in(.*)", "/sign-up(.*)", "/(api|trpc)(.*)"],
};
