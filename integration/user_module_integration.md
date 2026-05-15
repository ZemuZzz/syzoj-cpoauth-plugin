# user.js 集成

在用户主页路由 `GET /user/:id` 里注入 `cpoauth_binding` 数据到 `show_user` 上下文,这样 view 层(`_cpoauth_profile_card.ejs`)才能读到。

## 修改步骤

打开 `modules/user.js`,找到 `app.get('/user/:id', ...)` 路由处理函数(原生 SYZOJ 大约在 76 行附近)。

在 `res.render('user', { ... })` **之前**插入注入代码。

## 完整示例

修改前(原生 SYZOJ `modules/user.js` `GET /user/:id` 完整片段):

```javascript
// User page
app.get('/user/:id', async (req, res) => {
  try {
    let id = parseInt(req.params.id);
    let user = await User.findById(id);
    if (!user) throw new ErrorMessage('无此用户。');
    user.ac_problems = await user.getACProblems();
    user.articles = await user.getArticles();
    user.allowedEdit = await user.isAllowedEditBy(res.locals.user);

    let statistics = await user.getStatistics();
    await user.renderInformation();
    user.emailVisible = user.public_email || user.allowedEdit;

    const ratingHistoryValues = await RatingHistory.find({
      where: { user_id: user.id },
      order: { rating_calculation_id: 'ASC' }
    });
    const ratingHistories = [{
      contestName: "初始积分",
      value: syzoj.config.default.user.rating,
      delta: null,
      rank: null
    }];

    for (const history of ratingHistoryValues) {
      const contest = await Contest.findById((await RatingCalculation.findById(history.rating_calculation_id)).contest_id);
      ratingHistories.push({
        contestName: contest.title,
        value: history.rating_after,
        delta: history.rating_after - ratingHistories[ratingHistories.length - 1].value,
        rank: history.rank,
        participants: await ContestPlayer.count({ contest_id: contest.id })
      });
    }
    ratingHistories.reverse();

    res.render('user', {
      show_user: user,
      statistics: statistics,
      ratingHistories: ratingHistories
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
```

修改后(只在 `res.render('user', ...)` 之前加一段):

```javascript
// User page
app.get('/user/:id', async (req, res) => {
  try {
    let id = parseInt(req.params.id);
    let user = await User.findById(id);
    if (!user) throw new ErrorMessage('无此用户。');
    user.ac_problems = await user.getACProblems();
    user.articles = await user.getArticles();
    user.allowedEdit = await user.isAllowedEditBy(res.locals.user);

    let statistics = await user.getStatistics();
    await user.renderInformation();
    user.emailVisible = user.public_email || user.allowedEdit;

    const ratingHistoryValues = await RatingHistory.find({
      where: { user_id: user.id },
      order: { rating_calculation_id: 'ASC' }
    });
    const ratingHistories = [{
      contestName: "初始积分",
      value: syzoj.config.default.user.rating,
      delta: null,
      rank: null
    }];

    for (const history of ratingHistoryValues) {
      const contest = await Contest.findById((await RatingCalculation.findById(history.rating_calculation_id)).contest_id);
      ratingHistories.push({
        contestName: contest.title,
        value: history.rating_after,
        delta: history.rating_after - ratingHistories[ratingHistories.length - 1].value,
        rank: history.rank,
        participants: await ContestPlayer.count({ contest_id: contest.id })
      });
    }
    ratingHistories.reverse();

    // ============ syzoj-cpoauth-plugin: 注入绑定数据 ============
    try {
      const conn = TypeORM.getConnection();
      const bindingRows = await conn.query(
        'SELECT * FROM user_cpoauth_binding WHERE user_id = ?',
        [user.id]
      );
      if (bindingRows.length > 0) {
        const b = bindingRows[0];
        // 不向 view 暴露 refresh_token
        delete b.refresh_token;
        // 解析 JSON 字段
        if (b.cp_summary) {
          try {
            b.cp_summary_parsed = typeof b.cp_summary === 'string'
              ? JSON.parse(b.cp_summary)
              : b.cp_summary;
          } catch (e) {
            b.cp_summary_parsed = {};
          }
        } else {
          b.cp_summary_parsed = {};
        }
        user.cpoauth_binding = b;
      }
    } catch (e) {
      syzoj.log('[cpoauth binding load] ' + e.message);
    }
    // ============ syzoj-cpoauth-plugin 结束 ============

    res.render('user', {
      show_user: user,
      statistics: statistics,
      ratingHistories: ratingHistories
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});
```

## 重要说明

- **必须 `delete b.refresh_token`**——refresh_token 是敏感凭证,**绝对不能**通过 view 层暴露给用户
- `try/catch` 包裹——即使 `user_cpoauth_binding` 表不存在(插件未安装时),原有 `/user/:id` 路由也不会崩
- `TypeORM` 是 SYZOJ 的全局对象,**直接使用 `TypeORM.getConnection()` 即可**,无需 require
- 注入代码放在 `ratingHistories.reverse()` 之后、`res.render` 之前——所有现有数据准备完成后再补
- 这段代码**幂等**:即使重复执行,DB 查询和 user 对象赋值不会产生副作用
