import { describe, expect, it } from "vitest";
import type { HsWarningDetail, LineItem } from "@kb/contracts";
import { lineNotices, lineRanges, ministryShort, policyItem, splitShared } from "./hs-notices";

// Câu thật của lô bạch tuộc 0307.52.00 (hscode-api trước khi có warning_details).
const POLICY_1 =
  "Quản lý chuyên ngành (Bộ Nông nghiệp và Phát triển nông thôn): Động vật thân mềm, đã hoặc chưa bóc mai, vỏ.| Bạch tuộc (Octopus spp.):/ - Đông lạnh – Luật Thú y, - Nghị định số 15/2018/NĐ-CP, - Thông tư số 26/2016/TT-BNNPTNT.";
const POLICY_2 = "Quản lý chuyên ngành (Bộ Nông nghiệp và Phát triển nông thôn): Động vật thân mềm, đã hoặc chưa bóc mai, vỏ. – Luật Thú y, - Nghị định số 15/2018/NĐ-CP.";
const VAT = "Thuế GTGT không chịu thuế phụ thuộc điều kiện ngoài mã HS: xem ghi chú thuế GTGT.";
const FTA_1 = "Biểu thuế FTA chưa có kỳ của ngày nhập khẩu: áp thuế suất kỳ cuối, cần xác nhận với biểu thuế mới.";
const FTA_2 = "Thuế FTA của mã này còn đang giảm theo lộ trình: mức thật của năm nhập khẩu có thể thấp hơn.";

const hs = (warnings: string[], warningDetails?: HsWarningDetail[]) =>
  ({ status: "completed", question: null, error: null, reasoning: null, legalBasis: [], warnings, candidates: [], ...(warningDetails ? { warningDetails } : {}) }) as NonNullable<LineItem["hs"]>;
const line = (id: string, lineNo: number, warnings: string[], extra: Partial<LineItem> = {}) => ({ id, lineNo, hs: hs(warnings), hsConfirmed: undefined, vatCertain: undefined, vatNote: undefined, ...extra }) as LineItem;

describe("lineNotices", () => {
  it("câu cũ: đoán mã, gộp 2 bản ghi cùng Bộ và 2 câu kỳ FTA → 3 lưu ý thay vì 5 câu", () => {
    const n = lineNotices(line("a", 1, [POLICY_1, POLICY_2, VAT, FTA_1, FTA_2]));
    expect(n.map((x) => [x.code, x.level, x.group])).toEqual([
      ["SPECIALIZED_POLICY", "info", "policy"],
      ["VAT_CONDITIONAL", "info", "tax"],
      ["FTA_LAST_PERIOD", "info", "tax"],
    ]);
    expect(n[0]).toMatchObject({ params: { ministry: "Bộ Nông nghiệp và Phát triển nông thôn" }, items: [POLICY_1, POLICY_2] });
    expect(n[2]!.items).toEqual([FTA_1, FTA_2]);
  });

  it("bản có cấu trúc dùng nguyên; câu ngoài bản cấu trúc (bài học tờ khai) vẫn hiện, không rõ mã → OTHER/warning", () => {
    const item = line("a", 1, ["Gợi ý 1234.56.78 – kiểm lại"], {});
    item.hs = hs(["Khác mã HS trên hóa đơn (940511).", "Gợi ý 1234.56.78 – kiểm lại"], [
      { code: "INVOICE_HS_MISMATCH", level: "danger", group: "classification", text: "Khác mã HS trên hóa đơn (940511).", params: { invoiceHs: "940511" } },
    ]);
    expect(lineNotices(item).map((x) => [x.code, x.level])).toEqual([["INVOICE_HS_MISMATCH", "danger"], ["OTHER", "warning"]]);
  });

  it("dòng đã xác nhận có VAT cần xét điều kiện mà API không báo → thêm lưu ý VAT kèm điều kiện", () => {
    const n = lineNotices(line("a", 1, [], { hsConfirmed: "0307.52.00", vatCertain: false, vatNote: "Thủy sản chưa chế biến" }));
    expect(n).toEqual([{ code: "VAT_CONDITIONAL", level: "info", group: "tax", text: "Thủy sản chưa chế biến", items: ["Thủy sản chưa chế biến"] }]);
  });
});

describe("splitShared", () => {
  it("lưu ý giống nhau trên ≥ 2 dòng gom lên đầu bảng; danger ở lại dòng; lưu ý riêng ở lại dòng", () => {
    const mismatch = "Khác mã HS trên hóa đơn (030751).";
    const items = [line("a", 1, [POLICY_1, VAT, mismatch]), line("b", 2, [POLICY_1, VAT, mismatch]), line("c", 3, [VAT, "Độ tin cậy thấp (40%): kiểm tra kỹ."])];
    const { shared, perLine } = splitShared(items);
    expect(shared.map((s) => [s.notice.code, s.lines])).toEqual([["SPECIALIZED_POLICY", [1, 2]], ["VAT_CONDITIONAL", [1, 2, 3]]]);
    expect(perLine.get("a")!.map((n) => n.code)).toEqual(["INVOICE_HS_MISMATCH"]);
    expect(perLine.get("c")!.map((n) => [n.code, n.params?.pct])).toEqual([["LOW_CONFIDENCE", "40"]]);
  });

  it("chỉ một dòng → không gom gì", () => {
    expect(splitShared([line("a", 1, [VAT])]).shared).toEqual([]);
  });
});

describe("định dạng", () => {
  it("lineRanges gộp dãy liên tiếp ≥ 3", () => {
    expect(lineRanges([1, 2, 3, 4, 5])).toBe("1–5");
    expect(lineRanges([1, 2, 4, 6, 7, 8])).toBe("1, 2, 4, 6–8");
  });

  it("policyItem tách mục chính và văn bản căn cứ, bỏ đầu 'Quản lý chuyên ngành (Bộ …)'", () => {
    expect(policyItem(POLICY_1)).toEqual({
      text: "Động vật thân mềm, đã hoặc chưa bóc mai, vỏ. · Bạch tuộc (Octopus spp.) – Đông lạnh",
      refs: ["Luật Thú y", "Nghị định số 15/2018/NĐ-CP", "Thông tư số 26/2016/TT-BNNPTNT"],
    });
    expect(policyItem("Quản lý chuyên ngành: Đá ốp lát tự nhiên.")).toEqual({ text: "Đá ốp lát tự nhiên.", refs: [] });
  });

  it("ministryShort viết tắt Bộ quen thuộc, Bộ lạ giữ nguyên", () => {
    expect(ministryShort("Bộ Nông nghiệp và Phát triển nông thôn")).toBe("Bộ NN&PTNT");
    expect(ministryShort("Bộ Y tế")).toBe("Bộ Y tế");
  });
});
