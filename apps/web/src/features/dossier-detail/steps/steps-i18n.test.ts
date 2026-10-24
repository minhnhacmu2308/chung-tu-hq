// Bước 5–6 theo ngôn ngữ giao diện: render khối "Hải quan trả về" + nhật ký thông điệp ở zh/en, hàm thuần nhận locale.
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UiLocaleProvider, type UiLocale } from "@kb/ui";
import type { CustomsInfo } from "@kb/contracts";
import { describe, expect, it, vi } from "vitest";
import { CustomsInfoPanel } from "./customs-info-panel";
import { MessageLog } from "./submit-step";
import { inspectionLabel } from "./customs-info-view";
import { errorPlace } from "./customs-errors";
import { provenanceLabel } from "./provenance";
import { rateSourceHint } from "./rate-source";
import { groupDeclarationFields, roleInfo } from "./declaration-groups";

// vitest của apps/web chạy môi trường node, JSX biên dịch kiểu cổ điển (React.createElement) → cấp React toàn cục.
vi.stubGlobal("React", React);

const info: CustomsInfo = {
  receivedAt: "2026-10-20T03:00:00.000Z",
  declarationNo: "107000000010",
  inspectionCode: "2",
  exchangeRates: [{ currency: "USD", rate: "25710" }],
  taxes: [{ name: "Thuế nhập khẩu", amountVnd: "1000000" }],
  totalTaxVnd: "1000000",
  items: [{ lineNo: 1, hsCode: "84713020", customsValue: "1000", customsValueCurrency: "USD" }],
  directives: [{ title: "Chỉ thị A", content: "Nội dung Hải quan gửi" }],
} as CustomsInfo;

const render = <P extends object>(locale: UiLocale, node: (props: P) => React.ReactNode, props: P) =>
  renderToStaticMarkup(createElement(UiLocaleProvider, { locale, children: createElement(node, props) }));

describe("CustomsInfoPanel theo ngôn ngữ", () => {
  it("zh: nhãn đã dịch, dữ liệu Hải quan giữ nguyên", () => {
    const html = render("zh", CustomsInfoPanel, { kind: "IDA", info });
    expect(html).toContain("海关返回");
    expect(html).toContain("报关单号");
    expect(html).toContain("应缴税额合计");
    expect(html).toContain("2 · 黄色通道 – 审核单证");
    expect(html).toContain("进口税率");
    // Thông điệp/tên thuế Hải quan trả về là dữ liệu – không dịch.
    expect(html).toContain("Nội dung Hải quan gửi");
    expect(html).toContain("Thuế nhập khẩu");
    expect(html).not.toContain("Tổng thuế phải nộp");
  });
  it("en: nhãn tiếng Anh", () => {
    const html = render("en", CustomsInfoPanel, { kind: "EDA", info });
    expect(html).toContain("Returned by Customs");
    expect(html).toContain("Export duty rate");
    expect(html).toContain("Yellow channel");
  });
  it("vi: giữ nguyên chữ cũ", () => {
    const html = render("vi", CustomsInfoPanel, { kind: "IDA", info });
    expect(html).toContain("Hải quan trả về");
    expect(html).toContain("Tổng thuế phải nộp");
  });
});

describe("MessageLog theo ngôn ngữ", () => {
  it("zh: tiêu đề + ô trống", () => {
    const html = render("zh", MessageLog, { messages: [] });
    expect(html).toContain("报文日志");
    expect(html).toContain("暂无报文");
  });
});

describe("hàm thuần nhận locale", () => {
  it("en / zh", () => {
    expect(inspectionLabel("3", "en")).toBe("3 · Red channel – document and physical inspection");
    expect(errorPlace({ code: "E1", message: "x", line: 2 }, "zh")).toBe("第 2 行");
    expect(errorPlace({ code: "E1", message: "x" }, "en")).toBe("Error code E1");
    expect(provenanceLabel({ rule: "KHO", via: "source", sourceId: "an.warehouse" }, "en")).toBe("Source chosen by the organization: Warehouse / CY on Arrival Notice");
    expect(rateSourceHint({ currency: "TWD", rate: "805", effectiveFrom: "2026-10-19", source: "MANUAL", snapshotAt: null }, "2026-10-20", "en")).toBe("Week 10/19 – 10/25 · entered manually by the operations team");
    expect(roleInfo("zh").REQUIRED.label).toBe("必填");
    expect(groupDeclarationFields("IDA", [{ code: "MA_LH", no: "1.4", label: "Mã loại hình", value: "", section: "GENERAL", source: "SYSTEM" } as never], "en")[0]!.title).toBe("General information");
  });
});
