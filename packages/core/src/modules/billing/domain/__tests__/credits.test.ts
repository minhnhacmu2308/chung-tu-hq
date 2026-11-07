import { describe, expect, it } from "vitest";
import { allowanceDecision, availableCredits, ledgerKeys } from "../credits.js";

describe("lượt khả dụng", () => {
  it("available = balance − reserved, có thể âm", () => {
    expect(availableCredits(10, 3)).toBe(7);
    expect(availableCredits(1, 3)).toBe(-2);
  });
  it("khóa chống trùng theo số tờ khai / mã đơn", () => {
    expect(ledgerKeys.charge("org_a", "107000123456")).toBe("charge:org_a:107000123456");
    expect(ledgerKeys.purchase(123)).toBe("payos:123");
    expect(ledgerKeys.signup("org_a")).toBe("grant:signup:org_a");
  });
});

describe("allowanceDecision", () => {
  const payg = { kind: "PAYG" as const, contract: null };
  it("PAYG đủ lượt → ok; thiếu → INSUFFICIENT_CREDITS kèm needed/available", () => {
    expect(allowanceDecision({ ...payg, balance: 5, reserved: 2, sheetsToStart: 3 })).toEqual({ ok: true });
    expect(allowanceDecision({ ...payg, balance: 5, reserved: 3, sheetsToStart: 3 })).toEqual({ ok: false, code: "INSUFFICIENT_CREDITS", needed: 3, available: 2 });
    expect(allowanceDecision({ ...payg, balance: 0, reserved: 2, sheetsToStart: 1 })).toEqual({ ok: false, code: "INSUFFICIENT_CREDITS", needed: 1, available: 0 });
  });
  it("khai chính thức cả lô: các tờ đã nằm trong reserved không tính hai lần", () => {
    expect(allowanceDecision({ ...payg, balance: 3, reserved: 3, sheetsToStart: 3, ownReserved: 3 })).toEqual({ ok: true });
    expect(allowanceDecision({ ...payg, balance: 3, reserved: 5, sheetsToStart: 3, ownReserved: 3 })).toEqual({ ok: false, code: "INSUFFICIENT_CREDITS", needed: 3, available: 1 });
  });
  it("không tờ nào cần lượt → ok", () => {
    expect(allowanceDecision({ ...payg, balance: -2, reserved: 0, sheetsToStart: 0 })).toEqual({ ok: true });
  });
  it("CONTRACT: EXPIRED chặn; GRACE / EXPIRING / ACTIVE cho gửi (không xét số dư)", () => {
    const c = { kind: "CONTRACT" as const, balance: 0, reserved: 9, sheetsToStart: 4 };
    expect(allowanceDecision({ ...c, contract: "EXPIRED" })).toEqual({ ok: false, code: "CONTRACT_EXPIRED" });
    for (const s of ["GRACE", "EXPIRING", "ACTIVE"] as const) expect(allowanceDecision({ ...c, contract: s })).toEqual({ ok: true });
  });
});
