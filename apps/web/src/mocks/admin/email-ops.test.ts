import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-error";
import { seedAdmin } from "../seed/admin";
import { seedCore } from "../seed/core";
import { seedSettings } from "../seed/settings";
import * as email from "./email-ops";
import * as ops from "./ops";

let db: ops.AdminScope;
const as = (who: "bao.hoang" | "trang.mai" | "viet.dinh") => ops.adminLogin(db, `${who}@khaibao-demo.vn`, "matkhau");
const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ApiError) return e.code;
    throw e;
  }
  return "OK";
};
const BLOCKS = [{ id: "b1", type: "text" as const, text: "Chào {{name}}", align: "left" as const }];

beforeEach(() => {
  const core = seedCore();
  db = structuredClone({ org: core.org, members: core.members, notifications: core.notifications, ...seedSettings(), ...seedAdmin() });
});

describe("email (mock)", () => {
  it("mẫu: Hỗ trợ tạo / sửa / xóa; Chỉ xem không sửa được", () => {
    as("viet.dinh");
    expect(codeOf(() => email.saveTemplate(db, null, { name: "X", subject: "S", blocks: BLOCKS }))).toBe("FORBIDDEN");
    as("trang.mai");
    const t = email.saveTemplate(db, null, { name: "X", subject: "S", blocks: BLOCKS });
    expect(email.listTemplates(db)[0]!.id).toBe(t.id);
    email.saveTemplate(db, t.id, { name: "Y", subject: "S", blocks: BLOCKS });
    expect(email.listTemplates(db).find((x) => x.id === t.id)!.name).toBe("Y");
    email.deleteTemplate(db, t.id);
    expect(email.listTemplates(db).some((x) => x.id === t.id)).toBe(false);
  });

  it("chữ ký: riêng chỉ chủ thấy; chung cần quyền Nền tảng; đặt mặc định bỏ mặc định cũ", () => {
    as("trang.mai");
    expect(codeOf(() => email.saveSignature(db, null, { name: "Chung 2", personal: false, isDefault: true, blocks: BLOCKS }))).toBe("FORBIDDEN");
    const mine = email.saveSignature(db, null, { name: "Trang", personal: true, isDefault: true, blocks: BLOCKS });
    as("bao.hoang");
    expect(email.listSignatures(db).map((s) => s.id)).not.toContain(mine.id);
    const c2 = email.saveSignature(db, null, { name: "Chung 2", personal: false, isDefault: true, blocks: BLOCKS });
    expect(email.listSignatures(db).filter((s) => !s.personal && s.isDefault).map((s) => s.id)).toEqual([c2.id]);
  });

  it("gửi: chưa cấu hình máy chủ gửi mail → báo; cấu hình xong gửi được, có kết quả từng người + nhật ký", () => {
    as("bao.hoang");
    const input = { subject: "Tin mới", blocks: BLOCKS, audience: { orgs: { mode: "ALL" as const }, roles: ["OWNER" as const], userIds: [], extraEmails: ["khong-ton-tai@x.vn"] } };
    expect(codeOf(() => email.send(db, input))).toBe("INTEGRATION_NOT_CONFIGURED");
    email.updateSettings(db, { host: "smtp.gmail.com", port: 465, secure: true, username: "ops@khaibao.ai", password: "app-pass", fromName: "KhaiBáo AI", fromEmail: "ops@khaibao.ai" });
    const preview = email.previewAudience(db, input.audience);
    const c = email.send(db, input);
    expect(c.total).toBe(preview.total);
    expect(c).toMatchObject({ status: "PARTIAL", failed: 1 });
    expect(email.getCampaign(db, c.id).recipients.find((r) => r.email === "khong-ton-tai@x.vn")).toMatchObject({ status: "FAILED" });
    expect(db.admin.audit[0]).toMatchObject({ action: "EMAIL_SENT" });
  });

  it("cấu hình gửi mail chỉ quyền Nền tảng; không bao giờ trả mật khẩu", () => {
    as("trang.mai");
    expect(codeOf(() => email.getSettings(db))).toBe("FORBIDDEN");
    as("bao.hoang");
    const s = email.updateSettings(db, { host: "smtp.office365.com", port: 587, secure: false, username: "a@b.vn", password: "p", fromName: "K", fromEmail: "a@b.vn" });
    expect(s).toMatchObject({ configured: true, hasPassword: true, lastTest: { ok: true } });
    expect(JSON.stringify(s)).not.toContain('"p"');
  });
});
