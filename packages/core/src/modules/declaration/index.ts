// PUBLIC API của module declaration. Hạ tầng qua "@kb/core/modules/declaration/infrastructure" (chỉ container.ts).
export type { AgentLog, AgentRunRow, ProductRow, AgentTask, AuditWriter, DeclarationDeps, DeclarationRepos, DeclarationRow, DeclarationUow, DossierInfo, DossierPort, HsCatalogRow, HsClassificationService, HsSuggestionRow, LineItemRow, OrgInfo, OrgReader, ShipmentReader, StoredField, UserNames, ValidationReader } from "./application/ports.js";
export { failAgentRun, failStaleAgentRuns, getAgentRun, runAgent, STALE_AGENT_RUN_MS, startAgentRun, type RunAgentInput } from "./application/agent-run.js";
export { confirmHs, listHsCatalog, listLineItems, unconfirmHs } from "./application/line-items.js";
export { approveDeclaration, getDeclarationView, moveToReview, updateDeclarationField } from "./application/declaration.js";
export { fillAttachmentFromHys, type FillAttachmentInput, type FillAttachmentResult } from "./application/fill-attachment.js";
export { buildDeclaration, mappingsFor } from "./domain/build.js";
export { allocateCustomsValue, type Adjustment } from "./domain/valuation.js";
export { computeTaxes } from "./domain/tax.js";
export { canApprove, canMoveToReview, canSubmit } from "./domain/guards.js";
export { ratesFor } from "./domain/rates.js";
export { PORT_ALIASES, resolvePort } from "./domain/catalog-resolve.js";
export { getDeclarationSnapshot, listDeclarationsForCustoms, markDeclarationDraft, markDeclarationSubmitted, refreshFromShipment, type DeclarationSnapshot } from "./application/customs-bridge.js";
export { getDeclarationProfile, listRuleOptions, saveDeclarationProfile } from "./application/declaration-profile.js";
export { getValueCharges, saveValueCharges } from "./application/value-charges.js";
export { HsApiError } from "./application/ports.js";
export { answerHsQuestion, failHsWork, pollHsJob, reclassifyHs, runHsReclassify, sendHsAnswer, startHsClassification } from "./application/hs-classification.js";
export { createProduct, deleteProducts, importProducts, listProducts, updateProduct } from "./application/product-catalog.js";
