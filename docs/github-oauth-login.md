# 登录（GitHub OAuth2）

除邮箱密码外，登录/注册页提供"使用 GitHub 登录"——走 Torchwood 网关的浏览器
OAuth2 流，**博客应用不持有任何 GitHub 密钥**，应用侧零配置项（回跳地址运行时
按当前站点 origin 生成）。

## 流程

```
浏览器                       Torchwood 网关                          GitHub
  │ ① 整页跳转 authorize 端点   │                                      │
  │───────────────────────────>│ ② 校验 provider/回跳白名单，           │
  │                            │   种 nonce cookie（第一方），          │
  │ ③ 302 到 GitHub 授权页      │   state 落 Redis（10min TTL）          │
  │───────────────────────────>│─────────── 授权页 ────────────────────>│
  │                            │ ④ GitHub 302 回网关 callback（code+state）
  │                            │<──────────────────────────────────────│
  │                            │ ⑤ 消费 state + 配对 nonce cookie，     │
  │                            │   code 换身份、落用户、建会话           │
  │ ⑥ 302 到 success 地址，URL fragment 携带 #access_token=…&userId=…  │
  │<───────────────────────────│                                       │
  │ ⑦ 回调页解析 fragment → me() 拉账号 → 写入既有会话 → 落组 → 分流     │
```

两个必须遵守的约束（都踩过坑）：

- **发起必须整页跳转网关的 `authorize` 端点**，不能调 SDK 的
  `createOAuth2Session`——那是跨源 `fetch`，浏览器会丢弃响应里的
  `Set-Cookie`（nonce），回调 nonce 配对必败，最终落到网关的
  `/?error=oauth_failed`（根路径无页面，表现为一坨 404 JSON）。
- **回调页从 URL fragment 取 access_token**，不能再走
  `createOAuth2TokenSession`：state 已被网关 GET 回调消费（GETDEL，一次性）。
  fragment 刻意不含 refresh_token（安全取舍，token 不进 URL path/query/日志），
  因此 OAuth 会话只活到 access token 过期（约 15min）；过期后由 API 401 →
  清会话兜底，用户再点一次 GitHub 登录即可（GitHub 侧已授权，秒过）。

## GitHub 侧：创建 OAuth App

GitHub → Settings → Developer settings → OAuth Apps → **Register a new application**：

| 字段 | 填写 |
|---|---|
| Application name | 任意，如 `My Blog Login` |
| Homepage URL | 站点地址，如 `https://blog.example.com` |
| Authorization callback URL | **Torchwood 网关的回调地址**（见下），不是博客站点地址 |

callback URL 格式（与 Console OAuth 设置页显示的一致）：

```
https://<torchwood-endpoint>/v1/account/oauth2/github/callback
```

注册后复制 **Client ID**，点 **Generate a new client secret** 生成 **Client Secret**
（只显示一次）。

> 网关的本地地址（`http://localhost:9080`）与生产地址回调不同——建议建两个
> OAuth App（dev / prod）各配各的 callback URL。

## Torchwood 侧：两项配置（Console → 项目 → Settings → OAuth）

1. **OAuth Provider**：选 GitHub → 启用 → 填 Client ID + Client Secret → 保存。
   页面会显示应登记到 GitHub 的回调地址，与上表一致。
2. **Redirect Allowlist（回跳白名单）**：把**博客站点**的 origin 加进去，如
   `https://blog.example.com`。未配置时默认只放行 localhost 系列与网关自身
   域名，站点回跳会被 400 拒绝（`success url is not allowed for this project`）。
   条目按"协议+主机匹配、可含路径前缀"。

Client Secret 只存在 Torchwood 侧；博客的 `wrangler.jsonc` / `.env` / Docker 环境
**无需新增任何变量**。

## 应用侧实现（供维护参考）

依赖 `@torchwood/sdk` ≥ 0.3.0（`buildOAuth2AuthorizeURL` +
`parseOAuth2CallbackFragment`；更早版本的 `createOAuth2Session` 在浏览器场景
已废弃，勿回退）。

| 文件 | 职责 |
|---|---|
| `src/lib/torchwood-client.ts` | `startGithubLogin()`（SDK `buildOAuth2AuthorizeURL` 拼发起地址并整页跳转）、`completeGithubLogin()`（SDK `parseOAuth2CallbackFragment` 解析 fragment → `me()` → 写会话） |
| `src/routes/auth.github.callback.tsx` | 回跳页：建立会话 → `syncMyGroupKey()` 落组 → 按组分流（读者组回首页，其余进写作台）；完成后抹掉地址栏 fragment |
| `src/routes/login.tsx` / `register.tsx` | GitHub 按钮 + `?oauth=failed` 失败提示条 |

失败/取消授权时网关 302 回来源页并带 `error=oauth_failed`（与站点的
`oauth=failed` 标记并存），登录/注册页据此展示提示条。路由 `validateSearch`
返回类型的键必须可选，否则全站指向这两个页面的 `<Link>` 都会被要求传 `search`。

## 排错清单（按现象对号入座）

1. **点按钮就 400**：`success url is not allowed for this project` → 回跳白名单
   没配或域名不符（协议/主机必须一致）。 Console → 项目 Settings → OAuth →
   Redirect Allowlist 加上站点 origin。
2. **授权后落在一坨 404 JSON（网关域 `/?error=oauth_failed`）**：网关回调校验
   失败后 302 到网关根路径，而根路径没有页面。常见原因：
   - 发起用了旧版 SDK 的 `createOAuth2Session`（<0.3.0；跨源 fetch 丢 nonce
     cookie）——必须用 `buildOAuth2AuthorizeURL` 整页跳 authorize 端点；
   - state 过期（10 分钟内没完成授权）或被消费过，重试一次即可。
3. **GitHub 报 `redirect_uri_mismatch`**：OAuth App 的 callback URL 与网关
   期望的不一致（协议、域名、端口、路径任一不同都会拒绝）。
4. **跳转后网关 302 回 failure**：provider 未启用或 Client ID/Secret 填错。
5. **登录成功但进不了写作台**：与密码登录一致，属用户组问题而非 OAuth 问题——
   管理员在用户管理页调组。
6. **已知限制**：OAuth 会话无 refresh token，access token 过期（约 15min）后
   需重新点 GitHub 登录；密码登录会话不受影响。
