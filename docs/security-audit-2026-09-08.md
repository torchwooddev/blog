# 安全检测报告 — Torchwood Blog(dev 环境)

- **日期**:2026-09-08
- **目标**:`https://torchwood-blog-dev.deeploop.run/`(本仓库的 Dokploy dev 部署)
- **后端依赖**:Torchwood 网关 `https://torchwood-dev.deeploop.run`(project: `blog`)
- **方法**:源码静态审查 + 线上实弹验证(无破坏性压测;写入类验证仅使用自建测试资源,验证后已清理)
- **配套文档**:Torchwood 平台侧发现见 `torchwood` 仓库 `docs/review/security-audit-2026-09-08-blog-dev.md`

## 结论速览

| 编号 | 等级 | 问题 | 状态 |
|---|---|---|---|
| B-01 | 🔴 严重 | 特权 Server Function 可被未授权直调 | ✅ 已修复（2026-09-08，待部署复验） |
| B-02 | 🔴 严重 | 存储型 XSS:文章标题注入 JSON-LD(浏览器已实证) | ✅ 已修复（2026-09-08，待部署复验） |
| B-03 | 🟠 高 | 任意注册用户可发布公开文章(数据模型设计) | 待决策 |
| B-04 | 🟠 高 | JWT/refresh token 存 localStorage | 待修复 |
| B-05 | 🟡 中 | 博客源零安全响应头 | ✅ 已修复（2026-09-08，待部署复验） |
| B-06 | 🟡 中 | `siteUrl` 配置错误(canonical/OG/RSS/sitemap 全错) | 待修复（部署配置，见下文） |
| B-07 | 🟡 中 | `/api/upload` 不限文件类型 | ✅ 已修复（2026-09-08，待部署复验） |
| B-08 | 🟢 低 | 附件桶 `public:true`(设计决策,记录在案) | 接受 |
| B-09 | 🟢 低 | `/config.js` 暴露 endpoint/projectId(设计使然) | 接受 |
| B-10 | ⚪ 记录 | `HEAD /` 偶发 500 | 观察 |

> 修复说明:四项代码修复(B-01/B-02/B-05/B-07)已于 2026-09-08 完成并通过本地构建与端到端复验(见文末"复验记录"),同日部署上线(镜像 `sha-8b38e10`)并完成**线上复扫**——见"线上复扫记录(2026-09-08)"。

## 线上复扫记录(2026-09-08,严格模式)

对新镜像 `sha-8b38e10` 的实弹复扫结果(手段与首轮检测相同,含破坏性写入;未做流量攻击):

| 项 | 结果 | 证据 |
|---|---|---|
| B-01 | ✅ **修复生效** | 5 个特权 fn 未授权直调全部被鉴权墙拒绝(响应体为"未登录"文案,零写入);CSRF 绕过变体矩阵(无头/origin null/异域/同域 http/cross-site/referer)仅同源语义放行且随即撞鉴权墙,无回归 |
| B-02 | ✅ 修复已上线 | 行为级复验受阻:网关数据面回归导致无法发文(见下);修复代码随镜像部署,本地已端到端验证(单测 3 例 + 本地构建断言) |
| B-05 | ✅ **修复生效** | `/`、`/config.js` 等 5 个安全头全部存在,CSP-RO 内容按运行时 endpoint 正确生成 |
| B-06 | ✅ **已修正** | `/config.js` 现在 `siteUrl=https://torchwood-blog-dev.deeploop.run`(Dokploy 环境变量已配) |
| B-07 | ✅ **修复生效** | 8/8 用例:html/xhtml/swf→415、MIME/扩展名伪装→415、无扩展名→415;png/svg/pdf 正常放行;存储响应头完好(svg=attachment,png/pdf=inline + nosniff + CSP sandbox) |
| B-03/B-04 | 未变 | 数据模型与 token 存储设计未动(预期内) |

**复扫中发现的新问题(非 blog 代码缺陷,根因在 Torchwood 平台侧)**:

- 🔴 **P1 数据面回归(Torchwood dev 网关,详见 torchwood 仓库同日报告)**:blog 库数据全部不可见(categories/posts/comments 匿名与站点侧均为空),JWT 直连网关写文档完整字段报 500、缺字段报 postgres 23502(物理表与 NOT NULL 列还在,服务/目录层不一致)。阻塞了 B-02 的线上行为复验与认证路径的写操作复验。**缓解**:重启 blog 容器(Dokploy Redeploy)——`ensureBlogReady` 单例会在进程启动时重新供给并灌种子(`BLOG_SEED=true`)。
- ⚪ 残留(已知,记录在案):登录用户仍可跨用户管理分类/按 ID 删任意附件(应用无角色/所有权粒度);Traefik 未传 `X-Forwarded-Proto`,应用内 origin 仍为 http(复扫矩阵再次确认,当前不可被浏览器利用)。

---

## B-01 🔴 特权 Server Function 可被未授权直调

**位置**:`src/server/admin.functions.ts`(createCategory / deleteCategory / renameCategory / cleanupCommentsForPost)、`src/server/storage.functions.ts`(getFiles / deleteStorageFiles)

**描述**:管理面 server function 以 Server API Key 直写数据库,但 handler 内部没有任何调用者身份校验;admin 页面的登录守卫是纯客户端跳转(`src/routes/admin.index.tsx:52-53`),不保护 HTTP 端点。唯一的防线是 TanStack Start 默认 CSRF 中间件,它只防浏览器跨站请求——伪造 `Sec-Fetch-Site: same-origin` 头即可绕过(浏览器禁止伪造此头,curl/脚本可随意设置)。

**实测证据**(全部无需任何凭证,2026-09-08):

| 端点 | 结果 |
|---|---|
| `createCategory` | HTTP 200,成功创建分类 `cat-sec-test-poc-a1b2c3` |
| `deleteCategory` | HTTP 200,`{ok:true, deleted:true}` |
| `deleteStorageFiles` | HTTP 200,一次删除 3 个存储文件(返回计数 3) |
| `cleanupCommentsForPost` | HTTP 200,`{ok:true, affected:1}`(对任意文章的全部评论有效) |

影响:匿名攻击者可任意增删改分类、清空任意文章评论、删除任意附件(附件 ID 可经文章数据获得)、读取附件元数据。

**衍生问题(部署配置)**:带正常 `Origin: https://…` 的请求反而被 403,`Sec-Fetch-Site` 放行——说明 Traefik→Nitro 的 `X-Forwarded-Proto` 传递有误,应用重建的 request origin 是 http 而非 https。修好它之后,CSRF 中间件才能按预期工作(但依旧不能替代鉴权)。

**修复建议**:
1. 每个特权 server function 在 handler 内校验调用者:经 `getWebRequest()` 取 `Authorization` 头,用一次性 Torchwood client 调 `account.me()` 验证(参照 `verifyUploader`,`src/server/storage.server.ts:31`)——至少要求登录;分类管理建议进一步限定管理员/作者。
2. 修正 Dokploy Traefik 的 `X-Forwarded-Proto` 传递,使 Nitro 重建出正确的 https origin。

**复现**:`node scripts/sec-poc-serverfn.mjs createCategory '{"name":"x","slug":"y"}' --sfs`(函数 ID 映射见脚本内常量;ID 为文件名+函数名的稳定哈希,随代码变更)。

## B-02 🔴 存储型 XSS:文章标题注入 JSON-LD

**位置**:`src/routes/posts.$slug.tsx:29-44`(`headline: detail.post.title` 原样进入 `JSON.stringify`,`<` 不被 JSON 转义;`description` 走 `excerpt()` 也存在同类问题——它剥 `>` 但保留 `<` 和 `/`)

**描述**:`<script type="application/ld+json">` 内容里出现字面 `</script` 会提前闭合脚本块,其后内容被浏览器当 HTML 解析。文章标题不经过任何清洗,可直接携带完整 payload。

**实测证据**:任意注册账号发布标题为 `PWN</script><img src=y onerror=alert(document.domain)>` 的文章,真实浏览器打开文章页触发 alert 对话框(弹窗阻塞页面脚本执行,已取证)。叠加 B-04(token 在 localStorage),可窃取访问者会话。

**修复建议**(核心一行):序列化后转义 `<`——

```ts
const jsonLd = JSON.stringify({...}).replace(/</g, '\\u003c')
```

标题、excerpt 同样处理;`og:`/`<meta>` 路径由 React 属性转义保护,无需处理。

**复现**:`node scripts/sec-poc-xss2.mjs <email> <pass> <postId>`(账号注册见 `scripts/sec-poc-auth.mjs`)。

## B-03 🟠 任意注册用户可发布公开文章

**位置**:`src/lib/blog-schema.ts:84`(posts 集合 `create:users`)+ `publishPost` 授 `read:any`(`src/lib/admin-client.ts:184`)

**描述**:开放注册 + 任何登录用户可创建并公开发布文章,叠加 B-02 等于"任何互联网用户可向站点读者投毒"。属于产品/数据模型决策而非实现缺陷:单作者博客建议把 posts 的 `create` 收敛为 `create:keys` 或引入白名单/审核位,发布通道由服务端代发。

**状态**:待产品决策(demo 定位下可接受,需记录)。

## B-04 🟠 JWT/refresh token 存 localStorage

**位置**:`src/lib/torchwood-client.ts:19-54`

**描述**:access/refresh token 持久化在 `localStorage`,任何 XSS(B-02 已实证可达)即可窃取并刷新长期冒充。建议 access token 留内存、refresh 走 httpOnly Cookie(需网关支持)或短期化 + 设备绑定;短期缓解是尽快落地 B-05 的 CSP。

## B-05 🟡 博客源零安全响应头

**描述**:`/`、`/api/*` 等均未设置 CSP、HSTS、X-Frame-Options、X-Content-Type-Options、Referrer-Policy(存储源反而齐全)。建议在 Nitro 统一加(或 Dokploy Traefik 中间件):HSTS、`frame-ancestors 'none'`、`nosniff`、`strict-origin-when-cross-origin`,并按站点实际加载源收紧 CSP(可先 `Content-Security-Policy-Report-Only` 试跑)。

## B-06 🟡 `siteUrl` 配置错误

**描述**:线上 `/config.js` 返回 `siteUrl=http://localhost:3000`(Dokploy 未设 `VITE_SITE_URL`,回退到构建期烘入值)。canonical、og:url、RSS(`feed.xml`)、sitemap 的绝对地址全错,影响 SEO 与订阅器解析。**修复**:Dokploy Environment 面板设置 `VITE_SITE_URL=https://torchwood-blog-dev.deeploop.run` 并重启。

## B-07 🟡 `/api/upload` 不限文件类型

**位置**:`src/server/storage.server.ts:52-61`(仅校验大小 10MiB)

**描述**:任意注册用户可上传任意类型文件到公开桶。Torchwood 存储服务的响应头(`Content-Disposition: attachment` + `nosniff` + `CSP sandbox`)已阻断脚本执行,**不构成存储型 XSS**;残余风险是可信域名下托管钓鱼/恶意文件。建议按博客场景收敛白名单(图片 + 常见文档格式),拒绝 `svg/html/htm/xhtml/swf` 等活跃内容类型。

## B-08 🟢 附件桶 `public:true`

**位置**:`src/server/provision.server.ts:74-87`(按 `blog-media` 名幂等创建/修正为公开桶)

**描述**:匿名可读任意附件 URL(文件 ID 为 UUID,不可枚举)。为博客图片直链的设计决策,记录在案;如需收紧可改私有桶 + 服务端签发短期链接。

## B-09 🟢 `/config.js` 暴露 endpoint/projectId

**描述**:镜像通用化的运行时注入机制,endpoint/projectId 本就是浏览器直连所需公开值,无敏感信息(API key 只存在于 `src/server/*.server.ts`,且有 `check:server-only` 静态边界检查)。接受。

## B-10 ⚪ `HEAD /` 偶发 500

**描述**:首测时 `HEAD /` 返回 500(疑为首次请求触发供给逻辑的瞬时错误),复测正常。建议留意启动期健康检查(`HEALTHCHECK` 用的是 GET `/api/health`,不受影响)。

---

## 已验证安全面(无需整改)

- **Markdown 正文消毒稳固**:`rehype-sanitize` 实测剥除 `<script>`、raw HTML、`javascript:` 链接、`on*` 事件,payload 仅渲染为转义文本(`src/lib/markdown.ts`)。
- **评论纯文本渲染**:React 文本节点转义,XSS payload 不执行(`src/components/comments.tsx:81`)。
- **草稿/越权读取被挡**:以普通用户读取种子草稿与其他用户文章均 not found(依赖 Torchwood 文档级 ACL,平台侧行为)。
- **`.env` 未进过 git 历史**;镜像非 root 运行;compose 用 `expose` 不映射端口;线上 `/.env`、`/.git/*` 不可达。

## 残留事项

- ~~测试账号 `sec-test-873c7230@test.local` 需手动清理~~ ✅ 已通过平台新上线的 DeleteAccount API 删除并验证(旧 token 401、登录拒绝)。
- blog-media 桶中遗留约 6 个复扫测试文件(`e2e.png/svg/pdf` 两轮,内容无害且被存储沙箱隔离),Console 手动清理。
- 测试数据已清理:未成功写入任何文章/分类(数据面回归阻塞),无其他残留。
- PoC 脚本保留在 `scripts/sec-*.mjs`,凭证一律环境变量注入,可复跑;确认不需要后可删。

## 修复优先级

1. ~~**B-01**(server function 加鉴权)与 **B-02**(JSON-LD 转义)~~ ✅ 已于 2026-09-08 修复。
2. ~~**B-06**(一行环境变量)~~（部署配置，待在 Dokploy 面板设置）与 ~~**B-05**(安全头)~~ ✅ 已修复。
3. **B-04 / B-07** —— B-07 ✅ 已修复；B-04 随迭代安排。
4. **B-03**——产品决策后调整数据模型。

## 复验记录(2026-09-08,本地构建)

修复后的完整构建(`npm run check`、`npm test` 36 用例、`npm run build` 全部通过)在本地以生产模式启动(`node .output/server/index.mjs`,指向 dev 网关),用检测时的 PoC 手法复验:

| 用例 | 结果 |
|---|---|
| B-01:未授权 + 伪造 `Sec-Fetch-Site` 直调 `createCategory` | ✅ 拒绝——响应体为 `{ok:false, message:"未登录：此操作需要终端用户 JWT。"}`,无任何写入(修复前同请求返回 `{ok:true,id:"cat-…"}` 并真实建出分类) |
| B-01:携带有效终端用户 JWT 调用 | ✅ 通过鉴权闸门(不再返回未登录文案;后续写库动作在本地因 server key 与网关配置不同而失败,与鉴权无关) |
| B-05:`GET /config.js` 响应头 | ✅ `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: strict-origin-when-cross-origin`、`Strict-Transport-Security`、`Content-Security-Policy-Report-Only` 全部存在 |
| CSRF 回归:裸请求(无 Origin/Sec-Fetch-Site)调 server function | ✅ 仍为 403(默认 CSRF 中间件行为保留) |
| B-07:上传 `.html`(text/html) | ✅ 415 拒绝;白名单成员(png/pdf/txt/md/svg 等)与 10MiB 限制有 7 个单测覆盖 |

**B-02 的复验方式**:`toSafeJsonLd` 有 3 个单测(含 `</script>` 的对象序列化后无字面闭合序列、`JSON.parse` 深相等、U+2028 转义);本地无法端到端渲染文章页(本地 server key 与 dev 网关不匹配,SSR 数据面 500),**部署后需复验**:发布一篇标题含 `</script><img src=x onerror=alert(1)>` 的测试文章,浏览器打开应无弹窗、页面 `<script type="application/ld+json">` 内不含字面 `</script`。

**部署后复验命令**(对线上环境):

```bash
# B-01(应返回未登录文案,而非 200 建出分类)
node scripts/sec-poc-serverfn.mjs createCategory '{"name":"x","slug":"y"}' --sfs
# B-05(应看到 5 个安全头)
curl -s -D - -o /dev/null https://torchwood-blog-dev.deeploop.run/config.js
```

## 修复落点索引

- B-01:`src/server/auth.server.ts`(新,鉴权 helper)、`src/server/admin.functions.ts`、`src/server/storage.functions.ts`(handler 入口校验)、`src/lib/authed-call.ts`(新,客户端附 token)、`category-manager.tsx`/`admin.index.tsx`/`post-editor.tsx`(调用点附带 Authorization)
- B-02:`src/lib/jsonld.ts`(新,`toSafeJsonLd`)、`posts.$slug.tsx`、`index.tsx`;同类问题一并修复:`src/lib/xml.ts`(新,`xmlEscape`)、`feed.server.ts`、`sitemap.server.ts`(slug 拼 URL 进 XML 的转义补齐)
- B-05:`src/start.ts`(新,start 实例接管:显式 CSRF 中间件 + 安全响应头中间件;CSP 以 Report-Only 试跑)
- B-07:`src/server/storage.server.ts`(MIME+扩展名双确认白名单)
