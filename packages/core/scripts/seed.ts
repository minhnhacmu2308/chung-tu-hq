import { config } from "dotenv";
config({ path: "../../.env", quiet: true });
import { loadEnv } from "../src/config/env.js";
import { runSeed } from "../src/db/seed/index.js";

await runSeed(loadEnv().DATABASE_ADMIN_URL);
console.log("✓ seed xong: org AN PHÁT, 6 thành viên, mật khẩu demo1234");
