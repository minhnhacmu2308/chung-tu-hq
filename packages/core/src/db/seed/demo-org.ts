import type { Db } from "../client.js";
import { memberships, organizations, users } from "../schema/index.js";

/** Giống dữ liệu mock của FE (apps/web/src/mocks/seed/core.ts) để demo liền mạch. Tên công ty/MST là GIẢ. */
export const DEMO_ORG_ID = "org_anphat";
export const DEMO_PASSWORD = "demo1234";

export const DEMO_USERS = [
  { id: "usr_chau", name: "Lê Minh Châu", email: "chau.le@anphat-demo.vn", role: "ADMIN", status: "ACTIVE" },
  { id: "usr_phong", name: "Trần Văn Phong", email: "phong.tran@anphat-demo.vn", role: "OWNER", status: "ACTIVE" },
  { id: "usr_ha", name: "Nguyễn Thu Hà", email: "ha.nguyen@anphat-demo.vn", role: "DECLARANT", status: "ACTIVE" },
  { id: "usr_tuan", name: "Phạm Anh Tuấn", email: "tuan.pham@anphat-demo.vn", role: "APPROVER", status: "ACTIVE" },
  { id: "usr_linh", name: "Đỗ Khánh Linh", email: "linh.do@anphat-demo.vn", role: "DECLARANT", status: "INVITED" },
  { id: "usr_quang", name: "Vũ Đức Quang", email: "quang.vu@anphat-demo.vn", role: "VIEWER", status: "DISABLED" },
] as const;

export async function seedDemoOrg(db: Db, opts: { passwordHash: string }) {
  await db
    .insert(organizations)
    .values({
      id: DEMO_ORG_ID,
      taxCode: "0316789012",
      name: "CÔNG TY TNHH THIẾT BỊ CÔNG NGHIỆP AN PHÁT",
      address: "Lô B4, KCN Tràng Duệ, xã Lê Lợi, huyện An Dương, TP. Hải Phòng",
      phone: "0225 3 888 123",
      planCode: "PRO",
    })
    .onConflictDoNothing();
  for (const u of DEMO_USERS) {
    await db
      .insert(users)
      .values({ id: u.id, email: u.email, name: u.name, passwordHash: opts.passwordHash, emailVerifiedAt: new Date() })
      .onConflictDoNothing();
    await db
      .insert(memberships)
      .values({ id: `mem_${u.id.slice(4)}`, orgId: DEMO_ORG_ID, userId: u.id, role: u.role, status: u.status })
      .onConflictDoNothing();
  }
}
