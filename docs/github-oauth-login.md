# 登录（GitHub OAuth2）

除邮箱密码外，登录/注册页提供"使用 GitHub 登录"——浏览器直连 Torchwood 网关的
OAuth2 授权码流，**博客应用不持有任何 GitHub 密钥**，应用侧零配置项（回跳地址
运行时按当前站点 origin 生成）。

## 流程

```
浏览器                    Torchwood 网关                        GitHub
  │ ① createOAuth2Session      │                                │
  │───────────────────────────>│ ② 返回 redirect_url             │
  │ ③ 整页跳转 redirect_url     │                                │
  │───────────────────────────>│────────── 授权页 ──────────────>│
  │                            │ ④ 授权回调（code+state）         │
  │                            │<───────────────────────────────│
  │ ⑤ 302 到 success 页（带 code/state）                        │
  │<───────────────────────────│                                │
  │ ⑥ createOAuth2TokenSession │                                │
  │───────────────────────────>│ ⑦ 用 code 换会话，返回          │
  │    （回调页自动调用）        │    {account, tokens}            │
  │ ⑧ 写入既有会话体系 → 落组 → 按组分流                           │
```

关键点：GitHub 的授权回调直接回到**网关**（不是博客站点），网关再 302 到本站的
`/auth/github/callback`。会话产物与密码登录完全同构，走同一套 localStorage + 静默
refresh（`src/lib/torchwood-client.ts`）。

## GitHub 侧：创建 OAuth App

GitHub → Settings → Developer settings → OAuth Apps → **Register a new application**：

| 字段 | 填写 |
|---|---|
| Application name | 任意，如 `My Blog Login` |
| Homepage URL | 站点地址，如 `https://blog.example.com` |
| Authorization callback URL | **Torchwood 网关的回调地址**（见下），不是博客站点地址 |

callback URL 以 Torchwood 控制台启用 provider 时显示的为准；Appwrite 风格网关为：

```
https://<torchwood-endpoint>/v1/account/sessions/oauth2/callback/github
```

注册后复制 **Client ID**，点 **Generate a new client secret** 生成 **Client Secret**
（只显示一次）。

> 网关的本地地址（`http://localhost:9080`）与生产地址回调不同——建议建两个
> OAuth App（dev / prod）各配各的 callback URL。

## Torchwood 侧：启用 provider

1. Torchwood Console → 项目（如 `blog`）→ 认证 → OAuth2 Providers → **GitHub**：
   启用并填入 Client ID + Client Secret；控制台会显示应登记到 GitHub 的回调 URI。
2. 网关 CORS 白名单加上站点域名（登录/评论等浏览器直连路径的既有要求）；
   success/failure 回跳地址（站点的 `/auth/github/callback`、`/login`、`/register`）
   如网关有白名单登记要求，一并加上。

Client Secret 只存在 Torchwood 侧；博客的 `wrangler.jsonc` / `.env` / Docker 环境
**无需新增任何变量**。

## 应用侧实现（供维护参考）

| 文件 | 职责 |
|---|---|
| `src/lib/torchwood-client.ts` | `startGithubLogin()`（换取授权页地址并跳转）、`completeGithubLogin(code, state)`（换会话，复用 `applyAuthResult`） |
| `src/routes/auth.github.callback.tsx` | 回跳页：换会话 → `syncMyGroupKey()` 落组 → 按组分流（读者组回首页，其余进写作台） |
| `src/routes/login.tsx` / `register.tsx` | GitHub 按钮 + `?oauth=failed` 失败提示条 |

失败/取消授权时网关 302 回来源页并带 `oauth=failed`，登录/注册页据此展示提示条，
路由的 `validateSearch` 返回类型键必须可选（否则全站指向这两个页面的 `<Link>`
都会被要求传 `search`）。

## 排错清单

1. **GitHub 报 `redirect_uri_mismatch`**：OAuth App 的 callback URL 与网关期望的
   不一致（协议、域名、端口、路径任一不同都会拒绝）。
2. **跳转后网关 4xx**：Torchwood 侧 provider 未启用，或 Client ID/Secret 填错。
3. **回到站点提示"GitHub 登录没有完成"**：授权被取消或网关换会话失败——看网关
   日志确认 code 交换错误（常见：GitHub App 与 provider 配置的 App 不是同一个）。
4. **登录成功但进不了写作台**：与密码登录一致，属用户组问题而非 OAuth 问题——
   管理员在用户管理页调组。
