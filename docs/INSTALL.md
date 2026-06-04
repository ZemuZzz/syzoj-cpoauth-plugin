# 详细安装指南

本文档逐步说明如何在已有的 SYZOJ 部署上集成 CP OAuth 插件。

## 前置条件

1. SYZOJ **已通过 docker-compose 部署**并能正常运行
2. 你已经在 [cpoauth.com](https://cpoauth.com) 注册了应用并拿到 `client_id` / `client_secret`
3. 你的 SYZOJ 站点有公网域名 + HTTPS（回调地址必须 https）

## 第 1 步：在 cpoauth.com 注册应用

1. 登录 [cpoauth.com](https://cpoauth.com)，进入 Developer 页面
2. 创建新应用,填写:
   - **应用名称**：你的 OJ 名称
   - **回调 URL**：`https://你的域名/auth/cpoauth/callback`
3. 记下生成的 `client_id` 和 `client_secret`

## 第 2 步：把插件克隆到 SYZOJ 部署目录

```bash
cd /etc/docker/compose/YourOJ      # 你的 SYZOJ docker-compose 所在目录
git clone https://github.com/ZemuZzz/syzoj-cpoauth-plugin
```

## 第 3 步：运行安装脚本(建表 + 提示挂载)

```bash
bash syzoj-cpoauth-plugin/scripts/install.sh
```

脚本会：
- 校验环境
- 在 SYZOJ 的 DB 里创建 `user_cpoauth_binding` 表
- 打印 docker-compose.yml 需要添加的 volumes 和 environment 段（这里需要你 copy + paste）
- 提示 4 处需要手动改的代码（login.ejs / sign_up.ejs / user.ejs / user.js）

## 第 4 步：改 docker-compose.yml

按脚本输出的内容，把 volumes 和 environment 加到 web 服务的配置里。详见 [examples/docker-compose.snippet.yml](../examples/docker-compose.snippet.yml)。

环境变量的实际值要替换成你在第 1 步拿到的：

```yaml
environment:
  SYZOJ_WEB_CPOAUTH_CLIENT_ID: "你的-client-id"
  SYZOJ_WEB_CPOAUTH_CLIENT_SECRET: "你的-client-secret"
  SYZOJ_WEB_CPOAUTH_BASE_URL: "https://cpoauth.com"
  SYZOJ_WEB_CPOAUTH_REDIRECT_URI: "https://你的域名/auth/cpoauth/callback"
  SYZOJ_WEB_CPOAUTH_SCOPE: "openid profile cp:linked"
```

## 第 5 步：改 SYZOJ 源代码

按下面四个文档分别修改:

- [login_integration.md](../integration/login_integration.md) - login.ejs 加按钮
- [sign_up_integration.md](../integration/sign_up_integration.md) - sign_up.ejs 加按钮
- [user_view_integration.md](../integration/user_view_integration.md) - user.ejs 加卡片
- [user_module_integration.md](../integration/user_module_integration.md) - user.js 注入数据（**必须**）

## 第 6 步（可选）：配 nginx CSP

如果你的 nginx 启用了 Content-Security-Policy，需要把 `https://cpoauth.com` 加到 `connect-src` 里。详见 [examples/nginx-csp.example](../examples/nginx-csp.example)。

## 第 7 步：重启 SYZOJ

```bash
docker compose up -d --force-recreate web
```

> **注意**: 光 `restart` 不会重新加载新的 volume 挂载。

## 第 8 步：验证

1. 访问 https://你的域名/login,应该在登录表单底部看到紫色的“使用 CP OAuth 登录”按钮
2. 点击按钮 → 跳转到 cpoauth.com 授权页 → 授权后回来
3. 第一次会跳到 `/auth/cpoauth/choose` 选择页：
   - **创建新账号** → 用 CP OAuth 资料注册一个新 SYZOJ 用户
   - **绑定到现有账号** → 输入已有 SYZOJ 用户名密码,绑定到当前 CP OAuth
4. 完成后跳到首页，已登录
5. 访问个人主页 `/user/<你的 id>`，看到紫色的 CP OAuth 卡片,列出洛谷 / CF / AtCoder 等账号

## 排错

详见 [TROUBLESHOOTING.md](TROUBLESHOOTING.md)。
