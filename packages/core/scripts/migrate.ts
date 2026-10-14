import { config } from "dotenv";
config({ path: "../../.env", quiet: true });
import { loadEnv } from "../src/config/env.js";
import { ensureAppRole, runMigrations } from "../src/db/migrate.js";

const env = loadEnv();
const appPassword = new URL(env.DATABASE_URL).password || "kb_app";
await ensureAppRole(env.DATABASE_ADMIN_URL, appPassword);
await runMigrations(env.DATABASE_ADMIN_URL);
console.log("✓ migration xong");
