# syntax=docker/dockerfile:1.7
# Một image cho cả web, worker và migrate (khác lệnh chạy) – xem docs/DEPLOY.md.
# Build: docker build --build-arg NEXT_PUBLIC_DATA_SOURCE=http -t khaibao .

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate
WORKDIR /app

# Cài thư viện trước khi chép mã nguồn để cache lớp này khi chỉ đổi code.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY apps/fpt-mock/package.json apps/fpt-mock/
COPY packages/core/package.json packages/core/
COPY packages/contracts/package.json packages/contracts/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# NEXT_PUBLIC_* được nhúng vào JS lúc build: production phải là http (bản demo Vercel mới dùng mock).
ARG NEXT_PUBLIC_DATA_SOURCE=http
ENV NEXT_PUBLIC_DATA_SOURCE=$NEXT_PUBLIC_DATA_SOURCE NODE_ENV=production
RUN pnpm --filter @kb/web build && rm -rf apps/web/.next/cache

# Giữ cả devDependencies: worker và migrate chạy TypeScript trực tiếp bằng tsx (như khi dev).
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
RUN mkdir -p apps/web/.next/cache && chown -R node:node apps/web/.next
USER node
WORKDIR /app/apps/web
EXPOSE 3100
CMD ["node_modules/.bin/next", "start", "--port", "3100", "--hostname", "0.0.0.0"]
