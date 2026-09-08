# 部署（Cloudflare Workers）

除 Dokploy/Docker 外，本项目可直接部署到 Cloudflare Workers——无需改任何应用代码。
构建链：`NITRO_PRESET=cloudflare-module` 让 Nitro 产出 Workers ES Module + 静态资源
（Workers Static Assets），并自动生成部署配置。

## 为什么可以直接部署

- **数据面全部出网**：数据库/附件都走 Torchwood HTTP SDK（`globalThis.fetch`），
  无 TCP 驱动、无文件系统依赖，天然适配 Workers。
- **供给幂等且惰性**：DDL/种子由首个服务端请求触发（`ensureBlogReady`），
  create-失败-回读-验证的设计天然兼容 Workers 多 isolate 并发。
- **Node 兼容由预设兜底**：`@tanstack/start-storage-context` 依赖
  `node:async_hooks` 的 `AsyncLocalStorage`；Nitro 的 cloudflare-module 预设默认
  开启 `nodeCompat`，自动在生成的 wrangler 配置里写入 `nodejs_compat` 标志与
  当日 `compatibility_date`，并把 `node:async_hooks` 保留为原生 import
  （workerd 原生实现，而非 polyfill 假件）。

## 构建

```bash
npm run build:worker
```

- 实现：`scripts/build-worker.mjs`——设置 `NITRO_PRESET=cloudflare-module` 后调用
  vite CLI（必须走 CLI：nitro 插件的服务端构建挂在 `buildApp` 钩子上，JS API
  `build()` 不会触发）。只影响本次构建，`npm run dev` / `npm run build`（node-server
  预设）不受影响。
- 产物：
  - `.output/server/index.mjs` + `_chunks/_libs/_ssr` —— Worker 入口（`no_bundle`）；
  - `.output/public/` —— 客户端静态资源（由 ASSETS 绑定承接）；
  - `.output/server/wrangler.json` —— **生成的部署配置**：`main`、`assets`、
    `compatibility_date`、`compatibility_flags: ["nodejs_compat"]`、`no_bundle`、
    ESModule rules，并把根目录 `wrangler.jsonc` 的 `name`/`vars` 合并进来；
  - `.wrangler/deploy/config.json` —— wrangler 配置重定向：在仓库根目录直接
    `npx wrangler deploy` 就会使用上面生成的配置。

## 配置

**根目录 `wrangler.jsonc`**（进 git）：worker 名称 + 非敏感 vars
（`BLOG_TORCHWOOD_ENDPOINT`、`BLOG_TORCHWOOD_PROJECT_ID`、`BLOG_SEED`、
`VITE_SITE_*`）。注意不要在这里声明 `main`/`assets`/`compatibility_*`——
Nitro 按产物自动生成并覆盖（构建时会打警告）。

**密钥不进配置**，部署前注入：

```bash
npx wrangler secret put BLOG_TORCHWOOD_API_KEY
```

Workers（`nodejs_compat`）会把 vars/secrets 注入 `process.env`，`env.server.ts`
与 `/config.js` 的运行时读取逻辑不变。

## 部署

```bash
npm run build:worker
npx wrangler login        # 仅首次
npx wrangler deploy
```

- 预览域名默认 `torchwood-blog.<account>.workers.dev`；绑定自定义域名在
  Cloudflare 控制台该 Worker 的 **Settings → Domains & Routes** 添加。
- 日志排查：`npx wrangler tail`（已开启 `observability`，控制台也能看历史日志）。
- 本地以 Workers 运行时预览构建产物：`npx wrangler dev`
  （此时 `BLOG_TORCHWOOD_ENDPOINT=localhost:9080` 可以工作）。

## 部署前检查清单

1. **Torchwood 网关必须公网可达**，且 `BLOG_TORCHWOOD_ENDPOINT` 填公网地址
   （`http://localhost:9080` 只在本地 `wrangler dev` 下有效）。Server 面
   （供给/公开读取/上传）与浏览器直连的 Client 面都走这个地址。
2. **Client API 网关的 CORS 白名单加上站点域名**（与 Docker 部署同一要求）——
   登录、评论等终端用户写路径是浏览器直连网关的。
3. 首次部署、后端还是空库时：把 `wrangler.jsonc` 里 `BLOG_SEED` 临时改为
   `"true"` 部署一次，首个请求触发供给+灌种子，之后改回 `"false"`。
4. `VITE_SITE_URL` 填最终站点地址（RSS/sitemap/OG 绝对地址依赖它）。

## 已知边界

- Workers **免费版 CPU 限额 10 ms/请求**，对 React SSR + markdown 渲染偏紧；
  建议 Workers Paid（默认 30 s CPU 墙，实际单请求远用不到）。
- 产物体积 gzip 后约 0.5 MB，远低于脚本限额（免费版 3 MB）。
- 构建链依赖 nitro 3（beta，`3.0.260610-beta`）；升级 nitro/vite 后建议重跑一次
  `npm run build:worker && npx wrangler deploy --dry-run` 验证产物仍可打包。
- wrangler 需支持 Workers Static Assets 的版本（wrangler ≥ 3.60；直接用 latest）。
