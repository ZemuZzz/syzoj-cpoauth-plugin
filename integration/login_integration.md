# login.ejs 集成

在原生 SYZOJ `views/login.ejs` 的登录表单里加一行 include，登录页底部会出现“使用 CP OAuth 登录”按钮。

## 修改步骤

打开 `views/login.ejs`，找到 `<div class="ui fluid large submit button" id="login">登录</div>` 这一行。它就在 `<div class="ui existing segment">` 内部底部。

**在这一行之后、`</div>`（segment 闭合）之前**插入:

```ejs
<% include _cpoauth_login_button %>
```

> include 路径**不能带 `.ejs` 后缀**，SYZOJ 的 EJS 配置如此。

## 完整示例

修改前（关键片段）：

```ejs
<form class="ui large form">
  <div class="ui existing segment">
    <div class="field">
      <div class="ui left icon input">
        <i class="user icon"></i>
        <input name="email" placeholder="用户名" type="text" id="username" onkeydown="key_login(event)">
      </div>
    </div>
    <div class="field">
      <div class="ui left icon input">
        <i class="lock icon"></i>
        <input name="password" placeholder="密码" type="password" id="password" onkeydown="key_login(event)">
      </div>
    </div>
    <div class="ui fluid large submit button" id="login">登录</div>
  </div>
  <div class="ui error message"></div>
</form>
```

修改后（关键片段）:

```ejs
<form class="ui large form">
  <div class="ui existing segment">
    <div class="field">
      <div class="ui left icon input">
        <i class="user icon"></i>
        <input name="email" placeholder="用户名" type="text" id="username" onkeydown="key_login(event)">
      </div>
    </div>
    <div class="field">
      <div class="ui left icon input">
        <i class="lock icon"></i>
        <input name="password" placeholder="密码" type="password" id="password" onkeydown="key_login(event)">
      </div>
    </div>
    <div class="ui fluid large submit button" id="login">登录</div>

    <!-- CP OAuth 登录按钮(插件) -->
    <% include _cpoauth_login_button %>

  </div>
  <div class="ui error message"></div>
</form>
```

> 把按钮放在 `<div class="ui existing segment">` 内部，跟用户名 / 密码 / 登录按钮在同一个 segment，视觉上更协调。

## 自定义按钮文案（可选）

如果你想改文案，可在 include 之前定义变量:

```ejs
<% var cpoauth_button_label = 'Sign in with CP OAuth'; %>
<% include _cpoauth_login_button %>
```

## 注意

- 按钮**只在插件正确配置时显示**，即根据 `syzoj.cpoauth_enabled` 状态检测。如果环境变量还没设置，按钮将不会出现，也不会破坏现有登录页；
- 按钮**默认紫色**（`#5c2db8`）。如想改其他颜色，直接编辑 `plugin/views/_cpoauth_login_button.ejs`。