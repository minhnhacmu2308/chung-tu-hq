import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { errCode, unwrap } from "../../../../shared/result.js";
import { DOSSIER, hansol } from "../../domain/test/shipment.js";
import { fillAttachmentFromHys } from "../fill-attachment.js";
import type { DeclarationDeps, DeclarationRow } from "../ports.js";
import { FakeDossiers, FakeShipments, fakeOrg, fakeUsers, fakeValidation, RecordingAudit } from "../test/fakes.js";
import { InMemoryDeclarationUow } from "../test/in-memory-uow.js";

const ORG_ID = "org_a";
const D = "dos_1";
const ctx = { orgId: asOrgId(ORG_ID), userId: asUserId("usr_sys") };
const input = { procedureCode: "A01", receiptNo: "HYS-0001", note: "Số tiếp nhận HYS" };
const APPROVED_AT = new Date("2026-10-14T05:00:00.000Z");

let uow: InMemoryDeclarationUow;
let audit: RecordingAudit;
let deps: DeclarationDeps;

const seed = (patch: Partial<DeclarationRow> = {}) =>
  uow.data.declarations.push({
    id: "decl_1", orgId: ORG_ID, dossierId: D, kind: "IDA", version: 3, status: "DRAFT", fields: {}, exchangeRate: "25400", exchangeRateDate: "2026-10-13",
    customsValueVnd: "0", valueAdjustments: [], estImportDutyVnd: "0", estVatVnd: "0", approvedBy: null, approvedAt: null,
    createdAt: new Date("2026-10-14T01:00:00.000Z"), updatedAt: new Date("2026-10-14T01:00:00.000Z"), ...patch,
  });
const decl = () => uow.data.declarations[0]!;

beforeEach(() => {
  uow = new InMemoryDeclarationUow();
  audit = new RecordingAudit();
  deps = {
    uow, queue: undefined as never, hs: undefined as never, shipments: new FakeShipments({ [D]: hansol() }, {}),
    dossiers: new FakeDossiers([{ ...DOSSIER, orgId: ORG_ID, status: "NEEDS_REVIEW", step: "review" }], {}),
    validation: fakeValidation({}), org: fakeOrg({} as never), audit, users: fakeUsers, clock: fixedClock("2026-10-15T03:00:00.000Z"), idGen: sequentialIdGen(),
  } as DeclarationDeps;
});

describe("fillAttachmentFromHys", () => {
  it("DRAFT trống → FILLED cặp 1, 2 dòng audit HYS_FILL, trạng thái giữ DRAFT", async () => {
    seed();
    const r = unwrap(await fillAttachmentFromHys(deps, ctx, D, input));
    expect(r).toEqual({ outcome: "FILLED", slot: 1, afterApproval: false });
    expect(decl().status).toBe("DRAFT");
    expect(decl().version).toBe(3);
    expect(decl().fields.TK_EA1).toMatchObject({ value: "A01", source: "SYSTEM", note: input.note });
    expect(decl().fields.TK_EB1).toMatchObject({ value: "HYS-0001", source: "SYSTEM", note: input.note });
    expect(decl().fields.TK_EB1!.no).not.toBe("");
    expect(audit.rows.map((x) => [x.key, x.oldValue, x.newValue, x.source])).toEqual([
      ["decl:TK_EA1", "", "A01", "HYS_FILL"],
      ["decl:TK_EB1", "", "HYS-0001", "HYS_FILL"],
    ]);
  });

  it("APPROVED → FILLED, afterApproval, status/approvedAt/approvedBy/version giữ nguyên", async () => {
    seed({ status: "APPROVED", approvedAt: APPROVED_AT, approvedBy: "usr_tuan" });
    const r = unwrap(await fillAttachmentFromHys(deps, ctx, D, input));
    expect(r).toEqual({ outcome: "FILLED", slot: 1, afterApproval: true });
    expect(decl().status).toBe("APPROVED");
    expect(decl().approvedAt).toEqual(APPROVED_AT);
    expect(decl().approvedBy).toBe("usr_tuan");
    expect(decl().version).toBe(3);
    expect(audit.rows).toHaveLength(2);
  });

  it("cặp 1 đã có số khác → điền cặp 2", async () => {
    seed({ fields: { TK_EA1: { no: "1.63", label: "x", section: "GENERAL", value: "A02", source: "USER" }, TK_EB1: { no: "1.63", label: "x", section: "GENERAL", value: "OLD-1", source: "USER" } } });
    expect(unwrap(await fillAttachmentFromHys(deps, ctx, D, input))).toMatchObject({ outcome: "FILLED", slot: 2 });
    expect(decl().fields.TK_EB1!.value).toBe("OLD-1");
  });

  it("SUBMITTED → LOCKED, không ghi, không audit", async () => {
    seed({ status: "SUBMITTED" });
    const r = unwrap(await fillAttachmentFromHys(deps, ctx, D, input));
    expect(r).toEqual({ outcome: "LOCKED", afterApproval: false });
    expect(decl().fields).toEqual({});
    expect(audit.rows).toEqual([]);
  });

  it("đã có số tiếp nhận → ALREADY, không audit, không đổi", async () => {
    seed({ fields: { TK_EB2: { no: "1.63", label: "x", section: "GENERAL", value: "HYS-0001", source: "SYSTEM" } } });
    const r = unwrap(await fillAttachmentFromHys(deps, ctx, D, input));
    expect(r).toEqual({ outcome: "ALREADY", slot: 2, afterApproval: false });
    expect(audit.rows).toEqual([]);
    expect(Object.keys(decl().fields)).toEqual(["TK_EB2"]);
  });

  it("đủ 3 cặp → FULL, không audit", async () => {
    const f = (v: string) => ({ no: "1.63", label: "x", section: "GENERAL" as const, value: v, source: "USER" as const });
    seed({ fields: { TK_EB1: f("a"), TK_EB2: f("b"), TK_EB3: f("c") } });
    expect(unwrap(await fillAttachmentFromHys(deps, ctx, D, input))).toEqual({ outcome: "FULL", afterApproval: false });
    expect(audit.rows).toEqual([]);
  });

  it("đủ 3 cặp + replaceSlot → REPLACED cặp đã chọn, audit giá trị cũ → mới", async () => {
    const f = (v: string) => ({ no: "1.63", label: "x", section: "GENERAL" as const, value: v, source: "USER" as const });
    seed({ fields: { TK_EA1: f("A02"), TK_EB1: f("a"), TK_EA2: f("A08 – Bảo lãnh riêng"), TK_EB2: f("b"), TK_EA3: f("A99"), TK_EB3: f("c") } });
    const r = unwrap(await fillAttachmentFromHys(deps, ctx, D, { ...input, replaceSlot: 2 }));
    expect(r).toEqual({ outcome: "REPLACED", slot: 2, replaced: { code: "A08", receipt: "b" }, afterApproval: false });
    expect(decl().fields.TK_EA2).toMatchObject({ value: "A01", source: "SYSTEM", note: input.note, no: "1.63" });
    expect(decl().fields.TK_EB2).toMatchObject({ value: "HYS-0001", source: "SYSTEM" });
    expect(decl().fields.TK_EB1!.value).toBe("a");
    expect(decl().fields.TK_EB3!.value).toBe("c");
    expect(audit.rows.map((x) => [x.key, x.oldValue, x.newValue, x.source])).toEqual([
      ["decl:TK_EA2", "A08 – Bảo lãnh riêng", "A01", "HYS_FILL"],
      ["decl:TK_EB2", "b", "HYS-0001", "HYS_FILL"],
    ]);
  });

  it("EDA ghi cặp 2.53 cùng mã TK_EA/TK_EB", async () => {
    seed({ kind: "EDA" });
    expect(unwrap(await fillAttachmentFromHys(deps, ctx, D, input))).toMatchObject({ outcome: "FILLED", slot: 1 });
    expect(decl().fields.TK_EB1!.no).toBe("2.53");
  });

  it("tổ chức khác → NOT_FOUND, không đụng dữ liệu", async () => {
    seed();
    const r = await fillAttachmentFromHys(deps, { orgId: asOrgId("org_b"), userId: asUserId("usr_x") }, D, input);
    expect(errCode(r)).toBe("NOT_FOUND");
    expect(decl().fields).toEqual({});
    expect(audit.rows).toEqual([]);
  });

  it("chưa có tờ khai → NO_DECLARATION", async () => {
    expect(errCode(await fillAttachmentFromHys(deps, ctx, D, input))).toBe("NO_DECLARATION");
  });
});
