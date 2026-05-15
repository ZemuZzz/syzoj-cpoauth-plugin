# 排错指南

集成时遇到的常见问题。

## 启动相关

### 1. 日志显示 `[cpoauth] enabled = false`

**症状**: 登录页没有 CP OAuth 按钮。
**原因**: 至少一个必填环境变量没设(client_id / client_secret / redirect_uri)。
**解决**: 检查 docker-compose.yml 的 `environment` 段,或 `docker exec <web> env | grep CPOAUTH` 看变量是否注入容器。

### 2. 启动报 `Cannot find module './_cpoauth_login_button'`

**症状**: 改完 login.ejs 后 SYZOJ 启动崩。
**原因**: include 路径错误或 _cpoauth_login_button.ejs 没挂载到容器。
**解决**:
- 确认 docker-compose.yml 里有 `./syzoj-cpoauth-plugin/plugin/views/_cpoauth_login_button.ejs:/app/views/_cpoauth_login_button.ejs:ro`
- 确认 `<% include _cpoauth_login_button %>` 不带 .ejs 后缀
- `docker compose up -d --force-recreate web`(光 restart 不够)

## OAuth 流程相关

### 3. 跳转到 cpoauth.com 报 `invalid_redirect_uri`

**症状**: 点击登录按钮跳过去 cpoauth.com 直接报错。
**原因**: `SYZOJ_WEB_CPOAUTH_REDIRECT_URI` 跟 cpoauth.com 上注册的回调地址**不完全一致**。
**解决**:
- 必须**完全一致**:协议(http/https)、域名、路径(`/auth/cpoauth/callback`)、末尾斜杠
- 例:`https://oj.example.com/auth/cpoauth/callback` ≠ `https://oj.example.com/auth/cpoauth/callback/`

### 4. callback 报 `state 校验失败`

**症状**: 在 cpoauth.com 授权完跳回 SYZOJ 时报错。
**原因**: session 丢失。SYZOJ 默认用**内存 session**,重启容器就会丢。
**解决**:
- 别在测试授权时 `docker compose restart web`
- 生产环境建议把 session 改成 Redis 存储(SYZOJ 默认配置见 `config.json` 的 `session` 段)

### 5. 换 token 失败 `{ error: "invalid_grant" }`

**症状**: callback 阶段 token 换取失败。
**可能原因**:
- code 已经被用过(重放)
- code 过期(>10 分钟)
- code_verifier 跟 challenge 不匹配(session 丢失)
- redirect_uri 跟 authorize 阶段不一致

**解决**: 重新走一遍 OAuth flow。

### 6. /userinfo 返回的数据里没有 `linked_accounts`

**症状**: callback 成功但绑定后个人主页 CP 卡片空白。
**原因**: scope 错了——可能写成了 `cp_summary` 之类的旧名。
**解决**: 严格用 `openid profile cp:linked`(带冒号)。检查 docker exec 看环境变量实际值。

## 集成相关

### 7. 个人主页看不到 CP 卡片(已经绑定了)

**症状**: 已经 OAuth 登录,DB 里 user_cpoauth_binding 表有数据,但个人主页空白。
**原因**: `modules/user.js` 没注入 `cpoauth_binding` 到 `show_user` 上下文。
**解决**: 严格按 [user_module_integration.md](../integration/user_module_integration.md) 改 `modules/user.js`。

### 8. CSP 违规,浏览器 console 报 `Refused to connect to cpoauth.com`

**症状**: 点击 OAuth 按钮跳转不成功,或者"手动同步"按钮失败。
**原因**: nginx 加了 Content-Security-Policy 但没把 cpoauth.com 放白名单。
**解决**: 参考 [examples/nginx-csp.example](../examples/nginx-csp.example),在 `connect-src` 里加 `https://cpoauth.com`。注意 nginx `if` 块的 add_header **覆盖**外层。

### 9. POST `/auth/cpoauth/create` 报 `用户名已存在`

**症状**: 选择"创建新账号"时,从 CP OAuth 拉过来的 username 跟现有 SYZOJ 用户撞了。
**解决**: 让用户在选择页手动改用户名(field 允许编辑)。

## SYZOJ 特有的坑

### 10. SYZOJ 密码加盐

SYZOJ 密码不是裸 md5,而是 `md5(password + 'syzoj2_xxx')`(参考 `utility.js`)。本插件已经处理好。

如果你 fork 了 SYZOJ 改了 salt,需要同步改 cpoauth.js 里两处 `syzoj.utils.md5(password + 'syzoj2_xxx')`。

### 11. EJS include 不支持 .ejs 后缀

SYZOJ 的 EJS 配置不接受 `<% include foo.ejs %>`,必须 `<% include foo %>`。

### 12. SYZOJ 镜像里的 view 文件被 bind-mount 覆盖时

如果你的 SYZOJ docker-compose 里没显式挂载 login.ejs / sign_up.ejs / user.ejs,默认走镜像里的版本。

要改这些文件,有两个办法:
- **A**: 把镜像里的对应文件 cat 出来到宿主机,挂载回去
  ```bash
  mkdir -p custom/views
  docker exec <web> cat /app/views/login.ejs > custom/views/login.ejs
  # 然后在 docker-compose.yml 加 - ./custom/views/login.ejs:/app/views/login.ejs:ro
  ```
- **B**: fork SYZOJ 仓库,改完打镜像

## 调试技巧

### 看插件加载状态

```bash
docker logs <syzoj-web-container> 2>&1 | grep -iE "cpoauth"
```

期望看到:
```
[cpoauth] enabled = true
[cpoauth] routes registered
```

### 测试路由可达

```bash
docker exec <syzoj-web-container> curl -sI http://localhost/auth/cpoauth/login
```

期望 302 / 200(取决于是否登录)。

### 看 DB 里的绑定

```bash
docker exec -i <mariadb-container> mariadb -u root <db-name> -e \
  "SELECT id, user_id, cpoauth_sub, display_name, last_synced_at FROM user_cpoauth_binding;"
```
