import { config } from "dotenv";
config({ path: "../../.env", quiet: true });
import { loadEnv } from "../src/config/env.js";
import { ensureAppRole, ensurePlatformRole, platformDbUrl, runMigrations } from "../src/db/migrate.js";

const env = loadEnv();
const appPassword = new URL(env.DATABASE_URL).password || "kb_app";
await ensureAppRole(env.DATABASE_ADMIN_URL, appPassword);
await ensurePlatformRole(env.DATABASE_ADMIN_URL, new URL(platformDbUrl(env)).password || appPassword);
await runMigrations(env.DATABASE_ADMIN_URL);
console.log("✓ migration xong");
