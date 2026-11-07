// Lượt khai (ADR 0011) nhìn từ kết quả truyền: tờ nào đang giữ lượt, tờ nào đã được chấp nhận khai chính thức, chặn trước khi khai tạm lần đầu.
// Tính tiền/ghi sổ là việc của billing qua cổng DeclarationBilling (shared) – module này chỉ đếm tờ.
import type { CustomsStage } from "@kb/contracts";
import type { DeclaredBranch } from "../../../shared/billing.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { ok, type Result } from "../../../shared/result.js";
import { stageOf } from "../domain/state-machine.js";
import type { CustomsDeps, MessageRow, ResultRow } from "./customs-ports.js";

/** Đã có số tờ khai (đã khai tạm) nhưng chưa khai chính thức → đang giữ lượt. */
const RESERVED_STAGES: ReadonlySet<CustomsStage> = new Set(["PRE_DECLARED", "RECALLED"]);
/** Đã được Hải quan chấp nhận khai chính thức (IDC/EDC) → đã tính lượt. */
const DECLARED_STAGES: ReadonlySet<CustomsStage> = new Set(["DECLARED", "AMEND_RECALLED", "AMEND_PRE_DECLARED", "CLEARED", "POST_EDITING", "POST_PRE_DECLARED", "POST_RECALLED"]);

const sysCtx = (orgId: string) => ({ orgId: asOrgId(orgId), userId: asUserId("") });

/** Số tờ khai nhánh 1..`of` chưa có số tờ khai – mỗi tờ sẽ dùng một lượt khi được chấp nhận khai chính thức. Thiếu kết quả nhánh = chưa có số. */
export function unnumberedSheets(results: Pick<ResultRow, "branch" | "declarationNo">[], of: number): number {
  let n = 0;
  for (let b = 1; b <= of; b++) if (!results.find((r) => r.branch === b)?.declarationNo) n++;
  return n;
}

/**
 * Lượt đang giữ của org: tờ khai nhánh đã có số (đã khai tạm, giai đoạn PRE_DECLARED / RECALLED) mà chưa khai chính thức,
 * bỏ tờ thuộc hồ sơ đã hủy. Tờ bị từ chối/hủy (REJECTED) không tính.
 */
export async function countReservedDeclarations(deps: CustomsDeps, orgId: string): Promise<number> {
  const rows = (await deps.uow.asOrg(sysCtx(orgId), (r) => r.results.listNumbered(orgId))).filter((r) => RESERVED_STAGES.has(stageOf(r)));
  if (rows.length === 0) return 0;
  // Chạy mỗi lần đọc phiên → trạng thái hồ sơ đọc một truy vấn (không N+1).
  const ids = [...new Set(rows.map((r) => r.dossierId))];
  const statuses = deps.dossiers.statuses
    ? await deps.dossiers.statuses(orgId, ids)
    : new Map((await Promise.all(ids.map(async (id) => [id, (await deps.dossiers.get(orgId, id))?.status] as const))).filter((x): x is readonly [string, NonNullable<(typeof x)[1]>] => !!x[1]));
  return rows.filter((r) => statuses.get(r.dossierId) !== "CANCELLED").length;
}

/**
 * Tờ khai nhánh được Hải quan chấp nhận khai chính thức từ `since` (job đối soát ghi bù sổ lượt): giai đoạn ≥ DECLARED và có thông điệp
 * IDC/EDC thành công lúc ≥ since (không tính tờ khai chính thức trước mốc – kể cả khi kết quả còn được cập nhật sau đó).
 */
export async function listDeclaredBranches(deps: CustomsDeps, orgId: string, since: Date): Promise<DeclaredBranch[]> {
  return deps.uow.asOrg(sysCtx(orgId), async (r) => {
    // Hai truy vấn cho cả org: kết quả đã có số cập nhật từ mốc + thông điệp IDC/EDC thành công từ mốc.
    const [rows, accepted] = await Promise.all([r.results.listNumbered(orgId, since), r.messages.listSucceededSince(orgId, ["IDC", "EDC"], since)]);
    const firstOk = new Map<string, MessageRow>();
    for (const m of accepted.sort((a, b) => a.at.getTime() - b.at.getTime())) {
      const key = `${m.dossierId}:${m.branch}`;
      if (!firstOk.has(key)) firstOk.set(key, m);
    }
    return rows.flatMap((x): DeclaredBranch[] => {
      const m = firstOk.get(`${x.dossierId}:${x.branch}`);
      return DECLARED_STAGES.has(stageOf(x)) && m && x.declarationNo ? [{ orgId, dossierId: x.dossierId, branch: x.branch, declarationNo: x.declarationNo, op: m.operation }] : [];
    });
  });
}

/** Chặn trước khi khai tạm lần đầu `sheets` tờ (spec §4.2). Không nối billing (test/cấu hình cũ) → cho qua. */
export async function checkFirstSendAllowance(deps: CustomsDeps, orgId: string, sheets: number, ownReserved = 0): Promise<Result<void>> {
  if (!deps.billing || sheets <= 0) return ok(undefined);
  return deps.billing.checkAllowance(orgId, { sheetsToStart: sheets, ...(ownReserved > 0 ? { ownReserved } : {}) });
}
