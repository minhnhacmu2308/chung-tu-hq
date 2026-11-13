// Cổng danh mục cho chứng từ (tờ khai, bài học): CatalogPort + use case kiểm quyền theo người dùng (gắn mã, tạo mặt hàng, đề xuất từ bài học).
// Container nối vào DeclarationDeps.catalog / TeachDeps.catalog (kiểu cấu trúc – module catalog không import module declaration/teaching).
import type { CreateItemInput } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { ok, type Result } from "../../../shared/result.js";
import { proposeAlias, proposeLessonAlias, type LessonAliasInput, type LessonAliasResult, type ProposeAliasCommand } from "./aliases.js";
import { createCatalogPort, type CatalogPort } from "./catalog-port.js";
import { createItem } from "./items.js";
import type { CatalogDeps } from "./ports.js";

export type CatalogLinks = CatalogPort & {
  proposeAlias(ctx: Ctx, cmd: ProposeAliasCommand): Promise<Result<{ id: string; itemId: string; status: string }>>;
  createItem(ctx: Ctx, input: Pick<CreateItemInput, "kind" | "name"> & Partial<Pick<CreateItemInput, "hsCode" | "baseUnit" | "codeSetId" | "code" | "conversions">>): Promise<Result<{ status: "CREATED"; itemId: string; aliasId: string | null } | { status: "QUEUED"; queueId: string }>>;
  proposeFromLesson(ctx: Ctx, input: LessonAliasInput): Promise<Result<LessonAliasResult>>;
};

export function createCatalogLinks(deps: CatalogDeps): CatalogLinks {
  return {
    ...createCatalogPort(deps),
    proposeAlias: async (ctx, cmd) => {
      const r = await proposeAlias(deps, ctx, cmd);
      return r.ok ? ok({ id: r.value.id, itemId: r.value.itemId, status: r.value.status }) : r;
    },
    createItem: async (ctx, input) => {
      const r = await createItem(deps, ctx, input);
      if (!r.ok) return r;
      if (r.value.status === "QUEUED") return ok({ status: "QUEUED" as const, queueId: r.value.queueId });
      const d = r.value.item;
      const alias = input.codeSetId ? d.aliases.find((a) => a.codeSetId === input.codeSetId && a.status === "ACTIVE") : undefined;
      return ok({ status: "CREATED" as const, itemId: d.item.id, aliasId: alias?.id ?? null });
    },
    proposeFromLesson: (ctx, input) => proposeLessonAlias(deps, ctx, input),
  };
}
