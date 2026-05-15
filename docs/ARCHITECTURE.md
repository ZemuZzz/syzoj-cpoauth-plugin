# 架构

## OAuth 流程图

```
┌────────┐                  ┌──────────┐                  ┌────────────┐
│ 用户   │                  │ SYZOJ    │                  │ cpoauth.com│
└───┬────┘                  └────┬─────┘                  └─────┬──────┘
    │                            │                              │
    │ 1. 点击"使用 CP OAuth 登录"  │                              │
    ├──────────────────────────► │                              │
    │                            │ 2. /auth/cpoauth/login       │
    │                            │   - 生成 state(CSRF 防御)     │
    │                            │   - 生成 PKCE code_verifier   │
    │                            │   - 存入 session             │
    │                            │                              │
    │ 3. 302 跳转 → cpoauth.com  │                              │
    │ ◄──────────────────────────│                              │
    │                            │                              │
    │ 4. 用户在 cpoauth.com 授权                                   │
    ├──────────────────────────────────────────────────────────► │
    │                                                            │
    │ 5. 302 回调 → /auth/cpoauth/callback?code=xxx&state=yyy    │
    │ ◄──────────────────────────────────────────────────────────│
    │                            │                              │
    │ 6. 浏览器自动 GET callback   │                              │
    ├──────────────────────────► │                              │
    │                            │ 7. 校验 state 防 CSRF         │
    │                            │ 8. POST /api/oauth/token     │
    │                            ├────────────────────────────► │
    │                            │   {code, redirect_uri,       │
    │                            │    client_secret,            │
    │                            │    code_verifier}            │
    │                            │ ◄────────────────────────────│
    │                            │   {access_token,             │
    │                            │    refresh_token}            │
    │                            │                              │
    │                            │ 9. GET /api/oauth/userinfo   │
    │                            │    Authorization: Bearer ... │
    │                            ├────────────────────────────► │
    │                            │ ◄────────────────────────────│
    │                            │   {sub, username,            │
    │                            │    display_name,             │
    │                            │    linked_accounts: [        │
    │                            │      {platform, platformUid, │
    │                            │       platformUsername}, ...]│
    │                            │   }                          │
    │                            │                              │
    │                            │ 10. 业务分支:                │
    │                            │   - 已绑定 → 直接登录         │
    │                            │   - 未绑定 + 已登录 → 绑定    │
    │                            │   - 未绑定 + 未登录 → 选择页   │
    │                            │                              │
    │ 11. 302 → / (或 choose 页) │                              │
    │ ◄──────────────────────────│                              │
```

## 业务分支详解

callback 拿到 userinfo 后，根据 3 种情况分支：

### 分支 1：该 CP OAuth `sub` 已经绑定到某个 SYZOJ 用户

直接登录到那个用户。如果当前已登录另一个 SYZOJ 账号 → 报错。

### 分支 2：未绑定 + 当前已登录 SYZOJ

把这个 CP OAuth 绑定到当前登录的 SYZOJ 账号。*常见场景：用户从个人主页点“绑定 CP OAuth”*。

### 分支 3：未绑定 + 未登录

跳转到 `/auth/cpoauth/choose` 选择页，可选：
- 创建新账号 → 用 CP OAuth 资料创建一个新 SYZOJ 用户（用户名 / 邮箱 / 密码自己填）
- 绑定现有账号 → 输入已有 SYZOJ 用户名密码,绑定到当前 CP OAuth，然后登录

选择数据保存在 `req.session.cpoauth_pending`，10 分钟过期。

## 数据模型

### user_cpoauth_binding 表

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INT AUTO_INCREMENT | 主键 |
| user_id | INT | SYZOJ user.id（逻辑外键） |
| cpoauth_sub | VARCHAR(128) | CP OAuth 返回的 OIDC sub claim |
| cpoauth_username | VARCHAR(128) | CP OAuth 用户名（可空） |
| display_name | VARCHAR(128) | 显示名 |
| avatar_url | VARCHAR(512) | 头像 URL |
| bio | TEXT | 个人简介 |
| cp_summary | JSON | 关联平台数组,如 `[{platform: "luogu", platformUid: "467824", platformUsername: "..."}]` |
| refresh_token | VARCHAR(1024) | 用于后续同步 |
| linked_at | INT | 首次绑定时间（unix ts） |
| last_synced_at | INT | 上次同步时间（unix ts） |

唯一索引:
- `uq_user(user_id)` - 一个 SYZOJ 用户最多绑定一个 CP OAuth
- `uq_sub(cpoauth_sub)` - 一个 CP OAuth 账号最多被一个 SYZOJ 用户绑定

## 安全设计

| 防护 | 实现 |
|---|---|
| **CSRF** | OAuth `state` 参数 + session 校验 |
| **授权码拦截** | PKCE (RFC 7636) - 用 SHA256 challenge / verifier |
| **冒用绑定** | 检查"该 OAuth 是否已绑定到别的账号",拒绝跨账号绑定 |
| **refresh_token 泄漏** | 不通过 view 层暴露，user.js 注入时 `delete b.refresh_token` |
| **会话固定** | 登录成功后 `req.session.user_id` 重写 |
| **解绑撤销** | 调 `/api/oauth/revoke` 主动撤销 refresh_token |
| **session 过期** | `cpoauth_pending` 10 分钟过期 |

## 路由清单

| 方法 | 路径 | 说明 | 需要登录 |
|---|---|---|---|
| GET | `/auth/cpoauth/login` | 开始 OAuth flow | 否 |
| GET | `/auth/cpoauth/callback` | OAuth 回调 | 否 |
| GET | `/auth/cpoauth/choose` | 选择"创建/绑定" | 否（凭 pending session） |
| POST | `/auth/cpoauth/create` | 用 OAuth 资料创建新账号 | 否（凭 pending session） |
| POST | `/auth/cpoauth/link` | 用现有密码绑定 | 否（凭 pending session） |
| POST | `/auth/cpoauth/unlink` | 解绑 | 是 |
| POST | `/auth/cpoauth/sync` | 手动同步资料 | 是 |
