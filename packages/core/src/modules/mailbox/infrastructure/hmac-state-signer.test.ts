import { createHmac, hkdfSync, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { OAuthState } from "../application/ports.js";
import { HmacStateSigner } from "./hmac-state-signer.js";

const key = randomBytes(32).toString("base64");
const st: OAuthState = { orgId: "org_anphat", userId: "usr_chau", provider: "GMAIL", exp: 1_800_000_000_000, nonce: "mcn_01" };

describe("HmacStateSigner", () => {
  it("ký rồi kiểm lại được đúng nội dung", () => {
    const s = new HmacStateSigner(key);
    expect(s.verify(s.sign(st))).toEqual(st);
  });
  it("sửa nội dung, sai chữ ký, khác khóa, sai định dạng → null", () => {
    const s = new HmacStateSigner(key);
    const [, sig] = s.sign(st).split(".");
    const forged = `${Buffer.from(JSON.stringify({ ...st, orgId: "org_khac" })).toString("base64url")}.${sig}`;
    expect(s.verify(forged)).toBeNull();
    expect(new HmacStateSigner(randomBytes(32).toString("base64")).verify(s.sign(st))).toBeNull();
    for (const bad of ["", "abc", "a.b", `${s.sign(st)}.x`, "%%%.%%%"]) expect(s.verify(bad)).toBeNull();
    // Chữ ký đúng nhưng JSON thiếu trường
    const k = Buffer.from(hkdfSync("sha256", Buffer.from(key, "base64"), Buffer.alloc(0), "mailbox-oauth-state", 32));
    const body = Buffer.from(JSON.stringify({ orgId: "x" })).toString("base64url");
    expect(s.verify(`${body}.${createHmac("sha256", k).update(body).digest("base64url")}`)).toBeNull();
  });
});
