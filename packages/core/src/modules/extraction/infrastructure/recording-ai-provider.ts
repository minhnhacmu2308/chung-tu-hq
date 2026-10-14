// Bọc một AiProvider thật và ghi fixture theo sha256 file (evals/fixtures/<sha>.classify.json, <sha>.extract.<KIND>.json)
// để FakeAiProvider phát lại offline (CI, pnpm eval không --live).
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ZodType } from "zod";
import type { AiFile, AiProvider, ExtractPrompt } from "../application/ports.js";

export class RecordingAiProvider implements AiProvider {
  readonly name: string;
  constructor(private inner: AiProvider, private fixturesDir: string) {
    this.name = inner.name;
    mkdirSync(fixturesDir, { recursive: true });
  }
  private write(bytes: Buffer, suffix: string, data: unknown) {
    const sha = createHash("sha256").update(bytes).digest("hex");
    writeFileSync(path.join(this.fixturesDir, `${sha}.${suffix}.json`), JSON.stringify(data, null, 2));
  }
  async classifyPages(file: AiFile) {
    const r = await this.inner.classifyPages(file);
    this.write(file.bytes, "classify", r.result);
    return r;
  }
  async extract(file: AiFile, pages: number[], schema: ZodType, prompt: ExtractPrompt) {
    const r = await this.inner.extract(file, pages, schema, prompt);
    this.write(file.bytes, `extract.${prompt.kind}`, r.result);
    return r;
  }
}
