import path from "node:path";
import type { Env } from "../../../config/env.js";
import type { Db } from "../../../db/client.js";
import { systemClock, type Clock } from "../../../shared/clock.js";
import { ulidIdGen } from "../../../shared/ids.js";
import type { DossierDeps } from "../../dossier/index.js";
import type { AiProvider, ExtractionDeps, SkillResolver, UsageRecorder, ValidationPort } from "../application/ports.js";
import { ClaudeAiProvider } from "./claude-ai-provider.js";
import { createDocumentsAdapter, type OrgInfoReader } from "./documents-adapter.js";
import { DrizzleExtractionUow } from "./drizzle-uow.js";
import { FakeAiProvider } from "./fake-ai-provider.js";
import { RecordingAiProvider } from "./recording-ai-provider.js";

export { ClaudeAiProvider, createDocumentsAdapter, DrizzleExtractionUow, FakeAiProvider, RecordingAiProvider };
export { FAKE_BY_KIND } from "./fake-ai-provider.js";
export { ClaudeEmailDrafter, type EmailDraftInput } from "./claude-email-drafter.js";

export function createAiProvider(env: Env, fixturesDir = path.resolve(process.cwd(), "evals/fixtures")): AiProvider {
  if (env.AI_PROVIDER === "claude" && env.ANTHROPIC_API_KEY) return new ClaudeAiProvider(env.ANTHROPIC_API_KEY, env.AI_MODEL, { timeout: env.AI_TIMEOUT_MS, maxRetries: 1 });
  return new FakeAiProvider(fixturesDir);
}

/** Skill chưa có (GĐ 3): không gợi ý trường. */
export const noSkillResolver: SkillResolver = { resolve: async () => ({ skillVersionId: null, fieldHints: [], examples: [], customFields: [] }) };

export function createExtractionInfrastructure(opts: {
  db: Db; env: Env; dossier: DossierDeps; orgInfo: OrgInfoReader; validation: ValidationPort; usage: UsageRecorder; skills?: SkillResolver; ai?: AiProvider; clock?: Clock;
}): ExtractionDeps {
  return {
    uow: new DrizzleExtractionUow(opts.db),
    documents: createDocumentsAdapter(opts.dossier, opts.orgInfo),
    validation: opts.validation,
    ai: opts.ai ?? createAiProvider(opts.env),
    usage: opts.usage,
    skills: opts.skills ?? noSkillResolver,
    clock: opts.clock ?? systemClock,
    idGen: ulidIdGen,
  };
}
