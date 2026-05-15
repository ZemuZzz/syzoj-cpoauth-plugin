# sign_up.ejs 集成

跟 login.ejs 集成方式一致——在原生 SYZOJ `views/sign_up.ejs` 注册表单底部加一行 include。

## 修改步骤

打开 `views/sign_up.ejs`,找到注册按钮:

```ejs
<a id="sign_up" class="ui button" href="javascript:submit();">注册</a>
```

**在这个按钮之后、`</form>` 之前**插入:

```ejs
<% var cpoauth_button_label = '使用 CP OAuth 注册 / 登录'; %>
<% include _cpoauth_login_button %>
```

> 文案稍微改一下以适应注册场景。也可以省略 `var cpoauth_button_label`,这样使用默认文案"使用 CP OAuth 登录"。

## 完整示例

修改前(原生 SYZOJ `views/sign_up.ejs` 关键片段):

```ejs
<form class="ui form">
  <div class="field">
    <label for="username">用户名</label>
    <input type="text" placeholder="" id="username">
  </div>
  <div class="field">
    <label for="email">邮箱</label>
    <input type="email" placeholder="" id="email">
  </div>
  <div class="two fields">
    <div class="field">
      <label class="ui header">密码</label>
      <input type="password" placeholder="" id="password1">
    </div>
    <div class="field">
      <label class="ui header">确认密码</label>
      <input type="password" placeholder="" id="password2">
    </div>
  </div>
  <a id="sign_up" class="ui button" href="javascript:submit();">注册</a>
</form>
```

修改后:

```ejs
<form class="ui form">
  <div class="field">
    <label for="username">用户名</label>
    <input type="text" placeholder="" id="username">
  </div>
  <div class="field">
    <label for="email">邮箱</label>
    <input type="email" placeholder="" id="email">
  </div>
  <div class="two fields">
    <div class="field">
      <label class="ui header">密码</label>
      <input type="password" placeholder="" id="password1">
    </div>
    <div class="field">
      <label class="ui header">确认密码</label>
      <input type="password" placeholder="" id="password2">
    </div>
  </div>
  <a id="sign_up" class="ui button" href="javascript:submit();">注册</a>

  <!-- CP OAuth 注册 / 登录按钮(插件) -->
  <% var cpoauth_button_label = '使用 CP OAuth 注册 / 登录'; %>
  <% include _cpoauth_login_button %>

</form>
```

## 注意

- 由于第三方账号通常**没有本站密码**,通过 CP OAuth 注册的用户**密码在选择页自己填**(参考 `cpoauth_choose.ejs`)
- 按钮**只在插件正确配置时显示**
- 原生 SYZOJ 注册路径是 `/sign_up`,本插件**不修改这个路由**,只是在页面上加一个 OAuth 入口
