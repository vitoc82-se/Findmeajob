import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma's generated client + pg adapter must stay external to the server bundle.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg"],
};

export default nextConfig;
