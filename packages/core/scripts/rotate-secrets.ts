// Xoay khóa mã hóa bí mật: thêm khóa mới vào APP_MASTER_KEYS (v<N+1>:…), deploy web+worker với vòng khóa mới, rồi chạy script này
// để mã hóa lại dữ liệu cũ. Xong mới được gỡ khóa cũ khỏi vòng. `--dry-run` chỉ đếm.
import { config } from "dotenv";
config({ path: "../../.env", quiet: true });
import { loadEnv } from "../src/config/env.js";
import { createDb } from "../src/db/client.js";
import { AesSecretStore } from "../src/modules/identity/infrastructure/aes-secret-store.js";
import { rotateSecrets } from "../src/db/maintenance/rotate-secrets.js";

const env = loadEnv();
const store = AesSecretStore.fromEnv(env);
const dryRun = process.argv.includes("--dry-run");
const db = createDb(env.DATABASE_ADMIN_URL, { max: 1 });
try {
  const r = await rotateSecrets(db, store, { dryRun });
  console.log(`${dryRun ? "[dry-run] " : ""}khóa hiện hành v${r.current}; đang nạp ${store.versions().map((v) => `v${v}`).join(", ")}`);
  for (const [table, t] of Object.entries(r.tables)) console.log(`  ${table}: ${t.rotated}/${t.scanned} dòng ${dryRun ? "sẽ được" : "đã"} mã hóa lại`);
  if (!Object.keys(r.tables).length) console.log("  không có dòng nào ở phiên bản khóa cũ");
} finally {
  await db.close();
}
