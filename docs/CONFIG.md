# 环境变量配置详解

插件读 5 个环境变量。SYZOJ 用 docker-compose `environment` 块或 systemd EnvironmentFile 注入即可。

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `SYZOJ_WEB_CPOAUTH_CLIENT_ID` | ✅ | (无) | cpoauth.com 注册应用后拿到的 client_id |
| `SYZOJ_WEB_CPOAUTH_CLIENT_SECRET` | ✅ | (无) | 对应 client_secret,**不要公开** |
| `SYZOJ_WEB_CPOAUTH_BASE_URL` | ❌ | `https://cpoauth.com` | CP OAuth 服务的 base URL |
| `SYZOJ_WEB_CPOAUTH_REDIRECT_URI` | ✅ | (无) | OAuth 回调地址,必须跟 cpoauth.com 上注册的一致 |
| `SYZOJ_WEB_CPOAUTH_SCOPE` | ❌ | `openid profile cp:linked` | OAuth scope。**不要改** |

## 详细说明

### `SYZOJ_WEB_CPOAUTH_CLIENT_ID` (必填)

cpoauth.com 给你的应用 ID。形如 UUID:`00000000-0000-0000-0000-000000000000`。

### `SYZOJ_WEB_CPOAUTH_CLIENT_SECRET` (必填)

对应密钥。**只在服务端使用,绝不要写进前端代码或 view 模板**。

### `SYZOJ_WEB_CPOAUTH_REDIRECT_URI` (必填)

OAuth 回调地址。固定格式:

```
https://<你的 OJ 域名>/auth/cpoauth/callback
```

例如:`https://your-oj.example.com/auth/cpoauth/callback`

**这个地址必须跟 cpoauth.com 上注册的"应用回调 URL"完全一致**(包括协议、域名、路径、末尾斜杠),不一致 cpoauth.com 会拒绝。

### `SYZOJ_WEB_CPOAUTH_SCOPE` (默认值即可)

固定写法:`openid profile cp:linked`(中间是空格,**不是逗号**)。

> 重要: scope 名字带**冒号** `cp:linked`,不是下划线 `cp_summary`!
> /userinfo 返回的字段叫 `linked_accounts`(数组),不是 `cp_summary`。详见 TROUBLESHOOTING.md。

### `SYZOJ_WEB_CPOAUTH_BASE_URL` (默认值即可)

如果你的 cpoauth 部署在自定义域名(罕见,通常是开发/测试环境),可以改这个。生产环境保持默认。

## 配置完成后

插件启动时会打印日志:

```
[cpoauth] enabled = true
[cpoauth] routes registered
```

如果显示 `enabled = false`,说明必填变量没设全。查看 docker logs 排查。
