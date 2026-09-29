import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma's generated client + pg adapter must stay external to the server bundle.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg"],
  // Never ship source maps to browsers, and don't advertise the framework.
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
