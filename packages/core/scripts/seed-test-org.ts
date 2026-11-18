// Dữ liệu local để test thật (FPT): doanh nghiệp MST 0313833810 + vài hồ sơ có tờ khai nháp đang ở bước Review.
// Chạy: pnpm db:seed && pnpm --filter @kb/core db:seed-test (cần Postgres + Redis; DỪNG worker trước – job run-agent do script tự chạy).
// Hồ sơ đi đúng use case thật: tạo hồ sơ → nhập tay dữ liệu lô hàng → AI Agent (HS giả, không gọi HSCodePro) → xác nhận HS → chuyển Review.
// Idempotent phần doanh nghiệp/người dùng; chạy lại thì xóa hồ sơ cũ của doanh nghiệp test rồi tạo lại.
import { config } from "dotenv";
config({ path: "../../.env", quiet: true });
process.env.HS_CLASSIFIER = "fake";
process.env.AI_PROVIDER = "fake";

import type { ManualShipmentInput } from "@kb/contracts";
import { CreateDossierInputSchema, ManualShipmentSchema } from "@kb/contracts";
import { createDb } from "../src/db/client.js";
import { confirmHs, listLineItems, moveToReview, runAgent, startAgentRun } from "../src/modules/declaration/index.js";
import { createDossier } from "../src/modules/dossier/index.js";
import { saveManualShipment } from "../src/modules/extraction/index.js";
import { asOrgId, asUserId } from "../src/shared/index.js";
import { creditLedger, memberships, organizations, users } from "../src/db/schema/index.js";
import { seedOrgSkills } from "../src/db/seed/skills.js";
// Composition root của worker (nối đủ module như lúc chạy thật); import động để process.env ở trên có hiệu lực trước loadEnv().
const { buildContainer } = await import("../../../apps/worker/src/container.js");

const ORG_ID = "org_test0313";
const USER = { id: "usr_test0313", email: "test@0313833810.local", name: "Người khai Test", password: "demo1234" };

async function seedOrg() {
  const db = createDb(process.env.DATABASE_ADMIN_URL!, { max: 1 });
  try {
    await db
      .insert(organizations)
      .values({ id: ORG_ID, taxCode: "0313833810", name: "CÔNG TY TEST KHAI BÁO ĐỊNH DANH", address: "TP. Hồ Chí Minh", phone: "028 0000 0000", postalCode: "700000", planCode: "PAYG" })
      .onConflictDoNothing();
    await db
      .insert(creditLedger)
      .values({ id: `grant:demo:${ORG_ID}`, orgId: ORG_ID, delta: 50, reason: "GRANT", amountVnd: "0", unitPriceVnd: "0", note: "Tặng 50 lượt dữ liệu test", createdBy: "system" })
      .onConflictDoNothing();
    // Dùng lại hash mật khẩu demo1234 của user mẫu (chạy pnpm db:seed trước).
    const demo = (await db.select({ id: users.id, h: users.passwordHash }).from(users)).find((u) => u.id === "usr_chau");
    if (!demo?.h) throw new Error("Chưa có user mẫu usr_chau – chạy pnpm db:seed trước");
    await db.insert(users).values({ id: USER.id, email: USER.email, name: USER.name, passwordHash: demo.h, emailVerifiedAt: new Date() }).onConflictDoNothing();
    await db.insert(memberships).values({ id: "mem_test0313", orgId: ORG_ID, userId: USER.id, role: "OWNER", status: "ACTIVE" }).onConflictDoNothing();
    await seedOrgSkills(db, ORG_ID, USER.id);
    // Chạy lại = làm mới: xóa hồ sơ cũ của doanh nghiệp test (cascade tờ khai, dòng hàng, khai định danh…).
    await db.$client`delete from dossiers where org_id = ${ORG_ID}`;
  } finally {
    await db.close();
  }
}

type Lot = { direction: "NK" | "XK"; typeCode: string; partner: string; office: string; shipment: ManualShipmentInput; hs: string[] };

const LOTS: Lot[] = [
  {
    direction: "XK", typeCode: "B11", partner: "KOREA PRECISION PARTS CO., LTD", office: "02CI – Hải quan cửa khẩu cảng Sài Gòn khu vực 1",
    shipment: {
      buyer: { name: "KOREA PRECISION PARTS CO., LTD", address: "123 Gangnam-daero, Seoul", country: "KR" },
      invoice: { date: "2026-11-14", incoterm: "FOB", incotermPlace: "HO CHI MINH", currency: "USD", paymentTerms: "T/T 30 DAYS" },
      transport: { portOfLoading: "VNCLI", portOfDischarge: "KRPUS", vessel: "SAWASDEE PACIFIC", departureDate: "2026-11-20", packages: "120", packageUnit: "CT", grossWeightKg: "2450", netWeightKg: "2300", containers: [{ no: "TGHU0123450", sealNo: "VN884120", size: "40HC" }] },
      origin: { country: "VN" }, marks: "KPP/HCM/2611",
      items: [
        { description: "Gối đỡ vòng bi UCF206 gia công", quantity: "1200", unit: "SET", unitPrice: "7.00", origin: "VN" },
        { description: "Trục truyền động thép C45 gia công, Ø30 × 800 mm", quantity: "500", unit: "PCE", unitPrice: "19.00", origin: "VN" },
      ],
    },
    hs: ["8483.20.90", "8483.10.90"],
  },
  {
    direction: "XK", typeCode: "B11", partner: "TOKYO TOOLING INC.", office: "60CB – Hải quan cửa khẩu cảng Kỳ Hà",
    shipment: {
      buyer: { name: "TOKYO TOOLING INC.", address: "2-1 Marunouchi, Chiyoda-ku, Tokyo", country: "JP" },
      invoice: { date: "2026-11-15", incoterm: "FOB", incotermPlace: "KY HA", currency: "USD", paymentTerms: "L/C AT SIGHT" },
      transport: { portOfLoading: "VNKYH", portOfDischarge: "JPTYO", vessel: "WAN HAI 305", departureDate: "2026-11-22", packages: "60", packageUnit: "CT", grossWeightKg: "980", netWeightKg: "900", containers: [{ no: "MSKU7654328", sealNo: "VN884121", size: "20GP" }] },
      origin: { country: "VN" }, marks: "TTI/KYHA",
      items: [
        { description: "Dao phay ngón hợp kim D10", quantity: "1500", unit: "PCE", unitPrice: "9.80", origin: "VN" },
        { description: "Mũi khoan hợp kim D8", quantity: "2400", unit: "PCE", unitPrice: "7.00", origin: "VN" },
      ],
    },
    hs: ["8207.70.00", "8207.50.00"],
  },
  {
    direction: "NK", typeCode: "A11", partner: "SHENZHEN MOTOR TECHNOLOGY CO., LTD", office: "02CI – Hải quan cửa khẩu cảng Sài Gòn khu vực 1",
    shipment: {
      buyer: { name: "CÔNG TY TEST KHAI BÁO ĐỊNH DANH", country: "VN", taxCode: "0313833810" },
      invoice: { date: "2026-11-10", incoterm: "CIF", incotermPlace: "HO CHI MINH", currency: "USD", paymentTerms: "T/T IN ADVANCE" },
      transport: { portOfLoading: "CNSZX", portOfDischarge: "VNCLI", vessel: "COSCO HAIFA", departureDate: "2026-11-12", packages: "80", packageUnit: "CT", grossWeightKg: "1650", netWeightKg: "1500", containers: [{ no: "CSNU1234565", sealNo: "CN556677", size: "40HC" }] },
      origin: { country: "CN" }, marks: "SMT/VN",
      items: [
        { description: "Động cơ điện xoay chiều 3 pha 0,75 kW YS8024", quantity: "1500", unit: "PCE", unitPrice: "14.80", origin: "CN" },
        { description: "Bộ điều khiển tốc độ động cơ BLD-120", quantity: "600", unit: "PCE", unitPrice: "15.325", origin: "CN" },
      ],
    },
    hs: ["8501.51.19", "8504.40.90"],
  },
];

const must = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }, step: string): T => {
  if (!r.ok) throw new Error(`${step}: ${JSON.stringify(r.error)}`);
  return r.value;
};

await seedOrg();
console.log(`✓ doanh nghiệp ${ORG_ID} (MST 0313833810), đăng nhập ${USER.email} / ${USER.password}`);

const c = buildContainer();
const ctx = { orgId: asOrgId(ORG_ID), userId: asUserId(USER.id), role: "OWNER" as const };
const due = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
try {
  for (const lot of LOTS) {
    const input = CreateDossierInputSchema.parse({
      direction: lot.direction, typeCode: lot.typeCode, partner: lot.partner, customsOffice: lot.office, skillSetId: "default", dueDate: due,
      transportMode: "SEA_CONTAINER", startMode: lot.direction === "XK" ? "DECLARE_FIRST" : undefined,
    });
    const d = must(await createDossier(c.dossier, ctx, input), "tạo hồ sơ");
    must(await saveManualShipment(c.extraction, ctx, d.id, ManualShipmentSchema.parse(lot.shipment)), "nhập dữ liệu lô hàng");
    must(await startAgentRun(c.declaration, ctx, d.id, "DECLARATION"), "bắt đầu AI Agent");
    const run = await c.declaration.uow.asOrg(ctx, (r) => r.agentRuns.latest(ORG_ID, d.id));
    must(await runAgent(c.declaration, { orgId: ORG_ID, userId: USER.id, dossierId: d.id, agentRunId: run!.id }), "chạy AI Agent");
    const items = must(await listLineItems(c.declaration, ctx, d.id), "đọc dòng hàng");
    for (const [i, it] of items.entries()) if (!it.hsConfirmed) must(await confirmHs(c.declaration, ctx, it.id, lot.hs[i] ?? it.hsSuggested ?? "8483.20.90"), `xác nhận HS dòng ${it.lineNo}`);
    must(await moveToReview(c.declaration, ctx, d.id), "chuyển Review");
    console.log(`✓ ${d.code} (${d.id}) – ${lot.direction} ${lot.typeCode} · ${lot.partner} → Review`);
  }
} finally {
  await c.db.close?.();
  await c.redis.quit();
}
process.exit(0);
