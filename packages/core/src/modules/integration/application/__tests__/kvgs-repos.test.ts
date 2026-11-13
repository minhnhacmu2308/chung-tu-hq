import { describe, expect, it } from "vitest";
import { asOrgId, asUserId } from "../../../../shared/ids.js";
import type { ContainerListRecord, KvgsSheetRecord } from "../customs-ports.js";
import { isDuplicate } from "../kvgs.js";
import { InMemoryCustomsUow } from "../test/in-memory-customs-uow.js";

const A = { orgId: asOrgId("org_a"), userId: asUserId("usr_a") };
const B = { orgId: asOrgId("org_b"), userId: asUserId("usr_b") };
const at = (m: number) => new Date(Date.UTC(2026, 10, 13, 0, m));

const list = (id: string, attempt: number, patch: Partial<ContainerListRecord> = {}): ContainerListRecord => ({
  id, orgId: "org_a", dossierId: "dos_1", branch: 1, attempt, rows: [{ billNo: "HBL1", containerNo: "FBIU5802429", sealNo: "S1", note: "", source: "OCR" }], status: "DRAFT", refId: null, receiptNo: null, receiptDate: null,
  errors: null, sentRows: null, sentBy: null, sentAt: null, createdAt: at(0), updatedAt: at(0), ...patch,
});
const sheet = (id: string, minute: number, patch: Partial<KvgsSheetRecord> = {}): KvgsSheetRecord => ({
  id, orgId: "org_a", dossierId: "dos_1", branch: 1, status: "SENDING", refId: null, receiptNo: null, receiptDate: null, errors: null, sheet: null, raw: null, requestedBy: "usr_a", requestedAt: at(minute), fetchedAt: null, createdAt: at(minute), updatedAt: at(minute), ...patch,
});

describe("in-memory containerLists", () => {
  it("latest = attempt lớn nhất theo (hồ sơ, nhánh); get/update; trùng (hồ sơ, nhánh, attempt) bị chặn", async () => {
    const uow = new InMemoryCustomsUow();
    await uow.asOrg(A, async (r) => {
      await r.containerLists.insert(list("cl_1", 1));
      await r.containerLists.insert(list("cl_2", 2));
      await r.containerLists.insert(list("cl_b2", 1, { branch: 2 }));
    });
    expect((await uow.asOrg(A, (r) => r.containerLists.latest("org_a", "dos_1", 1)))?.id).toBe("cl_2");
    expect((await uow.asOrg(A, (r) => r.containerLists.latest("org_a", "dos_1", 2)))?.id).toBe("cl_b2");
    expect(await uow.asOrg(A, (r) => r.containerLists.latest("org_a", "dos_1", 3))).toBeNull();
    await uow.asOrg(A, (r) => r.containerLists.update("org_a", "cl_2", { status: "ACCEPTED", receiptNo: "123", receiptDate: "2026-11-13", sentAt: at(5) }));
    const got = await uow.asOrg(A, (r) => r.containerLists.get("org_a", "cl_2"));
    expect(got).toMatchObject({ status: "ACCEPTED", receiptNo: "123", receiptDate: "2026-11-13", attempt: 2 });
    expect(got?.sentAt).toEqual(at(5));
    await expect(uow.asOrg(A, (r) => r.containerLists.insert(list("cl_dup", 1)))).rejects.toThrow(/container_lists_dossier_branch_attempt_uq/);
  });

  it("org khác không đọc, không sửa, không ghi được", async () => {
    const uow = new InMemoryCustomsUow();
    await uow.asOrg(A, (r) => r.containerLists.insert(list("cl_1", 1)));
    expect(await uow.asOrg(B, (r) => r.containerLists.latest("org_a", "dos_1", 1))).toBeNull();
    expect(await uow.asOrg(B, (r) => r.containerLists.get("org_a", "cl_1"))).toBeNull();
    await expect(uow.asOrg(B, (r) => r.containerLists.update("org_a", "cl_1", { status: "REJECTED" }))).rejects.toThrow(/row-level security/);
    await expect(uow.asOrg(B, (r) => r.containerLists.insert(list("cl_x", 5)))).rejects.toThrow(/row-level security/);
    expect((await uow.asOrg(A, (r) => r.containerLists.get("org_a", "cl_1")))?.status).toBe("DRAFT");
  });
});

describe("in-memory kvgs", () => {
  it("latest = lần yêu cầu mới nhất; latestOk = ACCEPTED mới nhất; get/update", async () => {
    const uow = new InMemoryCustomsUow();
    await uow.asOrg(A, async (r) => {
      await r.kvgs.insert(sheet("k_1", 1, { status: "ACCEPTED" }));
      await r.kvgs.insert(sheet("k_2", 2, { status: "ACCEPTED" }));
      await r.kvgs.insert(sheet("k_3", 3, { status: "REJECTED" }));
      await r.kvgs.insert(sheet("k_other", 9, { branch: 2, status: "ACCEPTED" }));
    });
    expect((await uow.asOrg(A, (r) => r.kvgs.latest("org_a", "dos_1", 1)))?.id).toBe("k_3");
    expect((await uow.asOrg(A, (r) => r.kvgs.latestOk("org_a", "dos_1", 1)))?.id).toBe("k_2");
    expect(await uow.asOrg(A, (r) => r.kvgs.latestOk("org_a", "dos_1", 3))).toBeNull();
    await uow.asOrg(A, (r) => r.kvgs.update("org_a", "k_3", { status: "ACCEPTED", fetchedAt: at(10), raw: { a: 1 } }));
    const got = await uow.asOrg(A, (r) => r.kvgs.get("org_a", "k_3"));
    expect(got).toMatchObject({ status: "ACCEPTED", raw: { a: 1 } });
    expect(got?.fetchedAt).toEqual(at(10));
    expect((await uow.asOrg(A, (r) => r.kvgs.latestOk("org_a", "dos_1", 1)))?.id).toBe("k_3");
  });

  it("chỉ một bản SENDING mỗi (hồ sơ, nhánh) (mirror kvgs_sheets_sending_uq)", async () => {
    const uow = new InMemoryCustomsUow();
    await uow.asOrg(A, (r) => r.kvgs.insert(sheet("k_1", 1)));
    await expect(uow.asOrg(A, (r) => r.kvgs.insert(sheet("k_2", 2)))).rejects.toThrow(/unique/);
    await uow.asOrg(A, (r) => r.kvgs.insert(sheet("k_3", 3, { branch: 2 })));
    await uow.asOrg(A, (r) => r.kvgs.update("org_a", "k_1", { status: "REJECTED" }));
    await uow.asOrg(A, (r) => r.kvgs.insert(sheet("k_4", 4)));
  });

  it("org khác không đọc, không sửa, không ghi được", async () => {
    const uow = new InMemoryCustomsUow();
    await uow.asOrg(A, (r) => r.kvgs.insert(sheet("k_1", 1, { status: "ACCEPTED" })));
    expect(await uow.asOrg(B, (r) => r.kvgs.latest("org_a", "dos_1", 1))).toBeNull();
    expect(await uow.asOrg(B, (r) => r.kvgs.latestOk("org_a", "dos_1", 1))).toBeNull();
    expect(await uow.asOrg(B, (r) => r.kvgs.get("org_a", "k_1"))).toBeNull();
    await expect(uow.asOrg(B, (r) => r.kvgs.update("org_a", "k_1", { status: "REJECTED" }))).rejects.toThrow(/row-level security/);
    await expect(uow.asOrg(B, (r) => r.kvgs.insert(sheet("k_x", 2)))).rejects.toThrow(/row-level security/);
  });
});

describe("isDuplicate", () => {
  it("nhận 23505 ở lỗi hoặc .cause (DrizzleQueryError), thông điệp duplicate key; không nhận lỗi khác", () => {
    expect(isDuplicate({ message: "Failed query: insert into ...", cause: { code: "23505" } })).toBe(true);
    expect(isDuplicate(Object.assign(new Error("Failed query: x"), { cause: Object.assign(new Error("boom"), { cause: { code: "23505" } }) }))).toBe(true);
    expect(isDuplicate(new Error("duplicate key value violates unique constraint kvgs_sheets_sending_uq"))).toBe(true);
    expect(isDuplicate({ code: "23505" })).toBe(true);
    expect(isDuplicate(Object.assign(new Error("Failed query: x"), { cause: { code: "40001" } }))).toBe(false);
    expect(isDuplicate(null)).toBe(false);
  });
});
