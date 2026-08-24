import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 driver-adapter pattern (same as GrantFinder). The pg adapter talks to
// Neon over the DATABASE_URL connection string. Dev uses a global singleton so
// hot-reload doesn't open a new pool every edit; production gets a fresh client
// per cold start.
const connectionString = process.env.DATABASE_URL;

function createClient(): PrismaClient {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  __prisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.__prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma = prisma;
}
