// PUBLIC API của module skill. Hạ tầng qua "@kb/core/modules/skill/infrastructure" (chỉ container.ts).
export type { EvaluationRow, OpenRead, PerFieldAccuracy, SampleFileInspector, SampleRow, SkillDeps, SkillReadsPort, SkillRepos, SkillRow, SkillUow, SkillVersionRow, SuggestionRow, UserNames } from "./application/ports.js";
export { listSkills, getSkill, setSkillEnabled } from "./application/query-skills.js";
export { addSkillField, removeSkillField, updateSkillField } from "./application/edit-fields.js";
export { cloneTemplatesForOrg } from "./application/clone-templates.js";
export { createSkill } from "./application/create-skill.js";
export { confirmPendingSamples, getSampleLabel, labelSample, listSamples, readSample, uploadSamples } from "./application/samples.js";
export { evaluateSkill, getEvaluation, runEvaluation } from "./application/evaluate.js";
export { createSkillResolver } from "./application/resolve-skill.js";
export { acceptSuggestion, dismissSuggestion, learnFromReview, listSuggestions, rereadStale, staleReads, suggestAlias, type FieldSource, type LearnDocument } from "./application/learning.js";
export { hasAlias, normalizeAlias, sameSupplier } from "./domain/learning.js";
export { compareFields, scoreSample, summarize } from "./domain/accuracy.js";
export { fieldHints, projectResult } from "./domain/schema-keys.js";
