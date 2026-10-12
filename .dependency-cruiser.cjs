/**
 * Ranh giới kiến trúc – chạy bằng `pnpm lint` (depcruise) và trong CI.
 * Xem docs/ARCHITECTURE.md §2.
 */
const MOD = "^packages/core/src/modules/([^/]+)/";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "domain-is-pure",
      comment: "domain/ chỉ được import domain cùng module và @kb/contracts. Không DB, HTTP, SDK AI.",
      severity: "error",
      from: { path: `${MOD}domain/` },
      to: {
        pathNot: ["^packages/core/src/modules/$1/domain/", "^packages/contracts/", "^packages/core/src/shared/domain/"],
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "application-not-infrastructure",
      comment: "application/ dùng port (interface), không import infrastructure.",
      severity: "error",
      from: { path: `${MOD}application/` },
      to: { path: `${MOD.replace("([^/]+)", "[^/]+")}infrastructure/` },
    },
    {
      name: "modules-via-public-index",
      comment: "Module khác chỉ được import qua modules/<m>/index.ts.",
      severity: "error",
      from: { path: MOD },
      to: {
        path: "^packages/core/src/modules/([^/]+)/.+",
        pathNot: ["^packages/core/src/modules/$1/", "^packages/core/src/modules/[^/]+/index\\.ts$"],
      },
    },
    {
      name: "apps-via-public-index",
      comment: "apps/* chỉ import modules/<m>/index.ts; riêng composition root container.ts được nối infrastructure.",
      severity: "error",
      from: { path: "^apps/", pathNot: "^apps/[^/]+/src/container\\.ts$" },
      to: { path: "^packages/core/src/modules/[^/]+/.+", pathNot: "^packages/core/src/modules/[^/]+/index\\.ts$" },
    },
    {
      name: "ai-sdk-only-in-extraction-infra",
      comment: "ADR 0002: SDK AI chỉ được dùng trong extraction/infrastructure (và declaration/infrastructure cho gợi ý HS).",
      severity: "error",
      from: {
        pathNot: [
          "^packages/core/src/modules/extraction/infrastructure/",
          "^packages/core/src/modules/declaration/infrastructure/",
        ],
      },
      to: { path: "node_modules/(@anthropic-ai/sdk|openai|@google/genai)/" },
    },
    {
      name: "web-no-db-driver",
      comment: "apps/web không truy vấn DB trực tiếp.",
      severity: "error",
      from: { path: "^apps/web/", pathNot: "^apps/web/src/container\\.ts$" },
      to: { path: "node_modules/(drizzle-orm|postgres|pg)/" },
    },
    {
      name: "apps-ui-via-public-api",
      comment: "Design system: app chỉ dùng @kb/ui (index), @kb/ui/theme, @kb/ui/styles.css – không import ruột component hay Radix trực tiếp.",
      severity: "error",
      from: { path: "^apps/" },
      to: {
        path: ["^packages/ui/src/", "node_modules/@radix-ui/"],
        pathNot: ["^packages/ui/src/index\\.ts$", "^packages/ui/src/theme/index\\.ts$", "^packages/ui/src/styles/"],
      },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "require", "node", "default"] },
  },
};
