// PUBLIC API của module skill. Hạ tầng qua "@kb/core/modules/skill/infrastructure" (chỉ container.ts).
export type { EvaluationRow, PerFieldAccuracy, SampleFileInspector, SampleRow, SkillDeps, SkillRepos, SkillRow, SkillUow, SkillVersionRow, UserNames } from "./application/ports.js";
export { listSkills, getSkill, setSkillEnabled } from "./application/query-skills.js";
export { addSkillField, removeSkillField, updateSkillField } from "./application/edit-fields.js";
export { cloneTemplatesForOrg } from "./application/clone-templates.js";
export { createSkill } from "./application/create-skill.js";
export { confirmPendingSamples, getSampleLabel, labelSample, listSamples, readSample, uploadSamples } from "./application/samples.js";
export { evaluateSkill, getEvaluation, runEvaluation } from "./application/evaluate.js";
export { createSkillResolver } from "./application/resolve-skill.js";
export { compareFields, scoreSample, summarize } from "./domain/accuracy.js";
export { fieldHints, projectResult } from "./domain/schema-keys.js";
