# Torchwood Blog

一个**没有自建后端**的全栈博客 —— Torchwood（AI/Agent-Native BaaS）的参考实现。
读这个仓库，就能学会 Torchwood 的完整用法：动态文档库建模、终端用户认证、文档级权限、
实时订阅与 SSR 内容站。

技术栈：**TanStack Start**（TanStack Router + Vite + Nitro，Node 目标）· React 18 · TypeScript（strict，零 `any`）·
TanStack Query · shadcn/ui + Tailwind · `@torchwood/sdk` **0.2.0**（唯一后端 SDK）。

---

## 架构

```
                          ┌────────────────────────────┐
                          │         浏览器             │
                          │  (React 18 + TanStack)     │
                          └──────┬──────────────┬──────┘
              页面渲染/SSR 请求    │              │  注册/登录/发文/评论/realtime
                         ▼        │              ▼  （终端用户 Bearer JWT 直连）
        ┌──────────────────────────────┐   ┌─────────────────────────┐
        │  TanStack Start 服务端       │   │  Torchwood Client API   │
        │  (Nitro · Node)              │   │  /v1/account · /v1/databases │
        │  · server functions (公开读)  │   │  /v1/realtime (WebSocket)    │
        │  · /api/health /feed.xml     │   └────────────┬────────────┘
        │  · /sitemap.xml              │                │
        └──────────────┬───────────────┘                │
                       │  API Key + X-Torchwood-Project │
                       ▼                                ▼
             ┌─────────────────────────────────────────────────┐
             │              Torchwood Server API               │
             │   供给(DDL) · 公开内容读取 · 批操作 · 事件补偿   │
             └─────────────────────────────────────────────────┘
                       │                    ▲
                       ▼                    │ outbox → Redis Stream → WS 扇出
             ┌──────────────────────────────────────┐
             │  PostgreSQL (RLS/文档级 ACL) + Redis │
             └──────────────────────────────────────┘
```

**同一 SDK，两个鉴权面**（`@torchwood/sdk`）：

| 面 | 实例 | 鉴权 | 本项目用法 |
|---|---|---|---|
| Client 面（浏览器直连） | `Torchwood.create({ endpoint, projectId })` | 终端用户 Bearer JWT | 注册/登录、作者台全部写操作、评论、realtime（`src/lib/torchwood-client.ts`） |
| Server 面（仅服务端） | `Torchwood.withApiKey(endpoint, projectId, apiKey)` | `X-Api-Key` + `X-Torchwood-Project` | 启动供给（DDL）、SSR 公开读取、级联清理（`src/server/*.server.ts`） |

---

## 快速开始

前置条件：一个可用的 Torchwood 实例（HTTP 网关 + gRPC），以及一个带 `databases` 读写 scope 的
**Server API Key**（Console → API Keys 创建）。实时评论还要求 Torchwood 的 **worker 进程**
（outbox → Redis Stream 扇出）在运行：`task dev:worker`。

```bash
cp .env.example .env          # 填入 BLOG_TORCHWOOD_API_KEY 等
npm install
npm run dev                   # http://localhost:3000
```

首次请求会自动**幂等供给** `blog` 库（database / collections / attributes / indexes）；
`BLOG_SEED=true` 时灌入种子数据（3 分类 / 8 文章（含 2 篇私有草稿）/ 6 标签 / 6 评论）。

生产构建（Node）：

```bash
npm run build
BLOG_TORCHWOOD_API_KEY=... node .output/server/index.mjs   # 默认端口 3000，PORT 可改
```

质量门：

```bash
npm run check        # tsc --noEmit + 秘钥边界静态检查
npm run test         # vitest（错误映射 / markdown 消毒 / 版本归一化）
```

## 环境变量（`.env.example`）

| 变量 | 侧 | 说明 |
|---|---|---|
| `BLOG_TORCHWOOD_ENDPOINT` | 服务端 | Torchwood HTTP 网关，如 `http://localhost:9080` |
| `BLOG_TORCHWOOD_PROJECT_ID` | 服务端 | 项目 ID（`X-Torchwood-Project`） |
| `BLOG_TORCHWOOD_API_KEY` | **仅服务端** | Server API Key；`npm run check:server-only` 强制它只出现在 `src/server/*.server.ts` |
| `BLOG_SEED` | 服务端 | `true` 时首次供给后灌种子 |
| `VITE_TORCHWOOD_ENDPOINT` | 公开 | 浏览器直连 Client API 的端点；不设时回退读 `BLOG_TORCHWOOD_ENDPOINT` |
| `VITE_TORCHWOOD_PROJECT_ID` | 公开 | 浏览器侧项目 ID；不设时回退读 `BLOG_TORCHWOOD_PROJECT_ID` |
| `VITE_SITE_NAME` / `VITE_SITE_URL` | 公开 | 站点名 / 对外绝对地址（OG、RSS、sitemap） |
| `VITE_SITE_DESCRIPTION` | 公开 | 站点一句话简介（首页 hero、SEO description、OG） |
| `VITE_SITE_FOOTER_NOTE` | 公开 | 页脚版权附注（可选，如 ICP 备案号），留空不显示 |

`VITE_*` 是**运行时**变量：容器启动后由 `GET /config.js` 注入 `window.__APP_CONFIG__`，
浏览器端配置随之生效——换环境/项目只需改环境变量重启，**无需重新构建镜像**。
（`import.meta.env.VITE_*` 仅作为静态预览等场景的构建期兜底。）

## 部署（Dokploy · GitHub Actions + GHCR）

链路：push `main`（或打 `v*` tag）→ Actions 质量门（`npm run check` + `test`）→ buildx 多阶段构建
→ 推镜像到 `ghcr.io/torchwooddev/blog`（`latest` + `sha-<hash>`，tag 发布再加 semver）
→ 回调 Dokploy Deploy Webhook → Dokploy 拉新镜像重部署。

**镜像是通用的**：所有配置运行时注入——`BLOG_*` 服务端直接读，公开配置经 `GET /config.js`
注入 `window.__APP_CONFIG__`（`src/routes/config[.]js.ts`）。同一镜像可指向任何 Torchwood
实例/项目，换环境只需改环境变量并重启，无需重新构建。

涉及文件：`Dockerfile`（构建/运行两阶段，非 root，容器健康检查只判进程存活——`/api/health`
探的是 Torchwood 上游，上游 503 不应判容器死亡）、`.dockerignore`、
`.github/workflows/release.yml`、`docker-compose.dokploy.yml`。

### 一次性配置：GitHub 仓库

仅一个可选 Secret（Settings → Secrets and variables → Actions）：

| 类型 | 名称 | 说明 |
|---|---|---|
| Secret | `DOKPLOY_DEPLOY_WEBHOOK` | Dokploy 的 Deploy Webhook URL；**不设则跳过自动重部署**（镜像照常发布） |

无需任何 Variables——环境配置全部在 Dokploy 侧填。

### 一次性配置：Dokploy（Compose 类型）

1. Project → Create Resource → **Compose** → 选本仓库，compose 路径 `docker-compose.dokploy.yml`。
2. 该服务的 **Environment** 面板填：
   `BLOG_TORCHWOOD_ENDPOINT`（公网网关）、`BLOG_TORCHWOOD_PROJECT_ID`、
   `BLOG_TORCHWOOD_API_KEY`（必需，缺了部署会直接失败）、`BLOG_SEED`（生产保持 `false`）；
   另建议设置公开配置 `VITE_SITE_NAME` / `VITE_SITE_URL`（OG/RSS/sitemap 的绝对地址）。
   仅当网关对内与对公网地址不同时，才需要显式设置 `VITE_TORCHWOOD_ENDPOINT` /
   `VITE_TORCHWOOD_PROJECT_ID`——不设时自动回退读 `BLOG_*` 同名值。
3. **Domains** 面板：service `blog`、port `3000`、绑域名（Traefik 自动 HTTPS）。
4. **Advanced → Deploy Webhook** 复制 URL → 回填 GitHub Secret `DOKPLOY_DEPLOY_WEBHOOK`。

另外确认两件 Torchwood 侧的事：Client API 网关的 CORS 白名单里加上站点域名；
realtime 需要 worker 进程在跑。

### GHCR 包可见性

首次发布后 GitHub 侧生成 package `blog`，默认 **private**。二选一：

- 推荐：Package → Package settings → Change visibility → **Public**（镜像里没有密钥，
  密钥全部运行时注入），Dokploy 免凭据拉取；
- 或保持 private，在 Dokploy 宿主机 `docker login ghcr.io`（PAT 勾 `read:packages`）。

### 发布与回滚

- 发布：push 到 `main` → 自动出 `latest` + `sha-xxx` 两个 tag；打 `v*` tag 额外出 semver tag。
- 回滚：Dokploy 里把服务的 `image` tag 换成历史 `sha-xxx`（Actions 摘要里可查）后 Redeploy。

## 数据模型（`src/lib/blog-schema.ts`）

数据库 `blog`，建模规约见 Torchwood `docs/developer/16-document-modeling.md`：

| 集合 | 属性 | 索引 | 权限要点 |
|---|---|---|---|
| `categories` | `name`·`slug` (string, required) | `slug` unique | 集合级：`read:any` + `write:keys`（只有 API Key 能写） |
| `posts` | `title`·`slug`·`content`·`category_id` (required)，`tag_ids` (string **array=true**)，`attachment_ids` (string **array=true**)，`published_at` (datetime 可选) | `slug` unique；`category_id` key | **`document_security=true`**：草稿 = 空 ACE 种子（创建者私有）；发布 = 授 `read:any` + 写 `published_at`（一次原子 update） |
| `tags` | `name`·`slug` (required) | `slug` unique | 同 categories |
| `comments` | `post_id`·`content` (required)，`author_id`·`author_name` (可选) | `post_id` key | `read:any` + `create:users`/`create:keys` + `delete:keys`（级联清理用） |
| `settings` | 站点配置单例（`document_id='site'`）：`site_name`·`site_description`·`site_footer_note` (string)、`posts_per_page` (integer)、`comments_enabled` (boolean) | 无（按 id 点查单例） | 仅 `write:keys`——不开 `read:any`，读取一律经白名单 server fn；写入走管理员组判权的 `updateSiteSettings` |

1:N = 引用属性 + key 索引；M:N = 数组属性（GIN 自动，`containsAny`/`containsAll` 查询）；
slug → id 两段式解析（无跨集合 JOIN）。

## 这个 demo 演示了 Torchwood 的什么

- **动态文档库建模**：启动时幂等供给 database/collections/attributes/indexes
  （`src/server/provision.server.ts`，guarded singleton，"创建失败→回读验证存在"双保险）。
- **终端用户认证**：注册/登录走 Client 面，JWT 由 SDK transport 持有；本项目补了
  localStorage 持久化 + 过期前静默 `refresh`（`src/lib/torchwood-client.ts`）。
- **用户组（group/membership）**：管理员/作者/读者三组随启动供给按名幂等建立
  （`src/server/groups.server.ts`）。首个注册用户自动归入管理员组，其余注册/登录
  归入读者组（`syncMyGroup`，兼作分组缺失的自愈）；管理员在 `/admin/users` 调整
  他人用户组（先加新组再移旧组，末位管理员保护）、封禁/解封（blocked 后登录与
  既有会话立即失效，服务端拒自封与封末位管理员）、按昵称/邮箱搜索。列表排除
  已删除账号的匿名化残留（`deleted-*@deleted.invalid`）。组归属判定只在服务端做
  ——client 面 `groups.listGroups` 返回项目全部组、不按成员过滤，表达不了"我的组"。
  工作台按组守卫：读者组不可进入（`src/lib/user-groups.ts` 是共享的组定义）。
- **工作台（/admin/\*）**：独立控制台外壳——左侧菜单 + 右侧工作区（`admin.tsx`
  布局路由统一做会话/分组守卫，`admin-shell.tsx` 是外壳），公开博客页保持原
  页头/页脚不受影响。支持自助修改密码（Client 账号 API，服务端校验旧密码）。
- **文档级 ACL（`documentSecurity`）**：
  - 草稿创建即私有（空 ACE 种子绑 `user:<创建者>`），SSR/API Key/其他用户一律 404（防枚举）；
  - 发布 = 一次原子 `updateDocument`（写 `published_at` + 授 `read:any`，保留属主 ACE）；撤回是反操作；
  - "我的文章"用 **ACE 回读**判属主（`permissions` 里含 `user:<id>`）。
- **集合级权限**：categories/tags/comments 用纯集合级 ACL（`read:any` 公开读、`create:users` 登录写、`create:keys` 种子写）。
- **查询纪律（C7 单 AST）**：过滤只走 typed AST（`src/lib/queries.ts`）；数组成员只用
  `containsAny`/`containsAll`；排序键限本集合属性；分页只认 `pageToken`（keyset），无 offset。
- **keyset 分页**：`meta.next_page_token` 驱动翻页按钮；伪造/过期游标 302 回第一页。
- **实时订阅 + 断线补偿**：WS 订阅 `databases.blog.collections.comments`；事件按 `event_id`
  幂等去重、`seq` 作续传游标；断线重连后用 `listChanges(since_seq)` 补齐窗口
  （`EVENTS.RESUME_EXPIRED` 时全量刷新兜底）。realtime 网关只收终端用户 JWT（拒匿名与 API Key）。
- **写幂等**：作者台/评论的每次逻辑写都带 `Idempotency-Key`（HTTP 面的 request_id 等价物），
  通过注入 `TorchwoodConfig.fetch` 实现（SDK 0.2.0 未暴露 request_id 字段）。
- **OCC**：更新/删除强制 `version`；冲突（`DOCUMENT.VERSION_CONFLICT`）自动重读重试一次
  （`src/lib/errors.ts` 的 `withOccRetry`）。注意 wire 上 version 是 **int64 字符串**、域码可能
  以 `FailedPrecondition` + message 前缀到达——都已在应用层归一。
- **引用完整性与删除协议**：
  - 删文章：Server 面先 `bulkDelete` 级联清理评论，再删文章本体（带 OCC 版本）；
  - 删分类：**计数 → 拒绝（IN_USE）→（作者迁移自己的文章）→ 带版本删除**。
- **存储（Storage）附件**：
  - 供给时幂等创建公开桶 `blog-media`（按名查找，不存在则 `createBucket({public:true})`）；
  - 上传：浏览器 → 同源 `POST /api/upload`（multipart）→ 服务端先用 SDK `account.me()` 校验
    调用者 JWT，再用 Server 面 `storage.uploadFile` 上传。不走浏览器直传，因为网关 CORS
    按站点配置放行（开发域默认不在白名单）；同时保证"只有登录用户能借道上传"；
  - 显示：公开桶的 view/preview/download URL 是 `bucket+fileId` 的决定性函数（匿名需
    `?project=`），图片以内联 markdown 插入正文（`![name](viewUrl)`），其余文件在文章
    附件区列出（含名称/大小/下载链接），已内联的图片不重复展示；
  - `og:image` 取第一张图片附件；删文章时按删除协议级联 `deleteFile`。
- **错误处理纪律**：域码 → 用户文案集中映射（`src/lib/errors.ts`），按 code 判别、不匹配 message 文本
  （OCC 的网关等价形态是唯一例外，已注释说明）。
- **SEO 面**：文章页流式 SSR + OG/meta（`head()`）；`/feed.xml`（RSS 2.0）与 `/sitemap.xml`
  走 server routes；`/api/health` 探活 Torchwood。

## 冒烟清单（已在本仓库开发时对真实后端跑通）

自动化脚本（等价于浏览器发起的 Client 面调用 + Server 面行为）：

```bash
node scripts/smoke-e2e.mjs        # 13 项断言，全绿即通过
node scripts/smoke-provision.mjs  # 供给步骤逐项自检
```

人工冒烟路径（与 `smoke-e2e.mjs` 的 17 项断言一一对应）：

1. 注册两位用户 A/B（`/register`，浏览器直连 Client API）。
2. A 在 `/admin` 新建文章保存为草稿（version=1）。
3. 未登录/他人在首页、RSS、直链 slug 均看不到该草稿（404 防枚举）。
4. 同上，另一登录用户 B 也看不到。
5. 用过期 version 更新 → `DOCUMENT.VERSION_CONFLICT`（编辑器自动重读重试一次）。
6. A 点发布 → 首页/RSS/sitemap 立即可见。
7. B 在文章页发表评论（Client 面直发，乐观更新）。
8. A 打开同一文章页 → B 再评论 → 实时秒达（WS，无需刷新）。
9. 断开 A 的网络数秒再恢复 → `:changes` 补偿补齐窗口内评论（按 seq 续传）。
10. A 在 `/admin` 删除被引用的分类 → 协议第 1 步：计数 > 0，拒绝。
11. A 把自己的文章迁移到其他分类后再删 → 协议完成，分类删除。
12. 在编辑器里给已存文章增删标签 → `arrayUpdates`（APPEND/REMOVE 原子算子，OCC 兼容）。
13. A 删除文章 → Server 面级联清空评论 → 文章删除（OCC version）。
14. 编辑器"上传图片/附件"→ 图片以内联 markdown 插入正文；匿名 `<img>` 加载 view URL（200 + `image/*`）。
15. 附件引用随文章保存（`attachment_ids` 数组属性）并匿名可读。
16. 删除文章 → 附件对象按删除协议级联 `deleteFile`（download 404）。
17. 未登录者调 `/api/upload` → 401（代理路由先校验调用者 JWT）。

## 项目结构

```
src/
├── lib/                     # 客户端安全代码
│   ├── blog-schema.ts       #   数据模型定义（供给的"唯一事实来源"）
│   ├── config.ts            #   VITE_ 公开配置
│   ├── errors.ts            #   域码→文案映射 + OCC 判别/重试
│   ├── torchwood-client.ts  #   Client 面单例 + JWT 持久化 + realtime 连接
│   ├── idempotency.ts       #   Idempotency-Key 暂存（注入 SDK fetch）
│   ├── queries.ts           #   纯 AST 查询构造器
│   ├── types.ts             #   Document → 领域模型解析（含 int64 version 归一）
│   ├── markdown.ts          #   remark/rehype 渲染 + rehype-sanitize 消毒
│   └── query-options.ts     #   TanStack Query 选项（loader/useQuery 共用）
├── server/                  # 服务端上下文（唯一允许出现 API Key 的地方）
│   ├── *.server.ts          #   实现（env/torchwood/provision/seed/public-data/storage/feed/sitemap/health）
│   ├── *.functions.ts       #   createServerFn 包装（公开读、分类管理、评论清理、附件解析/删除）
├── components/              # 页面组件（post-card/post-list/comments/post-editor/category-manager）+ ui/
└── routes/                  # 文件式路由（页面 + server routes：api/health、api/upload、feed[.]xml、sitemap[.]xml）
scripts/
├── check-server-only.mjs    # 秘钥边界检查（npm run check:server-only）
├── smoke-e2e.mjs            # 端到端冒烟（13 项）
└── smoke-provision.mjs      # 供给自检
```

## 已知边界（有意的取舍）

- **他人草稿的孤儿引用**：删除分类时，服务端只能统计/处置它"可见"（已发布）的引用；
  其他用户的私有草稿若引用了被删分类，会保留悬空 `category_id`（应用层显示"分类已删除"）。
  这是文档级 ACL 的必然结果，README 与删除对话框都做了说明。
- **种子草稿**属于虚拟作者 `user:seed-author`（读写删都只授给它），因此对所有人（含 API Key）
  完全不可见——用于演示"最严格的私有"。Torchwood 语义是"可写即可读"，要私有就必须把读写删
  全部只留给属主。
- **SDK 0.2.0 的两处类型缺口**在应用层显式收窄（不用 `any`）：`arrayUpdates`（wire 支持，
  `UpdateDocumentInput` 未声明）；`Document.version` 实为 int64 字符串/缺省省略（`parseVersion` 归一）。
- Markdown 渲染用 remark/rehype + `rehype-sanitize` 白名单消毒（isomorphic-dompurify 在
  Nitro ESM 产物中因 jsdom 的 `__dirname` 不可用）。
- **Torchwood 服务端配置要求**：`configs/config.yaml` 的 `storage.s3.bucket` 必须全小写
  （S3 桶名规范，含大写时 `BucketExists` 返回 400，表现为健康检查 minio unavailable、上传报
  "check bucket: 400 Bad Request"）；实时评论要求 worker 进程在运行（`task dev:worker`）。
