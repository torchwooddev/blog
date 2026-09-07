# syntax=docker/dockerfile:1
# =============================================================================
# Torchwood Blog — 生产镜像（Nitro node-server）
# 镜像是通用的：所有配置都在运行时通过环境变量注入（无需按环境重新构建）——
#   BLOG_*                 服务端（env.server.ts 直接读 process.env）
#   VITE_* / BLOG_* 同名值 公开配置（GET /config.js 注入 window.__APP_CONFIG__，
#                          endpoint/project 未设 VITE_ 时回退读 BLOG_*）
# =============================================================================

# --- 构建阶段：npm ci + vite build → .output ---
# Node 24（LTS）：本仓库 lockfile 由 npm 11 生成，npm 10（Node 22 自带）会误报不同步。
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run generate-routes && npm run build

# --- 运行阶段：只带 .output 产物，非 root 运行 ---
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.output ./.output
USER app

EXPOSE 3000
# 只证明进程与 HTTP 服务存活：/api/health 会探活 Torchwood，
# 上游短暂不可达时返回 503，不应据此判容器死亡（任何 HTTP 应答即算健康）。
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(()=>process.exit(0)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
