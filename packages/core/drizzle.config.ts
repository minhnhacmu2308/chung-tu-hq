import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  entities: { roles: { provider: "", include: ["kb_app"] } },
  dbCredentials: { url: process.env.DATABASE_ADMIN_URL ?? "postgres://kb_admin:kb_admin@localhost:5433/khaibao" },
});
