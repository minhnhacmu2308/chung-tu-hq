import { beforeEach, describe, expect, it } from "vitest";
import type { CustomsDeclarationExtraction } from "@kb/contracts";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { InMemoryJobQueue } from "../../../../shared/queue.js";
import { errCode, unwrap } from "../../../../shared/result.js";
import { MemoryStorage, RecordingUsage, ScriptedAi } from "../test/fakes.js";
import { approveLessons, exportTeachRules, getTeachOverview, lessonsForDossier, setTeachEnabled, updateLesson } from "../lessons.js";
import type { TeachDeps, TeachLotPort } from "../ports.js";
import { declarationNoOf, deleteTeachSample, failTeachSample, getTeachComparison, partNoInDescription, processTeachSample, uploadTeachSamples } from "../samples.js";
import { InMemoryTeachUow } from "../test/in-memory-uow.js";

const ctxA: Ctx = { orgId: asOrgId("org_a"), userId: asUserId("usr_a"), role: "ADMIN" };
const ctxB: Ctx = { orgId: asOrgId("org_b"), userId: asUserId("usr_b"), role: "ADMIN" };
const viewer: Ctx = { ...ctxA, role: "VIEWER" };

// Tờ khai thật lô 770471184612 (rút gọn).
const TK = {
  SOTK: "106794645160", NGAY_DK: "2024-12-06", MA_LH: "A11", PTVC: "1", CQHQ: "02DS", NNK_MST: null, NNK_TEN: null, NXK_TEN: "ZHUHAI RISE LIGHTING CO., LTD", NXK_DC: null, MA_NUOC: "CN",
  SO_VD: "770471184612", SO_KIEN: "4 PK", TRONG_LUONG: 13, KHO: "02DSEA0", KHO_TEN: "KHO FEDEX", CANG_DO: "VNSGN", CANG_XEP: "CNZUH", PTVC_TEN: "PH8090/04DEC", NGAY_DEN: "2024-12-06",
  HD_PL: "A", SO_HD: "M-240315", NGAY_HD: "2024-12-04", PT_TT: "TTR", GIA_PL: "A", DK_GIA: "EXW", MA_TT: "USD", TONG_TG: 608.58, KHAI_TG: "6",
  CT_TG: "HĐ số: 88 - CARA/RISE (561.00 USD) - Hàng nhập nằm ngoài phạm vi áp dụng QCVN 19:2019/BKHCN", PHI_VC: "A - VND - 2.188.485", PHI_BH: "D", VBPQ: null, NGUOI_NT: "1",
  GHI_CHU: "C/O mẫu E số: E247079657380002 (04/12/2024)", SO_QLNB: null, TY_GIA: 25176, TONG_THUE: 1751010,
  items: [{ lineNo: 1, hsCode: "94051199", description: "Đèn down light âm trần, màu trắng, code: 2118.564-ACOT-96", quantity: 2, unit: "PCE", unitPrice: 8.16, invoiceValue: 16.32, origin: "CN", importTaxSchedule: "B30", importRate: "0", importExemptCode: null, vatRate: "10", vatExemptCode: null }],
  uncertainties: [],
} satisfies CustomsDeclarationExtraction;

const lots = (withDossier: boolean): TeachLotPort => ({
  findDossier: async (_org, bill) => (withDossier && bill === "770471184612" ? { id: "dos_1", code: "HS-NK-1" } : null),
  draft: async () => ({
    fields: [
      { code: "KHO", label: "Địa điểm lưu kho", value: "", source: "DOSSIER" }, { code: "PT_TT", label: "Phương thức thanh toán", value: "", source: "CONTRACT" },
      { code: "SO_VD", label: "Số vận đơn", value: "770471184612", source: "BILL_OF_LADING" }, { code: "CT_TG", label: "Chi tiết khai trị giá", value: "04122024#&", source: "CERT_OF_ORIGIN" },
    ],
    lines: [{ lineNo: 1, description: "Recessed fix down light", amount: "16.32", hs: "9405.11.99", importRate: "30", vatRate: null, partNo: "2118.564-ACOT-96" }],
  }),
  lot: async () => ({ docs: [{ kind: "AIR_WAYBILL", data: { awbNo: "770471184612", note: "FedEx" } }], sellerName: "ZHUHAI RISE LIGHTING CO., LTD.", mode: "AIR", office: "02DS" }),
  fieldLabels: () => ({ KHO: "Địa điểm lưu kho", PT_TT: "Phương thức thanh toán" }),
  orgName: async () => "CARA",
});

let uow: InMemoryTeachUow;
let queue: InMemoryJobQueue;
let deps: TeachDeps;
const pdf = { name: "TK 106794645160.pdf", mime: "application/pdf", bytes: Buffer.from("%PDF-3") };
const make = (withDossier = true, ai = new ScriptedAi({ "TK 106794645160.pdf": TK })) => {
  uow = new InMemoryTeachUow();
  queue = new InMemoryJobQueue();
  deps = { uow, storage: new MemoryStorage(), queue, ai, usage: new RecordingUsage(), pdf: { inspect: async () => ({ pages: 3, encrypted: false }) }, lots: lots(withDossier), clock: fixedClock("2026-10-27T03:00:00.000Z"), idGen: sequentialIdGen() };
};
const upload = async (c = ctxA) => {
  const [s] = unwrap(await uploadTeachSamples(deps, c, [pdf]));
  await processTeachSample(deps, { orgId: c.orgId, userId: c.userId, sampleId: s!.id });
  return s!.id;
};

describe("Dạy khai báo – tờ khai mẫu", () => {
  beforeEach(() => make());

  it("upload → job đọc; có hồ sơ cùng lô → so từng ô, % khớp, bài học chờ duyệt; AI đọc tờ khai bằng câu mở đầu riêng", async () => {
    const id = await upload();
    expect(queue.jobs.filter((j) => j.name === "teach-sample-read")).toHaveLength(1);
    const ov = unwrap(await getTeachOverview(deps, ctxA));
    expect(ov.samples[0]).toMatchObject({ id, status: "READ", declarationNo: "106794645160", dossierId: "dos_1", dossierCode: "HS-NK-1" });
    expect(ov.samples[0]!.total).toBeGreaterThan(0);
    const cmp = unwrap(await getTeachComparison(deps, ctxA, id));
    expect(cmp.fields.find((f) => f.code === "KHO")).toMatchObject({ kind: "KNOWLEDGE", real: "02DSEA0 – KHO FEDEX" });
    expect(cmp.lines[0]).toMatchObject({ draftImportRate: "30", realImportRate: "0" });
    expect(ov.lessons.map((l) => [l.kind, l.fieldCode, l.status]).sort()).toEqual([["CLAUSE", "CT_TG", "PENDING"], ["FIELD", "KHO", "PENDING"], ["FIELD", "PT_TT", "PENDING"], ["LINE", "HS", "PENDING"]]);
    expect((deps.ai as ScriptedAi).prompts[0]).toMatchObject({ title: expect.stringMatching(/tờ khai hải quan/), regions: false });
    expect(ov.accuracy).toHaveLength(1);
  });

  it("đọc lại cùng tờ khai không cộng lần gặp; file không phải tờ khai → FAILED", async () => {
    const id = await upload();
    await uow.asOrg(ctxA, (r) => r.samples.update("org_a", id, { status: "UPLOADED" }));
    await processTeachSample(deps, { orgId: "org_a", userId: "usr_a", sampleId: id });
    expect(uow.lessons.every((l) => l.hits === 1)).toBe(true);
    make(true, new ScriptedAi({}));
    const [s] = unwrap(await uploadTeachSamples(deps, ctxA, [pdf]));
    await processTeachSample(deps, { orgId: "org_a", userId: "usr_a", sampleId: s!.id });
    expect(uow.samples[0]).toMatchObject({ status: "FAILED", error: expect.stringMatching(/Không đọc ra tờ khai/) });
  });

  it("số tờ khai AI chép kèm nhãn / dấu gạch / khoảng trắng vẫn nhận ra 12 số", () => {
    for (const v of ["106794645160", "1067 9464 5160", "106.794.645.160", "106-794-645-160", "Số tờ khai: 106794645160", "106794645160/1"]) expect(declarationNoOf(v)).toBe("106794645160");
    for (const v of [null, "", "WSYH-20260502", "1067946451600", "10679464516O"]) expect(declarationNoOf(v)).toBeNull();
  });

  it("file không có số tờ khai 12 số (hợp đồng bị AI đọc thành tờ khai) → FAILED, không học", async () => {
    make(true, new ScriptedAi({ "TK 106794645160.pdf": { ...TK, SOTK: null, GHI_CHU: "Tài liệu là Hợp đồng mua bán hàng hóa số WSYH-20260502, không phải tờ khai hải quan VNACCS" } }));
    await upload();
    expect(uow.samples[0]).toMatchObject({ status: "FAILED", error: expect.stringMatching(/Không thấy số tờ khai \(12 số\)/) });
    expect(uow.lessons).toEqual([]);
  });

  it("job hết số lần thử → FAILED (không kẹt \"AI đang đọc\"); tờ khai đã đọc xong thì giữ nguyên", async () => {
    const [s] = unwrap(await uploadTeachSamples(deps, ctxA, [pdf]));
    await uow.asOrg(ctxA, (r) => r.samples.update("org_a", s!.id, { status: "READING" }));
    await failTeachSample(deps, { orgId: "org_a", sampleId: s!.id, error: "AI lỗi" });
    expect(uow.samples[0]).toMatchObject({ status: "FAILED", error: "AI lỗi" });
    const id = await upload();
    await failTeachSample(deps, { orgId: "org_a", sampleId: id, error: "AI lỗi" });
    expect(uow.samples.find((x) => x.id === id)).toMatchObject({ status: "READ" });
  });

  it("tờ khai cũ không có hồ sơ: học chỉ tiêu theo ngữ cảnh trên tờ khai + mặt hàng có mã hàng trong mô tả", async () => {
    make(false);
    await upload();
    const ov = unwrap(await getTeachOverview(deps, ctxA));
    expect(ov.samples[0]).toMatchObject({ dossierId: null, matched: null });
    expect(ov.lessons.find((l) => l.kind === "LINE")?.context).toMatchObject({ partNo: "P:2118564ACOT96" });
    expect(ov.lessons.find((l) => l.fieldCode === "KHO")?.context).toMatchObject({ office: "02DS", mode: "AIR", carrier: "FEDEX" });
    expect(partNoInDescription("Đèn …, hiệu: Rise, code: 2118.565-ACOT-96")).toBe("2118.565-ACOT-96");
  });

  it("duyệt + bật → hồ sơ mới nhận bài học; chưa bật → không; xuất bộ quy tắc .md", async () => {
    await upload();
    const ids = uow.lessons.map((l) => l.id);
    expect(unwrap(await approveLessons(deps, ctxA, ids))).toBe(4);
    expect(await lessonsForDossier(deps, "org_a", "dos_1")).toBeNull();
    unwrap(await setTeachEnabled(deps, ctxA, true));
    const l = await lessonsForDossier(deps, "org_a", "dos_1");
    expect(l?.fields["KHO"]).toMatchObject({ value: "02DSEA0 – KHO FEDEX", hits: 1, autoFill: false });
    expect(l?.lines[0]).toMatchObject({ key: "P:2118564ACOT96", value: "9405.11.99" });
    const md = unwrap(await exportTeachRules(deps, ctxA));
    expect(md.fileName).toMatch(/^quy-tac-khai-bao-2026-10-27\.md$/);
    expect(md.markdown).toContain("02DSEA0 – KHO FEDEX");
  });

  it("sửa giá trị bài học (mã HS phải đủ 8 số) xóa mâu thuẫn; tắt bài học thì không còn áp", async () => {
    await upload();
    const line = uow.lessons.find((l) => l.kind === "LINE")!;
    expect(errCode(await updateLesson(deps, ctxA, line.id, { value: "9405" }))).toBe("INVALID_HS");
    expect(unwrap(await updateLesson(deps, ctxA, line.id, { value: "9405.99.90", status: "ACTIVE" }))).toMatchObject({ value: "9405.99.90", status: "ACTIVE", conflicts: [] });
    unwrap(await setTeachEnabled(deps, ctxA, true));
    expect((await lessonsForDossier(deps, "org_a", "dos_1"))?.lines).toHaveLength(1);
    unwrap(await updateLesson(deps, ctxA, line.id, { status: "OFF" }));
    expect(await lessonsForDossier(deps, "org_a", "dos_1")).toBeNull();
  });

  it("quyền: người xem không upload/duyệt; chỉ Quản trị bật dùng bài học", async () => {
    expect(errCode(await uploadTeachSamples(deps, viewer, [pdf]))).toBe("FORBIDDEN");
    expect(errCode(await setTeachEnabled(deps, { ...ctxA, role: "DECLARANT" }, true))).toBe("FORBIDDEN");
    expect(errCode(await uploadTeachSamples(deps, ctxA, [{ ...pdf, mime: "text/plain" }]))).toBe("FILE_INVALID");
  });

  it("doanh nghiệp khác không đọc/sửa/xóa được tờ khai mẫu và bài học", async () => {
    const id = await upload();
    const lesson = uow.lessons[0]!;
    expect(unwrap(await getTeachOverview(deps, ctxB))).toMatchObject({ samples: [], lessons: [] });
    expect(errCode(await getTeachComparison(deps, ctxB, id))).toBe("NOT_FOUND");
    expect(errCode(await updateLesson(deps, ctxB, lesson.id, { status: "ACTIVE" }))).toBe("NOT_FOUND");
    expect(errCode(await deleteTeachSample(deps, ctxB, id))).toBe("NOT_FOUND");
    expect(unwrap(await approveLessons(deps, ctxB, [lesson.id]))).toBe(0);
    unwrap(await setTeachEnabled(deps, ctxB, true));
    expect(await lessonsForDossier(deps, "org_b", "dos_1")).toBeNull();
    expect(lesson.status).toBe("PENDING");
  });
});
