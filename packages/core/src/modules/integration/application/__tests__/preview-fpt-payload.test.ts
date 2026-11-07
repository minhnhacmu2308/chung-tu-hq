// GỠ LỖI TẠM (FPT_DEBUG_TRACE): xem trước body gửi FPT – cùng hàm dựng với lần truyền thật, không gửi, không đổi trạng thái.
import { describe, expect, it } from "vitest";
import { IdaRequestSchema } from "@kb/contracts";
import { errCode, unwrap } from "../../../../shared/result.js";
import { buildFptRequest } from "../../domain/declaration-to-fpt.js";
import { previewFptPayload } from "../preview-fpt-payload.js";
import { D, declarant, lines, lot, makeHarness, other, seed } from "./_sheets-harness.js";

const on = () => {
  const h = makeHarness();
  h.deps.fptDebug = true;
  return h;
};

describe("previewFptPayload", () => {
  it("tắt FPT_DEBUG_TRACE → enabled false, không dựng gì", async () => {
    const h = makeHarness();
    expect(unwrap(await previewFptPayload(h.deps, declarant, D))).toEqual({ enabled: false, sheets: [] });
  });

  it("chưa truyền: một tờ IDA, body đúng như buildFptRequest (không kèm tài khoản VNACCS); không gửi, không tạo outbox", async () => {
    const h = on();
    const v = unwrap(await previewFptPayload(h.deps, declarant, D));
    expect(v.sheets).toHaveLength(1);
    const s = v.sheets[0]!;
    expect(s).toMatchObject({ branch: 1, of: 1, operation: "IDA", path: "/api/IDA", missing: null, blockers: [] });
    // Body gửi thật = output schema cổng (fptContentBody), như FptVnaccsGateway.preDeclare.
    expect(s.request).toEqual(IdaRequestSchema.parse(buildFptRequest(h.decls.payloadNow()).request));
    expect(JSON.stringify(s.request)).not.toContain("objVNACCS_ACCOUNT");
    expect(h.uow.data.outbox).toHaveLength(0);
    expect(h.queue.jobs).toHaveLength(0);
  });

  it("lô nhiều tờ: chỉ tờ còn gửi nội dung được; tờ 2..N mang số tờ khai tờ 1", async () => {
    const h = on();
    lot(h, "PRE_DECLARED", "RECALLED", "NOT_SENT");
    h.uow.data.results = h.uow.data.results.filter((r) => r.branch !== 3);
    const v = unwrap(await previewFptPayload(h.deps, declarant, D));
    expect(v.sheets.map((s) => [s.branch, s.operation, s.of])).toEqual([[2, "IDA", 3], [3, "IDA", 3]]);
    expect(JSON.stringify(v.sheets[0]!.request)).toContain("104000000001");
    expect(v.sheets[0]!.warnings.some((w) => w.startsWith("TK_FIC"))).toBe(false);
  });

  it("gọi sửa đổi (AMEND_RECALLED) → IDA01 kèm chỉ thị Hải quan nguyên văn", async () => {
    const h = on();
    seed(h, 1, "AMEND_RECALLED");
    const cthq = { tK_CTHQ1: "  Bổ sung C/O  " };
    h.uow.data.results[0]!.raw = { ...h.uow.data.results[0]!.raw, customsInfo: { directivesRaw: cthq } } as never;
    const s = unwrap(await previewFptPayload(h.deps, declarant, D)).sheets[0]!;
    expect(s.operation).toBe("IDA01");
    expect((s.request as Record<string, unknown>)["objVN_IDA_CTHQ"]).toEqual(cthq);
    // Như gateway gửi IDA01: đầu tờ khai mang số tờ khai đã đăng ký.
    expect((s.request as { objVN_IDA: Record<string, unknown> }).objVN_IDA["tK_ICN"]).toBe(104000000001);
  });

  it("thiếu ô bắt buộc → vẫn trả body, kèm danh sách thiếu", async () => {
    const h = on();
    h.decls.fields = { NNK_TEN: { value: "" } };
    const s = unwrap(await previewFptPayload(h.deps, declarant, D)).sheets[0]!;
    expect(s.missing).toBeTruthy();
    expect(s.request).toBeTruthy();
  });

  it("hồ sơ của doanh nghiệp khác → NOT_FOUND", async () => {
    const h = on();
    expect(errCode(await previewFptPayload(h.deps, other, D))).toBe("NOT_FOUND");
  });

  it("lô nhiều tờ, tờ 1 chưa có số → tờ 2..N cảnh báo TK_FIC là số giả", async () => {
    const h = on();
    h.decls.items = lines(60);
    const v = unwrap(await previewFptPayload(h.deps, declarant, D));
    expect(v.sheets.map((s) => s.branch)).toEqual([1, 2]);
    expect(v.sheets[0]!.warnings.some((w) => w.startsWith("TK_FIC"))).toBe(false);
    expect(v.sheets[1]!.warnings.some((w) => w.startsWith("TK_FIC"))).toBe(true);
  });
});
