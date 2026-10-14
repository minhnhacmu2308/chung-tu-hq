import { hash } from "@node-rs/argon2";
import { createDb } from "../client.js";
import { DEMO_ORG_ID, DEMO_PASSWORD, seedDemoOrg } from "./demo-org.js";
import { seedPlans } from "./plans.js";
import { seedPlatformStaff } from "./platform-staff.js";
import { seedCatalogs } from "./catalogs.js";
import { seedOrgSkills, seedSkillTemplates } from "./skills.js";

export { DEMO_ORG_ID, DEMO_PASSWORD, DEMO_USERS } from "./demo-org.js";
export { PLANS } from "./plans.js";
export { DEMO_STAFF } from "./platform-staff.js";
export { SYSTEM_ORG_ID } from "./skills.js";
export { EXCHANGE_RATE_SEED, HS_SEED } from "./catalogs.js";

/** Chạy bằng admin URL (bỏ qua RLS). Idempotent. */
export async function runSeed(adminUrl: string) {
  const db = createDb(adminUrl, { max: 1 });
  try {
    await seedPlans(db);
    const passwordHash = await hash(DEMO_PASSWORD);
    await seedDemoOrg(db, { passwordHash });
    await seedPlatformStaff(db, { passwordHash });
    await seedSkillTemplates(db);
    await seedOrgSkills(db, DEMO_ORG_ID, "usr_chau");
    await seedCatalogs(db);
  } finally {
    await db.close();
  }
}
