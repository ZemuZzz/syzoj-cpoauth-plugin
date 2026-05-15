# user.ejs 集成

在用户个人主页插入 CP OAuth 资料卡片(显示绑定的洛谷 / CF / AtCoder 等竞赛账号)。

## 前置条件

**必须先完成 [user_module_integration.md](./user_module_integration.md)**——在 `modules/user.js` 注入 `cpoauth_binding` 到 `show_user` 上下文。否则模板拿不到数据。

## 修改步骤

打开 `views/user.ejs`,找到个人资料的"通过的题目"row(在"注册于"之后)。

**在"注册于" row 之后、"通过的题目" row 之前**插入:

```ejs
<% include _cpoauth_profile_card %>
```

## 完整示例

修改前(原生 SYZOJ `views/user.ejs` 关键片段,注意嵌套深度):

```ejs
<!-- 已在嵌套 div.row > div.column > div.ui.grid > div.row > div.column > div.ui.grid 内部 -->
<div class="row">
  <div class="column">
    <h4 class="ui top attached block header">注册于</h4>
    <div class="ui bottom attached segment" class="font-content">
      <%= syzoj.utils.formatDate(show_user.register_time) %>
    </div>
  </div>
</div>
<div class="row">
  <div class="column">
    <h4 class="ui top attached block header">通过的题目</h4>
    <div class="ui bottom attached segment">
      <% for (let problem of show_user.ac_problems) { %>
        <a href="<%= syzoj.utils.makeUrl(['problem', problem]) %>"><%= problem %></a>
      <% } %>
    </div>
  </div>
</div>
```

修改后:

```ejs
<div class="row">
  <div class="column">
    <h4 class="ui top attached block header">注册于</h4>
    <div class="ui bottom attached segment" class="font-content">
      <%= syzoj.utils.formatDate(show_user.register_time) %>
    </div>
  </div>
</div>

<!-- CP OAuth 卡片(插件)-->
<% include _cpoauth_profile_card %>

<div class="row">
  <div class="column">
    <h4 class="ui top attached block header">通过的题目</h4>
    <div class="ui bottom attached segment">
      <% for (let problem of show_user.ac_problems) { %>
        <a href="<%= syzoj.utils.makeUrl(['problem', problem]) %>"><%= problem %></a>
      <% } %>
    </div>
  </div>
</div>
```

> 关键:`_cpoauth_profile_card.ejs` 内部本身就用 `<div class="row">...</div>` 结构,所以**直接插在外层 grid 的 row 之间**就行,无需额外嵌套。

## 显示效果

卡片有 **3 种自动切换**的状态:

1. **已绑定 CP OAuth** → 显示紫色卡片,列出洛谷 / Codeforces / AtCoder 等关联账号。如果查看的是自己的资料,还出现"手动刷新"和"解绑"按钮
2. **未绑定 + 是自己的资料 + 插件已启用** → 显示"绑定 CP OAuth"的提示按钮
3. **其他情况** → 完全不显示(零干扰他人浏览体验)

## 自定义样式

紫色渐变 `linear-gradient(90deg, #5c2db8, #7c4dd8)` 直接写在 partial 里。如想换颜色,编辑 `plugin/views/_cpoauth_profile_card.ejs`。

平台样式映射(`luogu` / `codeforces` / `atcoder` / `github` / `google`)也在 partial 里,如想加新平台或改样式,在 `styleMap` 对象里加键值对即可。
