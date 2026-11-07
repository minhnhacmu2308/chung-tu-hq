// Quy tắc lượt (ADR 0011) – code thuần. Quyết định chặn/cho gửi nằm ở @kb/contracts (dùng chung với mock FE).
export { allowanceDecision, availableCredits, LOW_CREDITS, SIGNUP_GRANT_CREDITS, type AllowanceDecision, type AllowanceInput } from "@kb/contracts";

/** Khóa chống trùng của sổ lượt (= id dòng). Cùng số tờ khai chỉ trừ một lần (IDC01 / khai lại cùng số không trừ lần 2). */
export const ledgerKeys = {
  charge: (orgId: string, declarationNo: string) => `charge:${orgId}:${declarationNo}`,
  purchase: (orderCode: number) => `payos:${orderCode}`,
  signup: (orgId: string) => `grant:signup:${orgId}`,
  migrate: (orgId: string) => `grant:migrate:${orgId}`,
  adminGrant: (orgId: string) => `grant:admin:${orgId}`,
};

