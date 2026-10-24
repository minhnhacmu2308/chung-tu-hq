// Form tờ khai đầy đủ theo ngôn ngữ giao diện: tab "Hải quan trả về" render ở en/zh; tên khối / chỉ tiêu (@kb/contracts) giữ nguyên.
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UiLocaleProvider, type UiLocale } from "@kb/ui";
import { layoutFor } from "@kb/contracts";
import { describe, expect, it, vi } from "vitest";
import { CustomsTab } from "./customs-tab";
import { codeScope } from "./code-scope";
import { declarationLockOf } from "./dossier-adapter";
import { operationsAt } from "./stage-rules";
import { navSections } from "./view-state";

vi.stubGlobal("React", React);

const render = (locale: UiLocale) =>
  renderToStaticMarkup(createElement(UiLocaleProvider, { locale, children: createElement(CustomsTab, { layout: layoutFor("IDA"), values: {}, items: [{}] }) }));

describe("CustomsTab theo ngôn ngữ", () => {
  it("en: thông báo và tiêu đề đã dịch", () => {
    const html = render("en");
    expect(html).toContain("Declarants do not enter this information");
    expect(html).toContain("Per goods line");
    expect(html).not.toContain("Người khai không nhập các thông tin này");
  });
  it("zh", () => {
    const html = render("zh");
    expect(html).toContain("申报人无需填写以下信息");
    expect(html).toContain("逐行货物");
  });
  it("vi giữ nguyên", () => expect(render("vi")).toContain("Người khai không nhập các thông tin này"));
});

describe("hàm thuần nhận locale", () => {
  it("mục lục: nhóm Danh sách hàng dịch, nhóm theo bố cục giữ nguyên", () => {
    const en = navSections(layoutFor("IDA"), "en");
    expect(en.find((s) => s.id === "hang")?.title).toBe("7. Goods list");
  });
  it("phạm vi lọc danh mục", () => expect(codeScope("A014", "TK_CHB", "IDA", { TK_CH: "06B1" }, "zh")?.label).toBe("06B1 的部门"));
  it("nghiệp vụ bổ sung giữ mã HYS", () => expect(operationsAt("nhap", "en")).toContain("Register additional attachments (HYS)"));
  it("lý do khóa ô dòng hàng", () => {
    const lock = declarationLockOf("IDA", "LOCKED", {}, new Map(), "en");
    expect(lock("HAG_CMD")?.reason).toBe("From the HS code – use Select HS code");
  });
});
