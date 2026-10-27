// Dạy khai báo: tờ khai đã thông quan → so với tờ khai nháp → bài học theo doanh nghiệp → áp vào tờ khai nháp các lô sau.
export type { StoredLesson, TeachDeps, TeachFileInspector, TeachLotPort, TeachRepos, TeachSampleRow, TeachUow } from "./application/ports.js";
export { deleteTeachSample, getTeachComparison, partNoInDescription, processTeachSample, retryTeachSample, uploadTeachSamples } from "./application/samples.js";
export { approveLessons, exportTeachRules, getTeachOverview, lessonsForDossier, setTeachEnabled, updateLesson } from "./application/lessons.js";
export { COMPARED_FIELDS, compareFields, compareLines, findInDocuments, pairLines, sameValue, score, type CompareType, type DocData, type DraftField, type DraftLine } from "./domain/compare.js";
export { applyObservation, isAutoFill, lessonContext, lessonIdentity, lessonsForDraft, observe, type LessonRow, type Observation } from "./domain/lessons.js";
export { rulesMarkdown } from "./domain/markdown.js";
export { corpusMarkdown, lineStats, sourceStats, type CorpusLot, type SourceStat } from "./domain/corpus.js";
