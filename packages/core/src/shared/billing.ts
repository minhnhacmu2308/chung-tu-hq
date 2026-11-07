// Cổng tính lượt khai (ADR 0011): module integration chỉ biết cổng này; billing hiện thực, composition root nối (như ServiceUsageMeter).
import type { DomainError } from "./errors.js";
import type { Result } from "./result.js";

/** Một tờ khai nhánh vừa được Hải quan chấp nhận khai chính thức (IDC/EDC thành công, có phân luồng). */
export type DeclaredBranch = { orgId: string; dossierId: string; branch: number; declarationNo: string; op: string };

export interface DeclarationBilling {
  /**
   * Trước khi gửi khai tạm lần đầu: còn đủ lượt (PAYG) / hợp đồng chưa hết hạn (CONTRACT) cho `sheetsToStart` tờ.
   * `ownReserved`: số tờ trong đó đã có số (đang được giữ lượt) – khai chính thức cả lô.
   */
  checkAllowance(orgId: string, input: { sheetsToStart: number; ownReserved?: number }): Promise<Result<void>>;
  /** Ghi sổ lượt: PAYG trừ 1 lượt (CHARGE), CONTRACT đếm (CONTRACT_USE). Khóa `charge:<orgId>:<declarationNo>` – ghi lại không trừ lần 2. */
  onDeclared(e: DeclaredBranch): Promise<void>;
}

/**
 * Ghi lượt kiểu "cố gắng hết sức" (như meterSafely): tờ khai đã được Hải quan chấp nhận thì lỗi ghi sổ KHÔNG làm hỏng luồng, chỉ log `[billing]`.
 * Job đối soát hằng ngày (billing-reconcile) ghi bù dòng bị sót. Không nối billing (test/cấu hình cũ) → bỏ qua.
 */
export async function chargeSafely(billing: DeclarationBilling | undefined, e: DeclaredBranch, log: (msg: string) => void = (m) => console.error(m)): Promise<void> {
  if (!billing) return;
  try {
    await billing.onDeclared(e);
  } catch (x) {
    log(`[billing] Không ghi được lượt cho tờ khai ${e.declarationNo} (org ${e.orgId}, hồ sơ ${e.dossierId}, tờ ${e.branch}): ${x instanceof Error ? x.message : String(x)}`);
  }
}

/** Bản ghi nhớ cho test use case: cùng số tờ khai chỉ ghi một lần; `deny` = lỗi trả về khi kiểm lượt; `fail` = mô phỏng DB lỗi. */
export class RecordingDeclarationBilling implements DeclarationBilling {
  readonly declared: DeclaredBranch[] = [];
  readonly checks: { orgId: string; sheetsToStart: number; ownReserved: number }[] = [];
  deny: DomainError | null = null;
  fail = false;
  async checkAllowance(orgId: string, input: { sheetsToStart: number; ownReserved?: number }): Promise<Result<void>> {
    this.checks.push({ orgId, sheetsToStart: input.sheetsToStart, ownReserved: input.ownReserved ?? 0 });
    return this.deny ? { ok: false, error: this.deny } : { ok: true, value: undefined };
  }
  async onDeclared(e: DeclaredBranch) {
    if (this.fail) throw new Error("db down");
    if (this.declared.some((x) => x.orgId === e.orgId && x.declarationNo === e.declarationNo)) return;
    this.declared.push(e);
  }
}
