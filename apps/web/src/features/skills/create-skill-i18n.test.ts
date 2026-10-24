// Popup "Thêm skill mới" dịch theo ngôn ngữ giao diện: render thân form ở zh / en / vi; mã + tên skill (dữ liệu) giữ nguyên.
import { UiLocaleProvider, type UiLocale } from "@kb/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Skill } from "@/mocks/types";
import { CreateSkillForm } from "./create-skill-dialog";

const skill: Skill = {
  id: "s1",
  code: "SK-INV-GEN",
  name: "Commercial Invoice – chung",
  kind: "DOCUMENT",
  docKind: "INVOICE",
  language: "EN",
  version: 3,
  labeledSamples: 0,
  updatedAt: "2026-10-01T00:00:00.000Z",
  enabled: true,
  fields: [],
};

function render(locale: UiLocale, defaultKind: Skill["kind"] = "DOCUMENT") {
  const client = new QueryClient();
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(UiLocaleProvider, { locale, children: createElement(CreateSkillForm, { skills: [skill], defaultKind, onCancel: () => {}, onCreated: () => {} }) }),
    ),
  );
}

describe("CreateSkillForm theo ngôn ngữ", () => {
  // vitest của app chạy môi trường node, JSX biên dịch kiểu cổ điển → cần React toàn cục.
  beforeAll(() => vi.stubGlobal("React", React));

  it("vi: nhãn tiếng Việt, mã tự sinh gợi ý theo loại chứng từ, nguồn sao chép cùng loại", () => {
    const html = render("vi");
    expect(html).toContain("Tên skill");
    expect(html).toContain("Bắt đầu từ");
    expect(html).toContain("Trường chuẩn của loại chứng từ");
    expect(html).toContain("Tự sinh: SK-INV-2");
    expect(html).toContain("Sao chép từ SK-INV-GEN – Commercial Invoice – chung");
    expect(html).toContain("Tạo skill");
    // Skill theo loại chứng từ: không có ô nhà cung cấp.
    expect(html).not.toContain("Nhà cung cấp");
  });

  it("en: nhãn tiếng Anh; tab nhà cung cấp → có ô nhà cung cấp", () => {
    const html = render("en", "SUPPLIER");
    expect(html).toContain("Skill name");
    expect(html).toContain("Standard fields of the document type");
    expect(html).toContain("Auto: SK-INV-2");
    expect(html).toContain("Supplier");
    expect(html).not.toContain("Tên skill");
  });

  it("zh: nhãn tiếng Trung, dữ liệu skill giữ nguyên", () => {
    const html = render("zh");
    expect(html).toContain("Skill 名称");
    expect(html).toContain("该单证类型的标准字段");
    expect(html).toContain("复制自 SK-INV-GEN – Commercial Invoice – chung");
    expect(html).toContain("创建 Skill");
    expect(html).not.toContain("Bắt đầu từ");
  });
});
