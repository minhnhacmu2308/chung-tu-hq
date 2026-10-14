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
      comment: "domain/ chỉ được import domain cùng module, @kb/contracts, shared kernel thuần (Result, DomainError, ids, Decimal, Clock) và node:crypto (băm). Không DB, HTTP, SDK AI, queue.",
      severity: "error",
      from: { path: `${MOD}domain/` },
      to: {
        pathNot: [
          "^packages/core/src/modules/$1/domain/",
          "^packages/contracts/",
          "^packages/core/src/shared/(result|errors|ids|decimal|clock)\\.ts$",
          "^(node:)?crypto$",
        ],
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
      name: "apps-infra-only-in-container",
      comment: "Hạ tầng (DB, Redis, queue, config) chỉ được nối trong composition root apps/*/src/container.ts (worker: thêm src/index.ts để tạo Worker).",
      severity: "error",
      from: { path: "^apps/", pathNot: ["^apps/[^/]+/src/container\\.ts$", "^apps/worker/src/index\\.ts$"] },
      to: { path: ["^packages/core/src/(db|config)/", "node_modules/(drizzle-orm|postgres|pg|bullmq|ioredis)/"] },
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
      name: "module-infra-own-schema",
      comment: "modules/<m>/infrastructure chỉ được đọc bảng của chính mình: db/schema/<m>.ts (+ shared).",
      severity: "error",
      // Riêng module admin đọc xuyên module bằng role kb_platform (ADR 0006).
      from: { path: `${MOD}infrastructure/`, pathNot: "^packages/core/src/modules/admin/infrastructure/" },
      to: {
        path: "^packages/core/src/db/schema/([^/]+)\\.ts$",
        pathNot: ["^packages/core/src/db/schema/$1\\.ts$", "^packages/core/src/db/schema/shared\\.ts$", "^packages/core/src/db/schema/plans\\.ts$"],
      },
    },
    {
      name: "web-screens-not-mocks-db",
      comment: "Màn hình không import mocks/db, mocks/seed, mocks/api trực tiếp; chỉ qua src/api/*.",
      severity: "error",
      from: { path: "^apps/web/src/(features|app|components)/" },
      to: { path: "^apps/web/src/mocks/(db|seed|api)" },
    },
    {
      name: "web-admin-self-contained",
      comment: "Khu Quản trị hệ thống (features/admin) không dùng màn hình của ứng dụng khách – chỉ được mượn cấu hình giao diện. Giữ ranh giới này để sau tách thành app riêng được.",
      severity: "error",
      from: { path: "^apps/web/src/features/admin/" },
      to: { path: "^apps/web/src/features/", pathNot: "^apps/web/src/features/(admin|appearance)/" },
    },
    {
      name: "web-tenant-not-admin-screens",
      comment: "Màn hình của khách không import màn quản trị hệ thống (dữ liệu xuyên doanh nghiệp). Kiểm tra quyền quản trị thì gọi src/api/admin.",
      severity: "error",
      from: { path: "^apps/web/src/(features|components)/", pathNot: "^apps/web/src/features/admin/" },
      to: { path: "^apps/web/src/features/admin/" },
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
    // Thư mục build/kết quả test không phải mã nguồn.
    exclude: { path: ["\\.next(-build)?/", "/dist/", "visual-report/", "test-results/", "playwright-report/"] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "require", "node", "default"] },
  },
};
