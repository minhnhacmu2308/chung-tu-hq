// Pipeline đọc một chứng từ (chạy trong worker): phân loại → trích xuất (idempotent) → gộp hồ sơ → luật → trạng thái.
import { createHash } from "node:crypto";
import { EXTRACTION_SCHEMA_VERSION, extractionSchemaFor, fillMissingNullable, withCustomFields, type DocKind } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { remergeDossier } from "./_remerge.js";
import { AiDataError, PIPELINE_VERSION, PROMPT_VERSION, type ExtractionDeps } from "./ports.js";

export type ProcessDocumentInput = { orgId: string; dossierId: string; documentId: string; mode: "FULL" | "MERGE_ONLY" };

export async function processDocument(deps: ExtractionDeps, input: ProcessDocumentInput): Promise<Result<void>> {
  const { orgId, dossierId, documentId } = input;
  if (input.mode === "MERGE_ONLY") {
    await remergeDossier(deps, orgId, dossierId);
    return ok(undefined);
  }
  const doc = await deps.documents.get(orgId, documentId);
  if (!doc) return err(domainError("NOT_FOUND", "Không tìm thấy chứng từ"));
  await deps.documents.setStatus(orgId, doc.id, "READING");
  await deps.documents.publish(orgId, dossierId, { type: "document.status", documentId: doc.id, status: "READING" });

  // Bước AI đang chạy – để khi model trả lỗi dữ liệu kèm usage vẫn ghi đúng loại (bất biến 8).
  let aiStage: "AI_CLASSIFY" | "AI_EXTRACT" = "AI_CLASSIFY";
  try {
    // Trần chi phí AI/ngày của doanh nghiệp: vượt → không gọi AI, chứng từ báo lỗi rõ để Quản trị nới trần hoặc đợi ngày mai (lỗi dữ liệu, không retry).
    const budget = await deps.aiBudget?.check(orgId);
    if (budget && !budget.allowed) throw new AiDataError(`Đã dùng hết trần chi phí AI trong ngày (${budget.spentVnd}/${budget.capVnd} VND) – chứng từ sẽ được đọc lại khi được nới trần hoặc sang ngày mới`);
    const bytes = await deps.documents.readFile(doc.storageKey);
    const file = { bytes, mime: doc.mime, pages: doc.pages, fileName: doc.fileName };
    let kind: DocKind = doc.kind;
    let supplierHint: string | null = null;

    // Chỉ phân loại khi loại còn đoán theo tên file; retry sau khi AI đã phân loại không gọi lại (tiết kiệm).
    if (doc.kindSource === "FILENAME") {
      aiStage = "AI_CLASSIFY";
      const c = await deps.ai.classifyPages(file);
      // Khóa theo (chứng từ, nội dung): retry sau khi đã phân loại nhưng chưa kịp lưu kindSource không tính tiền hai lần.
      await deps.usage.record({ orgId, dossierId, documentId: doc.id, kind: "AI_CLASSIFY", provider: deps.ai.name, model: c.usage.model, inputTokens: c.usage.inputTokens, outputTokens: c.usage.outputTokens, dedupeKey: `ai:classify:${doc.id}:${doc.sha256}` });
      const main = c.result.documents.find((d) => !d.isDuplicateCopy) ?? c.result.documents[0];
      if (main) {
        kind = main.kind;
        supplierHint = main.supplierHint;
        if (kind !== doc.kind) await deps.documents.setStatus(orgId, doc.id, "READING", { kind, kindSource: "AI" });
        else if (doc.kindSource === "FILENAME") await deps.documents.setStatus(orgId, doc.id, "READING", { kindSource: "AI" });
      }
    }

    const skill = await deps.skills.resolve(orgId, kind, supplierHint);
    const key = createHash("sha256").update([doc.id, doc.sha256, kind, PROMPT_VERSION, String(EXTRACTION_SCHEMA_VERSION), PIPELINE_VERSION, skill.skillVersionId ?? ""].join("|")).digest("hex");
    const ctx = { orgId: asOrgId(orgId), userId: asUserId("") };
    const existing = await deps.uow.asOrg(ctx, (r) => r.extractions.findByKey(key));
    if (!existing) {
      // Trường bổ sung riêng của doanh nghiệp (skill) được thêm vào schema để AI đọc thật.
      const schema = withCustomFields(extractionSchemaFor(kind), skill.customFields);
      const pages = Array.from({ length: Math.max(1, doc.pages) }, (_, i) => i + 1);
      aiStage = "AI_EXTRACT";
      const res = await deps.ai.extract(file, pages, schema, { kind, skillHints: skill.fieldHints, examples: skill.examples, supplierHint });
      // Token đã tốn dù model trả sai cấu trúc → ghi usage trước khi parse (bất biến 8).
      // Khóa = khóa idempotency của extraction: retry giữa lúc AI trả lời và lúc lưu extraction không tính tiền hai lần.
      const usageEventId = await deps.usage.record({ orgId, dossierId, documentId: doc.id, kind: "AI_EXTRACT", provider: deps.ai.name, model: res.usage.model, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, dedupeKey: `ai:extract:${key}` });
      // Kết quả/fixture theo schema cũ thiếu trường mới (nullable) → coi như null.
      const parsed = schema.safeParse(fillMissingNullable(schema, res.result));
      if (!parsed.success) throw new AiDataError(`Model trả dữ liệu không đúng cấu trúc (${parsed.error.issues[0]?.path.join(".") ?? "?"})`);
      // Hai job cùng chứng từ chạy song song: insert thứ hai trùng khóa → bỏ qua (kết quả như nhau).
      await deps.uow.asOrg(ctx, (r) =>
        r.extractions.insert({
          id: deps.idGen.next("job"), orgId, documentId: doc.id, kind, skillVersionId: skill.skillVersionId, promptVersion: PROMPT_VERSION, schemaVersion: String(EXTRACTION_SCHEMA_VERSION),
          pipelineVersion: PIPELINE_VERSION, model: res.usage.model, idempotencyKey: key, raw: parsed.data, regions: res.regions, status: "DONE", error: null, usageEventId, createdAt: deps.clock.now(),
        }),
      ).catch((e: unknown) => {
        if (!/duplicate key|unique/i.test(e instanceof Error ? e.message : String(e))) throw e;
      });
    }
    await deps.documents.setStatus(orgId, doc.id, "DONE", { error: null });
    await deps.documents.publish(orgId, dossierId, { type: "document.status", documentId: doc.id, status: "DONE" });
    await remergeDossier(deps, orgId, dossierId);
    return ok(undefined);
  } catch (e) {
    // Lỗi vĩnh viễn: dữ liệu hỏng, file không hợp lệ, HTTP 4xx (trừ 429) từ nhà cung cấp AI, file không còn trong storage.
    const status = typeof e === "object" && e !== null && "status" in e ? Number((e as { status: unknown }).status) : NaN;
    const name = e instanceof Error ? e.name : "";
    const dataError = e instanceof AiDataError || (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "FILE_INVALID") || (status >= 400 && status < 500 && status !== 429) || name === "NoSuchKey";
    if (dataError) {
      // Model đã tiêu token nhưng trả kết quả không dùng được → vẫn ghi usage (bất biến 8).
      if (e instanceof AiDataError && e.usage) await deps.usage.record({ orgId, dossierId, documentId: doc.id, kind: aiStage, provider: deps.ai.name, model: e.usage.model, inputTokens: e.usage.inputTokens, outputTokens: e.usage.outputTokens });
      const message = (e as Error).message || "Không đọc được chứng từ";
      await deps.documents.setStatus(orgId, doc.id, "ERROR", { error: message });
      await deps.documents.publish(orgId, dossierId, { type: "document.status", documentId: doc.id, status: "ERROR", error: message });
      await remergeDossier(deps, orgId, dossierId);
      return ok(undefined);
    }
    // Lỗi tạm (429/5xx/timeout): trả về QUEUED để BullMQ retry.
    await deps.documents.setStatus(orgId, doc.id, "QUEUED");
    throw e;
  }
}
