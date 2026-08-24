import { defineConfig } from "prisma/config";

// Prisma 7 moved the connection URL out of schema.prisma and into this file.
// `prisma generate` does not need a live URL (it only reads the schema), so we
// pass process.env.DATABASE_URL directly — undefined is fine for generate and
// only migration/introspection commands (db push) require it to be set.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
