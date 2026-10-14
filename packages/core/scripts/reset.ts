import { config } from "dotenv";
config({ path: "../../.env", quiet: true });
import { loadEnv } from "../src/config/env.js";
import { resetSchema } from "../src/db/migrate.js";

const env = loadEnv();
if (env.NODE_ENV === "production") throw new Error("Không reset DB production");
await resetSchema(env.DATABASE_ADMIN_URL);
console.log("✓ đã xóa schema và lịch sử migration; chạy pnpm db:migrate && pnpm db:seed");
