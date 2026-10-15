import { describe, expect, it } from "vitest";
import { fixedClock } from "../../../shared/clock.js";
import { domainError } from "../../../shared/errors.js";
import { customsHubProbe, type CustomsHubProbeDeps } from "./customs-hub-probe.js";

const CERT = { issuer: "VNPT-CA", validTo: "2027-12-18" };
const ACCOUNT = { useR_ID: "BI820001", password: "x", terminaL_ID: "Z9999M", terminaL_ACCESS_KEY: "k" };
const probe = (over: Partial<CustomsHubProbeDeps> = {}) =>
  customsHubProbe({
    env: { CUSTOMS_GATEWAY: "fpt", FPT_API_BASE_URL: "http://localhost:7070" }, clock: fixedClock("2026-10-14T08:00:00.000Z"),
    defaultCertificate: async () => CERT, vnaccs: { get: async () => ACCOUNT }, fpt: { ping: async () => ({ expiresAt: new Date() }) }, ...over,
  }).probe("org_a");

describe("customsHubProbe", () => {
  it("FPT: đủ chứng thư + tài khoản + đăng nhập được → ok, nêu host và tài khoản", async () => {
    const r = await probe();
    expect(r.ok).toBe(true);
    expect(r.detail).toContain("localhost:7070");
    expect(r.detail).toContain("BI820001");
  });
  it("giả lập (CUSTOMS_GATEWAY=fake) → chỉ kiểm chứng thư, không gọi FPT", async () => {
    let called = false;
    const r = await probe({ env: { CUSTOMS_GATEWAY: "fake" }, fpt: { ping: async () => { called = true; return { expiresAt: new Date() }; } } });
    expect(r).toEqual({ ok: true, detail: "Ký thử thành công bằng chứng thư VNPT-CA · môi trường giả lập" });
    expect(called).toBe(false);
  });
  it("chưa có chứng thư / sắp hết hạn → lỗi trước khi gọi FPT", async () => {
    expect((await probe({ defaultCertificate: async () => null })).ok).toBe(false);
    expect((await probe({ defaultCertificate: async () => ({ issuer: "X", validTo: "2026-10-20" }) })).detail).toContain("E-CERT-EXPIRING");
  });
  it("chưa nhập tài khoản VNACCS → lỗi hướng dẫn nhập", async () => {
    expect(await probe({ vnaccs: { get: async () => null } })).toEqual({ ok: false, detail: expect.stringContaining("Chưa nhập tài khoản VNACCS") });
  });
  it("máy chủ thiếu FPT_API_* → lỗi cấu hình", async () => {
    expect((await probe({ fpt: null })).detail).toContain("FPT_API_BASE_URL");
  });
  it("đăng nhập FPT thất bại → lỗi kèm lý do", async () => {
    const r = await probe({ fpt: { ping: async () => { throw domainError("INTEGRATION_NOT_CONFIGURED", "Đăng nhập API FPT thất bại (HTTP 401)"); } } });
    expect(r).toEqual({ ok: false, detail: "Không đăng nhập được FPT.VNACCS: Đăng nhập API FPT thất bại (HTTP 401)" });
  });
});
