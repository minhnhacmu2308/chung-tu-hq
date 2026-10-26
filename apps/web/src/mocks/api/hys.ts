// HYS (mock): soạn bộ hồ sơ đính kèm, gửi (ACCEPTED ngay), điền cặp 1.63/2.53 vào tờ khai mock. Cùng luật @kb/contracts với backend.
import {
  checkHysSubmission, awaitingContent, extraFieldMeta, fillAttachmentSlot, HYS_PROCEDURE_CODES,
  type AttachmentValues, type CreateHysInput, type HysOverview, type HysSubmissionView, type SendHysInput, type UpdateHysInput,
} from "@kb/contracts";
import { containersFor } from "@/mocks/customs-sim";
import { ApiError, mutate, newId, nowIso, query } from "@/lib/mock-request";
import type { MockDb } from "@/mocks/db";
import { hysValues, pendingSuggestions, type MockHys } from "@/mocks/hys-sim";
import { reasonApiError } from "@/mocks/reason-error";
import { branchCountOf, branchStageOf } from "./customs";

const EDITABLE: readonly string[] = ["DRAFT", "REJECTED", "SEND_FAILED"];

const dossierOf = (db: MockDb, id: string) => {
  const d = db.dossiers.find((x) => x.id === id);
  if (!d) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ");
  return d;
};

const toView = (h: MockHys): HysSubmissionView => {
  const { dossierId: _d, ...view } = h;
  return { ...view, issues: checkHysSubmission({ procedureCode: h.procedureCode, customsOffice: h.customsOffice, processingUnit: h.processingUnit, phone: h.phone, internalRef: h.internalRef, note: h.note, files: h.files.map((f) => ({ fileName: f.fileName, sizeBytes: f.sizeBytes })) }) };
};

function editable(db: MockDb, dossierId: string, id: string): MockHys {
  const h = (db.hys ??= []).find((x) => x.id === id && x.dossierId === dossierId);
  if (!h) throw new ApiError("NOT_FOUND", "Không tìm thấy bộ HYS");
  if (!EDITABLE.includes(h.status)) throw reasonApiError("INVALID_STATE", "HYS_NOT_EDITABLE");
  return h;
}

const checkProcedure = (code: string | undefined) => {
  if (code !== undefined && !(code in HYS_PROCEDURE_CODES)) throw new ApiError("VALIDATION", `Mã thủ tục HYS không hợp lệ: ${code}`);
};

const stagesOf = (db: MockDb, dossierId: string) => Array.from({ length: branchCountOf(db, dossierId) }, (_, i) => branchStageOf(db, dossierId, i + 1));

/** Lô còn sửa được: tờ khai DRAFT/APPROVED và mọi tờ chưa gửi / đang chờ gửi lại nội dung. */
export function lotEditableOf(db: MockDb, dossierId: string): boolean {
  const decl = db.declarations.find((d) => d.dossierId === dossierId);
  if (!decl || (decl.status !== "DRAFT" && decl.status !== "APPROVED")) return false;
  return stagesOf(db, dossierId).every(awaitingContent);
}

const containerCount = (db: MockDb, dossierId: string) => containersFor(dossierOf(db, dossierId), db.documents, db.fields).length;

export const getHysOverview = (dossierId: string) =>
  query((db): HysOverview => {
    const dossier = dossierOf(db, dossierId);
    const rows = (db.hys ?? []).filter((h) => h.dossierId === dossierId).sort((a, b) => a.seq - b.seq);
    const channel = db.customsResults.find((r) => r.dossierId === dossierId)?.channel;
    return {
      submissions: rows.map(toView),
      suggestions: pendingSuggestions(db, dossierId, containerCount(db, dossierId)),
      lotEditable: lotEditableOf(db, dossierId),
      supplementHint: stagesOf(db, dossierId).some((s) => s === "DECLARED") && (channel === "YELLOW" || channel === "RED"),
      defaults: { customsOffice: dossier.customsOffice.split(" ")[0] || null, processingUnit: "00", internalRef: dossier.code.slice(0, 20) },
    };
  });

export const createHys = (dossierId: string, input: CreateHysInput) =>
  mutate((db) => {
    const dossier = dossierOf(db, dossierId);
    checkProcedure(input.procedureCode);
    const list = (db.hys ??= []);
    const seq = list.filter((h) => h.dossierId === dossierId).reduce((m, h) => Math.max(m, h.seq), 0) + 1;
    const h: MockHys = {
      id: newId("hys"), dossierId, seq, procedureCode: input.procedureCode ?? null, customsOffice: dossier.customsOffice.split(" ")[0] || null, processingUnit: "00",
      phone: "", internalRef: dossier.code.slice(0, 20), note: null, purpose: null, status: "DRAFT", attempt: 0, receiptNo: null, registeredOn: null, reject: null, fill: null,
      files: [], issues: [], sentAt: null,
    };
    list.push(h);
    return toView(h);
  });

export const updateHys = (dossierId: string, hysId: string, input: UpdateHysInput) =>
  mutate((db) => {
    dossierOf(db, dossierId);
    checkProcedure(input.procedureCode);
    const h = editable(db, dossierId, hysId);
    if (input.procedureCode !== undefined) h.procedureCode = input.procedureCode;
    if (input.customsOffice !== undefined) h.customsOffice = input.customsOffice;
    if (input.processingUnit !== undefined) h.processingUnit = input.processingUnit;
    if (input.phone !== undefined) h.phone = input.phone;
    if (input.internalRef !== undefined) h.internalRef = input.internalRef;
    if (input.note !== undefined) h.note = input.note;
    if (input.documentIds !== undefined) {
      const ids = [...new Set(input.documentIds)];
      const docs = ids.map((id) => db.documents.find((d) => d.id === id && d.dossierId === dossierId));
      if (docs.some((d) => !d)) throw new ApiError("VALIDATION", "Chứng từ không thuộc hồ sơ");
      h.files = [
        ...h.files.filter((f) => f.documentId === null),
        ...docs.map((d) => ({ id: newId("hysf"), documentId: d!.id, fileName: d!.fileName, mime: "application/pdf", sizeBytes: d!.sizeBytes, source: "DOSSIER" as const })),
      ];
    }
    return toView(h);
  });

export const deleteHys = (dossierId: string, hysId: string) =>
  mutate((db) => {
    editable(db, dossierId, hysId);
    db.hys = db.hys.filter((x) => x.id !== hysId);
  });

export const uploadHysFiles = (dossierId: string, hysId: string, files: File[]) =>
  mutate((db) => {
    const h = editable(db, dossierId, hysId);
    h.files.push(...files.map((f) => ({ id: newId("hysf"), documentId: null, fileName: f.name, mime: f.type || "application/octet-stream", sizeBytes: f.size, source: "UPLOAD" as const })));
    return toView(h);
  });

export const removeHysFile = (dossierId: string, hysId: string, fileId: string) =>
  mutate((db) => {
    const h = editable(db, dossierId, hysId);
    if (!h.files.some((f) => f.id === fileId)) throw new ApiError("NOT_FOUND", "Không tìm thấy file trong bộ HYS");
    h.files = h.files.filter((f) => f.id !== fileId);
    return toView(h);
  });

/** Gửi bộ: Hải quan chấp nhận ngay (số tiếp nhận 12 chữ số); lô còn sửa được → điền cặp 1.63/2.53 vào tờ khai. */
export const sendHys = (dossierId: string, hysId: string, input: SendHysInput) =>
  mutate((db) => {
    dossierOf(db, dossierId);
    const h = editable(db, dossierId, hysId);
    const decl = db.declarations.find((d) => d.dossierId === dossierId);
    if (!decl) throw new ApiError("NO_DECLARATION", "Chưa dựng tờ khai – không gửi được HYS");
    if (!input.certificateId) throw reasonApiError("NO_CERT", "CERTIFICATE_REQUIRED");
    const issues = toView(h).issues;
    if (issues.length) {
      const text = issues.map((i) => [i.code, i.file ?? i.field ?? i.bytes].filter((x) => x !== undefined).join(" ")).join(", ");
      throw reasonApiError("VALIDATION", "HYS_INVALID", { issues: text });
    }
    const lotEditable = lotEditableOf(db, dossierId);
    h.attempt += 1;
    h.purpose = lotEditable ? "PRE_DECLARATION" : "SUPPLEMENT";
    h.status = "ACCEPTED";
    h.reject = null;
    h.receiptNo = String(Math.floor(Math.random() * 1e12)).padStart(12, "0");
    h.registeredOn = nowIso().slice(0, 10);
    h.sentAt = nowIso();
    if (!lotEditable) {
      h.fill = { outcome: "LOCKED" };
    } else {
      const cur = hysValues(db, dossierId)!;
      const res = fillAttachmentSlot(cur.values as AttachmentValues, h.procedureCode ?? "", h.receiptNo);
      const afterApproval = decl.status === "APPROVED";
      if (res.outcome === "FILLED" && res.set) {
        const note = `HYS ${h.seq} – ${h.receiptNo}`;
        for (const [code, value] of Object.entries(res.set)) {
          const meta = extraFieldMeta(decl.kind, code);
          const i = decl.fields.findIndex((f) => f.code === code);
          if (i >= 0) decl.fields[i] = { ...decl.fields[i]!, value, source: "SYSTEM", note };
          else if (meta) decl.fields.push({ code, label: meta.label, section: meta.section, ...(meta.no ? { no: meta.no } : {}), value, source: "SYSTEM", note });
        }
      }
      h.fill = { outcome: res.outcome, ...(res.slot ? { slot: res.slot } : {}), ...(res.outcome === "FILLED" ? { afterApproval } : {}) };
    }
    return toView(h);
  });
