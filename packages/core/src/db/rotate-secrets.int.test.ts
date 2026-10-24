import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AesSecretStore } from "../modules/identity/infrastructure/aes-secret-store.js";
import { createDb, type Db } from "./client.js";
import { rotateSecrets } from "./maintenance/rotate-secrets.js";
import { orgSecrets } from "./schema/identity.js";
import { mailConnections } from "./schema/mailbox.js";
import { runSeed } from "./seed/index.js";
import { startTestDb, type TestDb } from "./test-db.js";

let t: TestDb;
let admin: Db;
beforeAll(async () => {
  t = await startTestDb();
  await runSeed(t.adminUrl);
  admin = createDb(t.adminUrl, { max: 1 });
});
afterAll(async () => {
  await admin?.close();
  await t?.stop();
});

describe("rotateSecrets – xoay khóa mã hóa bí mật", () => {
  it("dòng ở khóa v1 được mã hóa lại bằng v2 (org_secrets, mail_connections); dry-run không ghi; chạy lại không còn gì; giải mã bằng vòng khóa mới đúng", async () => {
    const k1 = Buffer.alloc(32, 1).toString("base64");
    const k2 = Buffer.alloc(32, 2).toString("base64");
    const v1 = new AesSecretStore(k1);
    const sealed = v1.encrypt("USER_ID=abc;PASSWORD=xyz");
    await admin.insert(orgSecrets).values({ id: "sec_rot", orgId: "org_anphat", kind: "ROTATE_TEST", ciphertext: sealed.ciphertext, keyVersion: 1 });
    await admin.insert(mailConnections).values({ id: "mcn_rot", orgId: "org_anphat", provider: "GMAIL", email: "rot@x.vn", ciphertext: v1.encrypt("{\"refresh\":\"r\"}").ciphertext, keyVersion: 1, status: "ACTIVE", lastSyncedAt: null, lastSyncCount: 0, lastError: null, connectedBy: "usr_chau" });
    const ring = AesSecretStore.fromEnv({ APP_MASTER_KEY: k1, APP_MASTER_KEYS: `v2:${k2}` });

    const dry = await rotateSecrets(admin, ring, { dryRun: true });
    expect(dry).toMatchObject({ current: 2, dryRun: true, tables: { org_secrets: { scanned: 1, rotated: 1 }, mail_connections: { scanned: 1, rotated: 1 } } });
    expect((await admin.select().from(orgSecrets).where(eq(orgSecrets.id, "sec_rot")))[0]!.keyVersion).toBe(1);

    const real = await rotateSecrets(admin, ring);
    expect(real.tables["org_secrets"]).toEqual({ scanned: 1, rotated: 1 });
    const after = (await admin.select().from(orgSecrets).where(eq(orgSecrets.id, "sec_rot")))[0]!;
    expect(after.keyVersion).toBe(2);
    expect(after.ciphertext).not.toBe(sealed.ciphertext);
    expect(ring.decrypt(after.ciphertext, after.keyVersion)).toBe("USER_ID=abc;PASSWORD=xyz");
    const mail = (await admin.select().from(mailConnections).where(eq(mailConnections.id, "mcn_rot")))[0]!;
    expect(JSON.parse(ring.decrypt(mail.ciphertext, mail.keyVersion))).toEqual({ refresh: "r" });

    expect((await rotateSecrets(admin, ring)).tables).toEqual({});
    // Khóa cũ đã gỡ khỏi vòng → dữ liệu đã xoay vẫn đọc được.
    const onlyV2 = new AesSecretStore({ current: 2, keys: new Map([[2, k2]]) });
    expect(onlyV2.decrypt(after.ciphertext, 2)).toBe("USER_ID=abc;PASSWORD=xyz");
  });
});
