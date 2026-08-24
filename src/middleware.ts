import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Everything requires sign-in except the health check. Unauthenticated visitors
// are redirected to Clerk's hosted sign-in. The health endpoint stays public so
// uptime checks don't need a session.
const isPublic = createRouteMatcher(["/api/health"]);

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
