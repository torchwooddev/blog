# syntax=docker/dockerfile:1
# =============================================================================
# Torchwood Blog — 生产镜像（Nitro node-server）
# 构建：VITE_* 是构建期变量（import.meta.env 烘进客户端 bundle），必须以
#       --build-arg 传入；BLOG_* 是运行时变量（process.env），部署时注入。
# =============================================================================

# --- 构建阶段：npm ci + vite build → .output ---
# Node 24（LTS）：本仓库 lockfile 由 npm 11 生成，npm 10（Node 22 自带）会误报不同步。
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_TORCHWOOD_ENDPOINT
ARG VITE_TORCHWOOD_PROJECT_ID=blog
ARG VITE_SITE_NAME="Torchwood Blog"
ARG VITE_SITE_URL
ENV VITE_TORCHWOOD_ENDPOINT=$VITE_TORCHWOOD_ENDPOINT \
    VITE_TORCHWOOD_PROJECT_ID=$VITE_TORCHWOOD_PROJECT_ID \
    VITE_SITE_NAME=$VITE_SITE_NAME \
    VITE_SITE_URL=$VITE_SITE_URL

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
