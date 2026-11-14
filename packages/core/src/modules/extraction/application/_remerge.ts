// Gộp lại toàn bộ hồ sơ từ các extraction DONE: shipment version mới, chiếu trường (giữ USER_CONFIRMED), chạy luật, cập nhật hồ sơ.
import { EXTRACTION_SCHEMA_VERSION, vnDateOf, type Shipment, type Sourced } from "@kb/contracts";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { isSuspect } from "../domain/field-status.js";
import { applyIssued } from "../domain/issued.js";
import { applyManual } from "../domain/manual.js";
import { mergeExtractions, type FileExtraction } from "../domain/merge.js";
import { confirmedItemValues, isMergedLine, mergeIdenticalLines } from "../domain/merge-lines.js";
import { isValidTaxCode } from "../domain/normalize.js";
import { projectFields } from "../domain/project-fields.js";
import type { ExtractionDeps, ExtractionRepos, FieldRow } from "./ports.js";

export function setSourced(s: Shipment, path: string, patch: Partial<Sourced<string>>) {
  let cur: unknown = s;
  const parts = path.split("/").filter(Boolean);
  for (const p of parts.slice(0, -1)) cur = (cur as Record<string, unknown>)[p];
  const leaf = (cur as Record<string, Sourced<string>>)[parts[parts.length - 1]!];
  if (leaf) Object.assign(leaf, patch);
}

/** Hậu tố khóa giữ ẩn số lượng / thành tiền riêng của dòng đầu nhóm khi đang gộp dòng. */
const LINE_SUFFIX = "@line";
const QA = /^item\.\d+\.(quantity|amount)$/;
const baseKey = (key: string) => (key.endsWith(LINE_SUFFIX) ? key.slice(0, -LINE_SUFFIX.length) : key);
/** Số dòng của khóa trường dòng hàng `item.N.<key>` (khác → NaN). */
const lineOf = (key: string) => Number(/^item\.(\d+)\./.exec(key)?.[1]);

/** Đếm trường nghi ngờ theo ngưỡng org. */
export const countSuspect = (rows: { status: FieldRow["status"] }[], threshold: "STRICT" | "BALANCED" | "RELAXED") => rows.filter((f) => isSuspect(f.status, threshold)).length;

export async function remergeDossier(deps: ExtractionDeps, orgId: string, dossierId: string): Promise<void> {
  const org = await deps.documents.orgInfo(orgId);
  const docsAll = await deps.documents.listForDossier(orgId, dossierId);
  // Đọc ngoài transaction (không gọi port module khác trong uow – CLAUDE.md core).
  const info = await deps.documents.dossierInfo(orgId, dossierId);
  const invoiceIssued = info?.documentSources.INVOICE === "ISSUED";
  const ctx = { orgId: asOrgId(orgId), userId: asUserId("") };
  const result = await deps.uow.asOrg(ctx, async (r: ExtractionRepos) => {
    await r.lockDossier(orgId, dossierId);
    const done = docsAll.filter((d) => d.status === "DONE");
    const rows = await r.extractions.listDone(orgId, dossierId, done.map((d) => d.id));
    // Mỗi chứng từ lấy extraction mới nhất khớp loại hiện tại.
    const files: FileExtraction[] = done.flatMap((d) => {
      const mine = rows.filter((x) => x.documentId === d.id && x.kind === d.kind).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const latest = mine[0];
      return latest ? [{ documentId: d.id, kind: d.kind, pages: d.pages, data: latest.raw as Record<string, unknown>, ...(latest.regions ? { regions: latest.regions } : {}) }] : [];
    });
    const latestShipment = await r.shipments.latest(orgId, dossierId);
    const version = (latestShipment?.version ?? 0) + 1;
    // Dữ liệu nhập tay (ADR 0013) ghép sau khi gộp chứng từ – hồ sơ chưa có chứng từ nào vẫn có shipment.
    const manual = await r.manual.get(orgId, dossierId);
    const shipment = applyManual(mergeExtractions(files, { version, taxCodeValid: isValidTaxCode }), manual?.data ?? null);
    const existing = await r.fields.list(orgId, dossierId);
    // Người khai đồng ý gộp dòng hàng giống nhau ở bước OCR (cờ của hồ sơ) – gộp sau dữ liệu nhập tay, xét nhóm và cộng theo giá trị
    // người khai đã xác nhận của TỪNG DÒNG. Dòng đầu nhóm: trường item.N.quantity|amount là số của cả nhóm, số riêng của dòng giữ ẩn ở khóa `…@line`.
    const wasMerged = new Set((latestShipment?.data.items ?? []).filter(isMergedLine).map((it) => it.lineNo));
    const itemConfirmed = existing.filter((f) => f.status === "USER_CONFIRMED" && f.group === "ITEMS");
    // Giá trị đã xác nhận RIÊNG của từng dòng: trường thường (trừ số lượng / thành tiền của dòng đầu nhóm bản trước – đó là số cả nhóm) + trường `…@line`.
    const own = itemConfirmed.filter((f) => f.key.endsWith(LINE_SUFFIX) || !(QA.test(f.key) && wasMerged.has(lineOf(f.key))));
    const lineNos = shipment.items.map((it) => it.lineNo);
    const mergedNow = new Set(info?.mergeIdenticalLines ? mergeIdenticalLines(shipment, confirmedItemValues(own.map((f) => ({ key: baseKey(f.key), value: f.value })))) : []);
    // Dòng có số lượng / thành tiền máy tính lại: vừa gộp hoặc vừa tách khỏi nhóm (bản shipment trước là dòng gộp).
    const recomputed = new Set([...mergedNow, ...wasMerged]);
    // Giữ ẩn (shipmentPath null, listFields không trả) để tách lại thì khôi phục:
    // dòng bị gộp vào dòng khác → mọi giá trị riêng; dòng đầu nhóm → số lượng / thành tiền riêng dưới khóa `…@line`.
    const absorbed = new Set(lineNos.filter((n) => !shipment.items.some((it) => it.lineNo === n)));
    const parked: FieldRow[] = own.flatMap((f): FieldRow[] => {
      const n = lineOf(f.key);
      if (absorbed.has(n)) return [{ ...f, shipmentPath: null }];
      if (!mergedNow.has(n) || !(f.key.endsWith(LINE_SUFFIX) || QA.test(f.key))) return [];
      return [f.key.endsWith(LINE_SUFFIX) ? { ...f, shipmentPath: null } : { ...f, id: deps.idGen.next("fld"), key: `${f.key}${LINE_SUFFIX}`, shipmentPath: null }];
    });
    // Dòng đứng riêng (không gộp, không bị gộp): số riêng giữ ở `…@line` thay cho số cả nhóm làm giá trị trước đó.
    const splitBack = new Map(
      own.filter((f) => f.key.endsWith(LINE_SUFFIX) && !mergedNow.has(lineOf(f.key)) && !absorbed.has(lineOf(f.key))).map((f) => [`${f.documentId}:${baseKey(f.key)}`, f]),
    );

    const byKey = new Map(existing.map((f) => [`${f.documentId}:${f.key}`, f]));
    const now = deps.clock.now();
    const fieldRows: FieldRow[] = projectFields(shipment).map((p) => {
      const prev = splitBack.get(`${p.documentId}:${p.key}`) ?? byKey.get(`${p.documentId}:${p.key}`);
      // Số lượng / thành tiền của dòng vừa gộp / tách: giá trị máy tính ra đổi → giá trị người khai sửa trước đó không còn đúng chỗ, bỏ. Dòng khác giữ nguyên.
      const basisChanged = !!prev && QA.test(p.key) && recomputed.has(lineOf(p.key)) && prev.originalValue !== p.value;
      const keepUser = prev?.status === "USER_CONFIRMED" && !basisChanged;
      if (keepUser && p.shipmentPath) setSourced(shipment, p.shipmentPath, { value: prev.value, status: "USER_CONFIRMED" });
      return {
        id: prev?.id ?? deps.idGen.next("fld"), orgId, dossierId, documentId: p.documentId, group: p.group, key: p.key, label: p.label,
        value: keepUser ? prev.value : p.value, originalValue: basisChanged ? p.value : (prev?.originalValue ?? p.value), status: keepUser ? "USER_CONFIRMED" : p.status,
        region: p.region ?? prev?.region ?? null, note: keepUser ? null : (p.note ?? null), shipmentPath: p.shipmentPath,
        confirmedBy: keepUser ? prev.confirmedBy : null, confirmedAt: keepUser ? prev.confirmedAt : null,
      };
    });
    // Số hóa đơn hệ thống cấp (ADR 0013 mục 3) ghép sau cùng: số đã cấp luôn là chỉ tiêu Số hóa đơn, không bị ô sửa tay đè.
    // Chỉ khi nguồn Invoice còn là "hệ thống phát hành": người khai đổi sang invoice tải lên thì số trên invoice thật thắng.
    const issued = invoiceIssued ? (await r.issued.list(orgId, dossierId)).find((x) => x.status !== "VOID") : undefined;
    applyIssued(shipment, issued ? { no: issued.no, date: issued.snapshot?.invoice.date ?? vnDateOf(issued.issuedAt) } : null);
    await r.fields.replaceForDossier(orgId, dossierId, [...fieldRows, ...parked]);
    await r.shipments.insert({ id: deps.idGen.next("job"), orgId, dossierId, version, data: shipment, schemaVersion: String(EXTRACTION_SCHEMA_VERSION), createdAt: now });
    return { shipment, version, suspect: countSuspect(fieldRows, org.suspectThreshold) };
  });
  await deps.validation.run(orgId, dossierId, result.shipment, result.version, { taxCode: org.taxCode, name: org.name });
  const inv = result.shipment.invoice;
  const { finishedNow } = await deps.documents.afterMerge(orgId, dossierId, {
    suspectFields: result.suspect,
    ...(inv.totalAmount.value ? { invoiceValue: inv.totalAmount.value } : {}),
    ...(inv.currency.value ? { currency: inv.currency.value } : {}),
    ...(result.shipment.transport.billNo.value ? { billNo: result.shipment.transport.billNo.value } : {}),
    allDone: docsAll.every((d) => d.status === "DONE" || d.status === "ERROR"),
  });
  // Chỉ báo một lần khi hồ sơ vừa đọc xong; chạy lại job / gộp lại sau khi xóa chứng từ không báo nữa.
  if (finishedNow && docsAll.length) await deps.notify?.notify(orgId, { dossierOwnerOf: dossierId }, { title: "Đã đọc xong bộ chứng từ", body: `${result.suspect} trường cần kiểm tra – vào bước OCR & kiểm tra để xác nhận.`, href: `/dossiers/${dossierId}?step=ocr` });
  await deps.documents.publish(orgId, dossierId, { type: "fields.updated" });
}

/** Gộp lại shipment + luật + tờ khai nháp sau khi nguồn chứng từ đổi (vd Invoice ISSUED ↔ tải lên). Gọi từ composition root. */
export async function refreshAfterSourcesChanged(deps: ExtractionDeps, orgId: string, dossierId: string): Promise<void> {
  await remergeDossier(deps, orgId, dossierId);
  await deps.onShipmentEdited?.(orgId, dossierId);
}
