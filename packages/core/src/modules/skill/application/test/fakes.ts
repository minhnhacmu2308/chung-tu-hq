import type { ClassifyResult, SkillField } from "@kb/contracts";
import type { ZodType } from "zod";
import type { ObjectStorage } from "../../../dossier/index.js";
import type { AiFile, AiProvider, ExtractPrompt, UsageRecorder } from "../../../extraction/index.js";
import type { SampleFileInspector, SkillRow, SkillVersionRow, UserNames } from "../ports.js";

export class MemoryStorage implements ObjectStorage {
  readonly files = new Map<string, Buffer>();
  async put(key: string, body: Buffer) {
    this.files.set(key, body);
  }
  async get(key: string) {
    const b = this.files.get(key);
    if (!b) throw new Error(`không có ${key}`);
    return b;
  }
  async presignGet(key: string) {
    return `memory://${key}`;
  }
  async delete(key: string) {
    this.files.delete(key);
  }
}

/** AI giả: kết quả đọc cấu hình theo tên file; ghi lại prompt để kiểm tra gợi ý skill. */
export class ScriptedAi implements AiProvider {
  readonly name = "fake";
  readonly prompts: ExtractPrompt[] = [];
  constructor(private byFile: Record<string, unknown> = {}) {}
  async classifyPages(): Promise<{ result: ClassifyResult; usage: { model: string; inputTokens: number; outputTokens: number } }> {
    return { result: { documents: [] }, usage: { model: "fake", inputTokens: 0, outputTokens: 0 } };
  }
  async extract(file: AiFile, _pages: number[], _schema: ZodType, prompt: ExtractPrompt) {
    this.prompts.push(prompt);
    return { result: this.byFile[file.fileName] ?? {}, regions: null, usage: { model: "fake", inputTokens: 10, outputTokens: 5 } };
  }
}

export class RecordingUsage implements UsageRecorder {
  readonly events: unknown[] = [];
  async record(e: unknown) {
    this.events.push(e);
    return `use_${this.events.length}`;
  }
}

export const fakeUsers: UserNames = { names: async (_org, ids) => new Map(ids.map((id) => [id, `Tên ${id}`])) };
export const fakePdf: SampleFileInspector = { inspect: async (bytes, mime) => ({ pages: mime.startsWith("image/") ? 1 : Number(/-(\d+)$/.exec(bytes.toString("utf8"))?.[1] ?? 1), encrypted: false }) };

const f = (key: string, label: string, type: SkillField["type"], required: boolean, aliases: string[] = [], extract = true): SkillField => ({ key, label, type, required, aliases, extract, display: extract });

export const SYSTEM_ORG = "org_system";
/** Ba skill mẫu đủ cho test: DOCUMENT, SUPPLIER (HANSOL), MAPPING. */
export function templateRows(now: Date): { skills: SkillRow[]; versions: SkillVersionRow[] } {
  const base = { orgId: SYSTEM_ORG, language: "EN", enabled: true, isTemplate: true, templateId: null, currentVersion: 1, labeledSamples: 0, accuracy: null, createdAt: now, updatedAt: now };
  const skills: SkillRow[] = [
    { ...base, id: "sk_tpl_inv", code: "SK-INV-GEN", name: "Commercial Invoice – chung", kind: "DOCUMENT", docKind: "INVOICE", supplier: null },
    { ...base, id: "sk_tpl_hansol", code: "SK-INV-HANSOL", name: "Invoice – HANSOL", kind: "SUPPLIER", docKind: "INVOICE", supplier: "HANSOL PRECISION CO., LTD." },
    { ...base, id: "sk_tpl_map", code: "SK-MAP-IDA", name: "Ánh xạ IDA", kind: "MAPPING", docKind: null, supplier: null },
  ];
  const versions: SkillVersionRow[] = [
    { id: "skv_tpl_inv", orgId: SYSTEM_ORG, skillId: "sk_tpl_inv", version: 1, promptNotes: null, createdBy: null, createdAt: now, fields: [f("invoice_no", "Số hóa đơn", "code", true, ["Invoice No."]), f("total_amount", "Tổng trị giá", "decimal", true, ["Total"]), f("po_no", "Số PO", "code", false, ["PO"])] },
    { id: "skv_tpl_hansol", orgId: SYSTEM_ORG, skillId: "sk_tpl_hansol", version: 1, promptNotes: null, createdBy: null, createdAt: now, fields: [f("invoice_no", "Số hóa đơn", "code", true, ["INVOICE NO"]), f("model_no", "Mã model", "code", true, ["MODEL"])] },
    { id: "skv_tpl_map", orgId: SYSTEM_ORG, skillId: "sk_tpl_map", version: 1, promptNotes: null, createdBy: null, createdAt: now, fields: [f("NNK", "Người nhập khẩu", "party", true)] },
  ];
  return { skills, versions };
}
