// Cấu hình Skill AI. Chọn mock|http theo NEXT_PUBLIC_DATA_SOURCE.
import { pick } from "@/lib/data-source";
import * as mock from "@/mocks/api/skills";
import * as http from "./http/skills";

export const skillKeys = mock.skillKeys;
export const MIN_SAMPLES_FOR_ACCURACY = mock.MIN_SAMPLES_FOR_ACCURACY;
export type { EvaluationResult, LabeledSample, SkillFieldPatch } from "@kb/contracts";

export const listSkills = pick(mock.listSkills, http.listSkills);
export const getSkillById = pick(mock.getSkillById, http.getSkillById);
export const setSkillEnabled = pick(mock.setSkillEnabled, http.setSkillEnabled);
export const updateSkillField = pick(mock.updateSkillField, http.updateSkillField);
export const addSkillField = pick(mock.addSkillField, http.addSkillField);
export const removeSkillField = pick(mock.removeSkillField, http.removeSkillField);
export const listSamples = pick(mock.listSamples, http.listSamples);
export const uploadSamples = pick(mock.uploadSamples, http.uploadSamples);
export const confirmPendingSamples = pick(mock.confirmPendingSamples, http.confirmPendingSamples);
export const getEvaluation = pick(mock.getEvaluation, http.getEvaluation);
export const evaluateSkill = pick(mock.evaluateSkill, http.evaluateSkill);
