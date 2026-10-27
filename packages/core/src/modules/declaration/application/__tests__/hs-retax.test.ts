// Cùng mã HS ⇒ cùng thuế giữa các dòng (lỗi tờ khai HS-NK-2610-006: cùng 9405.11.99 mà dòng ACFTA 0%, dòng trống, dòng MFN 30%).
// Dòng đã xác nhận vẫn được tính lại thuế khi chạy lại phân loại; mã nhập tay không lấy thuế biểu nội bộ khi dùng HSCodePro;
// dòng đổi mô tả bỏ xác nhận; dòng "đang gửi câu trả lời" không làm dừng poll.
import type { HsJob } from "@kb/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { InMemoryJobQueue } from "../../../../shared/queue.js";
import { unwrap } from "../../../../shared/result.js";
import { DOSSIER, hansol, ORG } from "../../domain/test/shipment.js";
import { answerHsQuestion, pollHsJob, startHsClassification } from "../hs-classification.js";
import { confirmHs, listLineItems } from "../line-items.js";
import type { DeclarationDeps } from "../ports.js";
import { FakeDossiers, FakeShipments, fakeOrg, fakeUsers, fakeValidation, RecordingAudit, ScriptedHs } from "../test/fakes.js";
import { InMemoryDeclarationUow } from "../test/in-memory-uow.js";

const ORG_ID = "org_a";
const D = "dos_1";
const declarant: Ctx = { orgId: asOrgId(ORG_ID), userId: asUserId("usr_chau"), role: "DECLARANT" };
const sys = { orgId: ORG_ID, userId: "usr_chau", dossierId: D };
const LED = "Recessed fix down light LED 7W, 350mA, white color";

let uow: InMemoryDeclarationUow;
let queue: InMemoryJobQueue;
let hs: ScriptedHs;
let shipments: FakeShipments;
let deps: DeclarationDeps;

/** 3 dòng đèn LED cùng mặt hàng (khác số lượng/trị giá), xuất xứ CN; `coForm` null = chưa có C/O. */
const ledShipment = (coForm: string | null, descs: string[] = [LED, `${LED} `, `${LED}.`]) =>
  hansol((s) => {
    const base = s.items[0]!;
    s.items = descs.map((d, i) => ({ ...base, lineNo: i + 1, description: { ...base.description, value: d }, origin: { ...base.origin, value: "CN" }, hsOnInvoice: { ...base.hsOnInvoice, value: "9405.11" } }));
    s.origin = { ...s.origin, coForm: { ...s.origin.coForm, value: coForm }, coNo: { ...s.origin.coNo, value: coForm ? "E2610-001" : null } };
  });

beforeEach(() => {
  uow = new InMemoryDeclarationUow();
  uow.data.exchangeRates.push({ currency: "USD", date: "2026-10-14", rate: "25400" });
  queue = new InMemoryJobQueue();
  hs = new ScriptedHs([
    // hscode-api mới: MFN 30%, C/O form E → ACFTA 0%; VAT 8% đã giảm thuế, mã VB245.
    { match: /down light/i, code: "9405.11.99", description: "Đèn LED cố định", confidence: 0.9, importRate: 30, vat: 8, vatCode: "VB245", vatCertain: true, fta: { E: { agreement: "ACFTA", rate: 0 } } },
    { match: /fresh apple/i, code: "0808.10.00", description: "Táo tươi", confidence: 0.95, importRate: 8, vat: null, vatCode: "VK010", vatCertain: false, vatNote: "Không chịu thuế GTGT: sản phẩm trồng trọt chưa chế biến. Đã chế biến thành sản phẩm khác thì chịu thuế" },
    { match: /screw/i, code: "7318.15.90", description: "Vít", confidence: 0.8, importRate: 12, vat: 10, vatCode: "VB901", vatCertain: false, vatNote: "Đa số tờ khai đang khai 10%" },
  ]);
  shipments = new FakeShipments({ [D]: ledShipment(null) });
  deps = {
    uow, queue, hs, shipments, dossiers: new FakeDossiers([{ ...DOSSIER, orgId: ORG_ID, status: "NEEDS_REVIEW", step: "ocr" }], { [D]: [] }), validation: fakeValidation({}),
    org: fakeOrg(ORG), audit: new RecordingAudit(), users: fakeUsers, clock: fixedClock("2026-10-14T03:00:00.000Z"), idGen: sequentialIdGen(),
  };
});

const items = async () => unwrap(await listLineItems(deps, declarant, D));

describe("cùng mã HS ⇒ cùng thuế", () => {
  it("dòng 1 xác nhận lúc chưa có C/O (MFN 30%), sau đó có C/O form E và chạy lại → cả 3 dòng ACFTA 0%, VAT 8% (VB245)", async () => {
    await items();
    unwrap(await startHsClassification(deps, sys, D));
    const [l1] = await items();
    unwrap(await confirmHs(deps, declarant, l1!.id, "9405.11.99"));
    expect((await items())[0]).toMatchObject({ importDutyRate: "30", vatRate: "8", vatCode: "VB245" });

    // Có C/O form E (đọc thêm chứng từ) → chạy lại phân loại: dòng đã xác nhận vẫn được gửi để lấy thuế mới.
    shipments.byDossier[D] = ledShipment("E");
    unwrap(await startHsClassification(deps, sys, D));
    for (const it of await items()) if (!it.hsConfirmed) unwrap(await confirmHs(deps, declarant, it.id, it.hsSuggested!));

    const after = await items();
    expect(after.map((i) => i.hsConfirmed)).toEqual(["9405.11.99", "9405.11.99", "9405.11.99"]);
    expect(after.map((i) => [i.importDutyRate, i.vatRate, i.vatCode])).toEqual([["0", "8", "VB245"], ["0", "8", "VB245"], ["0", "8", "VB245"]]);
    expect(after.every((i) => i.policyNote?.includes("ACFTA"))).toBe(true);
    expect(after.some((i) => i.taxNeedsReview)).toBe(false);
    // Lượt sau gửi kèm co_form và mã đã xác nhận làm gợi ý cho dòng 1.
    expect(hs.created.at(-1)!.items.find((x) => x.line_no === 1)).toMatchObject({ co_form: "E", invoice_hs: "94051199" });
  });

  it("mã đã xác nhận không còn trong kết quả mới → thuế để trống + 'cần kiểm tra lại', không giữ số cũ", async () => {
    await items();
    unwrap(await startHsClassification(deps, sys, D));
    const [l1] = await items();
    unwrap(await confirmHs(deps, declarant, l1!.id, "9405.11.99"));
    uow.data.lineItems.find((x) => x.id === l1!.id)!.hsConfirmed = "9405.19.90"; // mã khác mã HSCodePro trả
    unwrap(await startHsClassification(deps, sys, D));
    expect((await items())[0]).toMatchObject({ hsConfirmed: "9405.19.90", taxNeedsReview: true });
    expect((await items())[0]!.importDutyRate).toBeUndefined();
    expect((await items())[0]!.vatRate).toBeUndefined();
  });
});

describe("VAT theo hscode-api mới", () => {
  it("rate null + mã VK → không chịu thuế: VAT trống (tiền VAT 0), ghi chú 'Không chịu thuế GTGT (VK010)', không ghi 'tạm tính 10%'", async () => {
    shipments.byDossier[D] = ledShipment(null, ["Fresh apple Fuji, 18kg carton"]);
    await items();
    unwrap(await startHsClassification(deps, sys, D));
    const [a] = await items();
    unwrap(await confirmHs(deps, declarant, a!.id, a!.hsSuggested!));
    const got = (await items())[0]!;
    expect(got).toMatchObject({ importDutyRate: "8", vatCode: "VK010", vatCertain: false });
    expect(got.vatRate).toBeUndefined();
    expect(got.policyNote).toContain("Không chịu thuế GTGT (VK010): Không chịu thuế GTGT");
    expect(got.policyNote).not.toContain("tạm tính");
  });

  it("certain = false → căn cứ VAT vào ghi chú để người khai tự xét", async () => {
    shipments.byDossier[D] = ledShipment(null, ["Stainless screw M4x10"]);
    await items();
    unwrap(await startHsClassification(deps, sys, D));
    const [a] = await items();
    unwrap(await confirmHs(deps, declarant, a!.id, a!.hsSuggested!));
    expect((await items())[0]).toMatchObject({ vatRate: "10", vatCode: "VB901", vatCertain: false, vatNote: "Đa số tờ khai đang khai 10%", policyNote: expect.stringContaining("Thuế GTGT cần xét điều kiện: Đa số tờ khai đang khai 10%") });
  });
});

describe("mã nhập tay khi dùng HSCodePro", () => {
  it("không lấy thuế biểu nội bộ: để trống + cần kiểm tra lại, gửi riêng dòng đó lên HSCodePro", async () => {
    (hs as { name: string }).name = "hscodepro";
    uow.data.catalogHs.push({ code: "9405.19.90", description: "Đèn khác", mfn: "25", vat: "8", pref: {}, policy: null, keywords: [] });
    await items();
    unwrap(await startHsClassification(deps, sys, D));
    const [l1] = await items();
    unwrap(await confirmHs(deps, declarant, l1!.id, "9405.19.90"));
    const got = (await items())[0]!;
    expect(got).toMatchObject({ hsConfirmed: "9405.19.90", taxNeedsReview: true });
    expect(got.importDutyRate).toBeUndefined();
    expect(queue.jobs.filter((j) => j.name === "hs-reclassify").at(-1)?.payload).toMatchObject({ lineItemId: l1!.id });
  });
});

describe("đồng bộ dòng hàng", () => {
  it("mô tả dòng đổi (đọc lại chứng từ) → bỏ mã đã xác nhận + thuế cũ, ghi chú xác nhận lại; dòng không đổi giữ nguyên", async () => {
    await items();
    unwrap(await startHsClassification(deps, sys, D));
    for (const it of await items()) unwrap(await confirmHs(deps, declarant, it.id, "9405.11.99"));
    shipments.byDossier[D] = ledShipment(null, [LED, "LED strip light 12V, 5m roll", `${LED}.`]);
    const { syncLineItems } = await import("../_dto.js");
    await uow.asOrg(declarant, (r) => syncLineItems(deps, r, ORG_ID, D, shipments.byDossier[D]!));
    const after = await items();
    expect(after.map((i) => i.hsConfirmed ?? null)).toEqual(["9405.11.99", null, "9405.11.99"]);
    expect(after[1]!.importDutyRate).toBeUndefined();
    expect(after[1]!.policyNote).toContain("đã bỏ xác nhận");
  });
});

describe("câu hỏi need_info", () => {
  it("dòng đang gửi câu trả lời mà HSCodePro vẫn trả câu hỏi cũ → poll tiếp, không dừng để dòng kẹt", async () => {
    const q = { id: "q1", questions: [{ id: "drv", header: "Bộ nguồn", question: "Đèn có kèm driver không?", options: [{ label: "Có" }, { label: "Không" }] }] };
    const create = hs.create.bind(hs);
    hs.create = async (req) => {
      const full = await create(req);
      const ask: HsJob = { ...full, status: "need_info", items: full.items.map((i) => ({ ...i, status: "need_info", question: q, result: null })) };
      hs.onGet = () => structuredClone(ask);
      return structuredClone(ask);
    };
    await items();
    unwrap(await startHsClassification(deps, sys, D));
    const [l1] = await items();
    unwrap(await answerHsQuestion(deps, declarant, l1!.id, { questionId: "q1", answers: [{ id: "drv", selected: ["Không"], custom: null }] }));
    const job = uow.data.hsJobs.at(-1)!;
    const r = unwrap(await pollHsJob(deps, { ...sys, hsJobId: job.id }));
    expect(r.again).toBe(true);
    expect((await items())[0]!.hs!.status).toBe("answering");
    // Câu đã trả lời được giữ lại để gửi kèm khi phân loại lại.
    expect(uow.data.lineItems.find((x) => x.id === l1!.id)!.hsDetail?.answered).toEqual(["Bộ nguồn: Không"]);
  });
});

describe("tờ khai đã duyệt", () => {
  it("kết quả phân loại về sau khi hồ sơ đã khóa → không tự đổi thuế dòng đã xác nhận", async () => {
    await items();
    unwrap(await startHsClassification(deps, sys, D));
    const [l1] = await items();
    unwrap(await confirmHs(deps, declarant, l1!.id, "9405.11.99"));
    (deps.dossiers as FakeDossiers).rows[0]!.status = "APPROVED";
    shipments.byDossier[D] = ledShipment("E");
    unwrap(await startHsClassification(deps, sys, D));
    expect((await items())[0]).toMatchObject({ hsConfirmed: "9405.11.99", importDutyRate: "30", vatRate: "8" });
  });
});
