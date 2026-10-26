import { describe, expect, it } from "vitest";
import { EmailAudienceSchema, EmailBlockSchema, fillEmailVars, newEmailBlock, renderEmail, type EmailBlock } from "./index.js";

const BLOCKS: EmailBlock[] = [
  { id: "1", type: "heading", text: "Chào {{name}}", level: 1, align: "left" },
  { id: "2", type: "text", text: "Doanh nghiệp **{{orgName}}** có [hướng dẫn](https://khaibao.ai/hd).\nDòng 2 <script>", align: "left" },
  { id: "3", type: "button", label: "Đăng nhập", url: "https://ct-hq.example/login", align: "center", tone: "primary" },
  { id: "4", type: "divider" },
];

describe("renderEmail", () => {
  it("thay biến theo người nhận, escape HTML, giữ định dạng đậm/liên kết, có chữ ký + chân, bản chữ thuần", () => {
    const r = renderEmail({ subject: "Tin cho {{orgName}}", preheader: "Xem ngay", blocks: BLOCKS }, {
      vars: { name: "Chi", orgName: "AN PHÁT" },
      signature: [{ id: "s", type: "text", text: "Đội KhaiBáo AI", align: "left" }],
      footer: "Bạn nhận email vì là khách hàng của KhaiBáo AI.",
    });
    expect(r.subject).toBe("Tin cho AN PHÁT");
    expect(r.html).toContain("Chào Chi");
    expect(r.html).toContain("<strong>AN PHÁT</strong>");
    expect(r.html).toContain('href="https://khaibao.ai/hd"');
    expect(r.html).toContain("&lt;script&gt;");
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("Đội KhaiBáo AI");
    expect(r.html).toContain("Xem ngay");
    expect(r.text).toContain("Đăng nhập: https://ct-hq.example/login");
    expect(r.text).toContain("hướng dẫn (https://khaibao.ai/hd)");
  });

  it("liên kết javascript: bị thay bằng #; biến lạ giữ nguyên", () => {
    const r = renderEmail({ subject: "x", blocks: [{ id: "1", type: "text", text: "[bấm](javascript:alert(1)) {{lạ}}", align: "left" }] });
    expect(r.html).not.toContain("javascript:");
    expect(fillEmailVars("{{foo}} {{name}}", { name: "A" })).toBe("{{foo}} A");
  });

  it("schema: nút phải có liên kết http(s)/mailto/biến; khối mới hợp lệ (trừ liên kết chưa điền)", () => {
    expect(EmailBlockSchema.safeParse({ id: "1", type: "button", label: "x", url: "javascript:x", align: "left", tone: "primary" }).success).toBe(false);
    expect(EmailBlockSchema.safeParse({ id: "1", type: "button", label: "x", url: "{{loginUrl}}", align: "left", tone: "primary" }).success).toBe(true);
    for (const t of ["heading", "text", "divider", "spacer"] as const) expect(EmailBlockSchema.safeParse(newEmailBlock(t, "n")).success).toBe(true);
  });

  it("người nhận: phải chọn ít nhất một nhóm / người / email", () => {
    expect(EmailAudienceSchema.safeParse({ orgs: { mode: "NONE" }, roles: [], userIds: [], extraEmails: [] }).success).toBe(false);
    expect(EmailAudienceSchema.safeParse({ orgs: { mode: "NONE" }, roles: [], userIds: [], extraEmails: ["A@B.vn"] }).data?.extraEmails).toEqual(["a@b.vn"]);
  });
});
