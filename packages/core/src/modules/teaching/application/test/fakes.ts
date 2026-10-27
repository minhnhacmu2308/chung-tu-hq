// Bản sao gọn fake của module skill (test module khác không được import nội bộ skill – depcruise).
import type { ClassifyResult } from "@kb/contracts";
import type { ZodType } from "zod";
import type { ObjectStorage } from "../../../dossier/index.js";
import type { AiFile, AiProvider, ExtractPrompt, UsageRecorder } from "../../../extraction/index.js";


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
  async exists(key: string) {
    return this.files.has(key);
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
  readonly events: { dedupeKey?: string; [k: string]: unknown }[] = [];
  /** Như DrizzleUsageRecorder: cùng dedupeKey chỉ ghi một lần. */
  async record(e: { dedupeKey?: string; [k: string]: unknown }) {
    if (e.dedupeKey) {
      const i = this.events.findIndex((x) => x.dedupeKey === e.dedupeKey);
      if (i >= 0) return `use_${i + 1}`;
    }
    this.events.push(e);
    return `use_${this.events.length}`;
  }
}

