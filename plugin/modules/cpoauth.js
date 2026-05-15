/**
 * syzoj-cpoauth-plugin
 * CP OAuth 2.0 Integration for SYZOJ.
 *
 * Flow:
 *   GET  /auth/cpoauth/login    - 跳转 CP OAuth authorize 端点(带 state + PKCE)
 *   GET  /auth/cpoauth/callback - 回调:换 token + 拉 userinfo + 业务分支
 *   GET  /auth/cpoauth/choose   - 首次登录:让用户选"创建新账号"或"用现有 OJ 密码绑定"
 *   POST /auth/cpoauth/create   - 用 CP OAuth 资料创建新 OJ 账号
 *   POST /auth/cpoauth/link     - 用现有 OJ 密码登录后绑定到当前 CP OAuth
 *   POST /auth/cpoauth/unlink   - 解绑(已登录)
 *   POST /auth/cpoauth/sync     - 手动从 CP OAuth 拉最新数据
 *
 * 依赖:DB 表 user_cpoauth_binding(见 sql/001_create_binding_table.sql)
 *
 * 配置:见环境变量 SYZOJ_WEB_CPOAUTH_*
 *
 * License: MIT
 */

const crypto = require('crypto');
const User = syzoj.model('user');

// ============ 配置(从环境变量) ============
const CP = {
  clientId: process.env.SYZOJ_WEB_CPOAUTH_CLIENT_ID || '',
  clientSecret: process.env.SYZOJ_WEB_CPOAUTH_CLIENT_SECRET || '',
  baseUrl: process.env.SYZOJ_WEB_CPOAUTH_BASE_URL || 'https://cpoauth.com',
  redirectUri: process.env.SYZOJ_WEB_CPOAUTH_REDIRECT_URI || '',
  scope: process.env.SYZOJ_WEB_CPOAUTH_SCOPE || 'openid profile cp:linked'
};

function isEnabled() {
  return !!(CP.clientId && CP.clientSecret && CP.redirectUri && !CP.clientId.startsWith('PLACEHOLDER'));
}

// 全局暴露给 EJS 模板用(检测插件是否启用)
syzoj.cpoauth_enabled = isEnabled();
console.log('[cpoauth] enabled =', syzoj.cpoauth_enabled);
if (!isEnabled()) {
  console.log('[cpoauth] WARNING: plugin disabled, missing env: SYZOJ_WEB_CPOAUTH_CLIENT_ID / SECRET / REDIRECT_URI');
}

// ============ 工具:PKCE + state ============
function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

function generatePKCE() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

// ============ 工具:HTTP JSON ============
async function httpJson(method, url, body, headers = {}) {
  const fetch = global.fetch || require('node-fetch');
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  let data;
  try { data = await res.json(); } catch (e) { data = { error: 'invalid_json' }; }
  return { ok: res.ok, status: res.status, data };
}

async function exchangeCode(code, codeVerifier) {
  // 注意:token 端点用 /api/oauth/token (不是 /oauth/token)
  return httpJson('POST', `${CP.baseUrl}/api/oauth/token`, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: CP.redirectUri,
    client_id: CP.clientId,
    client_secret: CP.clientSecret,
    code_verifier: codeVerifier
  });
}

async function refreshAccessToken(rtoken) {
  return httpJson('POST', `${CP.baseUrl}/api/oauth/token`, {
    grant_type: 'refresh_token',
    refresh_token: rtoken,
    client_id: CP.clientId,
    client_secret: CP.clientSecret
  });
}

async function fetchUserinfo(accessToken) {
  return httpJson('GET', `${CP.baseUrl}/api/oauth/userinfo`, null, {
    'Authorization': 'Bearer ' + accessToken
  });
}

async function revokeToken(token, hint = 'refresh_token') {
  return httpJson('POST', `${CP.baseUrl}/api/oauth/revoke`, {
    token, token_type_hint: hint,
    client_id: CP.clientId, client_secret: CP.clientSecret
  });
}

// ============ DB 操作 (raw SQL, 不走 TypeORM model) ============
async function getBindingByUserId(userId) {
  const conn = TypeORM.getConnection();
  const rows = await conn.query('SELECT * FROM user_cpoauth_binding WHERE user_id = ?', [userId]);
  return rows[0] || null;
}

async function getBindingBySub(sub) {
  const conn = TypeORM.getConnection();
  const rows = await conn.query('SELECT * FROM user_cpoauth_binding WHERE cpoauth_sub = ?', [sub]);
  return rows[0] || null;
}

async function upsertBinding(userId, profile, refresh_token) {
  const conn = TypeORM.getConnection();
  const now = Math.floor(Date.now() / 1000);
  await conn.query(`
    INSERT INTO user_cpoauth_binding
      (user_id, cpoauth_sub, cpoauth_username, display_name, avatar_url, bio, cp_summary, refresh_token, linked_at, last_synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      cpoauth_username = VALUES(cpoauth_username),
      display_name = VALUES(display_name),
      avatar_url = VALUES(avatar_url),
      bio = VALUES(bio),
      cp_summary = VALUES(cp_summary),
      refresh_token = VALUES(refresh_token),
      last_synced_at = VALUES(last_synced_at)
  `, [
    userId, profile.sub, profile.username || null, profile.display_name || null,
    profile.avatar_url || null, profile.bio || null,
    JSON.stringify(profile.linked_accounts || profile.cp_summary || null), refresh_token || null,
    now, now
  ]);
}

async function deleteBinding(userId) {
  const conn = TypeORM.getConnection();
  await conn.query('DELETE FROM user_cpoauth_binding WHERE user_id = ?', [userId]);
}

// ============ 路由 1:启动 OAuth flow ============
app.get('/auth/cpoauth/login', async (req, res) => {
  if (!isEnabled()) {
    return res.render('error', { err: 'CP OAuth 未配置,请联系站点管理员' });
  }

  const state = generateState();
  const pkce = generatePKCE();

  req.session.cpoauth_state = state;
  req.session.cpoauth_verifier = pkce.verifier;
  req.session.cpoauth_link_mode = req.query.mode === 'link';

  // 注意:authorize 端点用 /oauth/authorize (Nuxt 页面),不是 /api/oauth/authorize
  const url = new URL(CP.baseUrl + '/oauth/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', CP.clientId);
  url.searchParams.set('redirect_uri', CP.redirectUri);
  url.searchParams.set('scope', CP.scope);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', pkce.challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  res.redirect(url.toString());
});

// ============ 路由 2:OAuth callback ============
app.get('/auth/cpoauth/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.render('error', { err: 'CP OAuth 授权拒绝: ' + error });
    }
    if (!code || !state) {
      return res.render('error', { err: '缺少 code 或 state 参数' });
    }
    if (state !== req.session.cpoauth_state) {
      return res.render('error', { err: 'state 校验失败(可能是 CSRF 攻击)' });
    }

    const codeVerifier = req.session.cpoauth_verifier;
    const linkMode = req.session.cpoauth_link_mode;

    // 清除 session 临时数据
    delete req.session.cpoauth_state;
    delete req.session.cpoauth_verifier;
    delete req.session.cpoauth_link_mode;

    // 换 access_token
    const tokenRes = await exchangeCode(code, codeVerifier);
    if (!tokenRes.ok) {
      return res.render('error', { err: '换取 token 失败: ' + JSON.stringify(tokenRes.data) });
    }
    const { access_token, refresh_token: rtoken } = tokenRes.data;

    // 拉 userinfo
    const infoRes = await fetchUserinfo(access_token);
    if (!infoRes.ok) {
      return res.render('error', { err: '拉取用户数据失败: ' + JSON.stringify(infoRes.data) });
    }
    const profile = infoRes.data;

    if (!profile.sub) {
      return res.render('error', { err: 'CP OAuth 返回数据缺少 sub 字段' });
    }

    // 业务分支
    const existingBinding = await getBindingBySub(profile.sub);

    // === 分支 1:该 CP OAuth 已绑定到某个 OJ 账号 → 直接登录
    if (existingBinding) {
      if (res.locals.user && res.locals.user.id !== existingBinding.user_id) {
        return res.render('error', {
          err: '此 CP OAuth 已绑定到另一个 OJ 账号'
        });
      }
      // 拉新 profile 写回(刷新数据)
      await upsertBinding(existingBinding.user_id, profile, rtoken || existingBinding.refresh_token);

      const user = await User.findById(existingBinding.user_id);
      if (!user) {
        return res.render('error', { err: '绑定的用户不存在(可能已被删除)' });
      }
      req.session.user_id = user.id;
      req.session.login = [user.username, user.password];
      return res.redirect('/');
    }

    // === 分支 2:未绑定 + 当前已登录 → 直接绑定到当前账号
    if (res.locals.user) {
      await upsertBinding(res.locals.user.id, profile, rtoken);
      return res.render('success', {
        title: 'CP OAuth 绑定成功',
        msg: '你的账号已成功绑定 CP OAuth。CP 社区资料已同步。'
      });
    }

    // === 分支 3:未绑定 + 未登录 → 跳转选择页
    req.session.cpoauth_pending = {
      sub: profile.sub,
      profile,
      refresh_token: rtoken,
      expires: Math.floor(Date.now() / 1000) + 600  // 10 分钟内必须完成选择
    };
    res.redirect('/auth/cpoauth/choose');

  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});

// ============ 路由 3:选择页 GET ============
app.get('/auth/cpoauth/choose', async (req, res) => {
  const pending = req.session.cpoauth_pending;
  if (!pending || pending.expires < Math.floor(Date.now() / 1000)) {
    return res.render('error', { err: '会话过期,请重新开始 CP OAuth 登录' });
  }
  res.render('cpoauth_choose', { profile: pending.profile });
});

// ============ 路由 4:创建新账号 POST ============
app.post('/auth/cpoauth/create', async (req, res) => {
  try {
    const pending = req.session.cpoauth_pending;
    if (!pending || pending.expires < Math.floor(Date.now() / 1000)) {
      return res.render('error', { err: '会话过期' });
    }

    let username = (req.body.username || '').trim();
    const email = (req.body.email || '').trim();
    const password = (req.body.password || '').trim();

    if (!username || !email || !password) {
      return res.render('error', { err: '用户名 / 邮箱 / 密码必填' });
    }
    if (password.length < 6) {
      return res.render('error', { err: '密码长度至少 6 字符' });
    }

    if (await User.findOne({ where: { username } })) {
      return res.render('error', { err: '用户名已存在' });
    }
    if (await User.findOne({ where: { email } })) {
      return res.render('error', { err: '邮箱已注册' });
    }

    // 注意:SYZOJ 密码加盐 md5(password + 'syzoj2_xxx')
    const user = await User.create({
      username,
      password: syzoj.utils.md5(password + 'syzoj2_xxx'),
      email,
      public_email: false,
      nickname: pending.profile.display_name || username,
      information: pending.profile.bio || '',
      is_admin: false,
      register_time: Math.floor(Date.now() / 1000),
      rating: 1500
    });
    await user.save();

    await upsertBinding(user.id, pending.profile, pending.refresh_token);
    delete req.session.cpoauth_pending;

    req.session.user_id = user.id;
    req.session.login = [user.username, user.password];

    res.redirect('/');
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});

// ============ 路由 5:绑定到现有账号 POST ============
app.post('/auth/cpoauth/link', async (req, res) => {
  try {
    const pending = req.session.cpoauth_pending;
    if (!pending || pending.expires < Math.floor(Date.now() / 1000)) {
      return res.render('error', { err: '会话过期' });
    }

    const username = (req.body.username || '').trim();
    const password = (req.body.password || '').trim();

    if (!username || !password) {
      return res.render('error', { err: '用户名和密码必填' });
    }

    const user = await User.findOne({ where: { username } });
    if (!user || user.password !== syzoj.utils.md5(password + 'syzoj2_xxx')) {
      return res.render('error', { err: '用户名或密码错误' });
    }

    const existing = await getBindingByUserId(user.id);
    if (existing && existing.cpoauth_sub !== pending.profile.sub) {
      return res.render('error', { err: '此 OJ 账号已绑定到别的 CP OAuth' });
    }

    await upsertBinding(user.id, pending.profile, pending.refresh_token);
    delete req.session.cpoauth_pending;

    req.session.user_id = user.id;
    req.session.login = [user.username, user.password];

    res.redirect('/');
  } catch (e) {
    syzoj.log(e);
    res.render('error', { err: e });
  }
});

// ============ 路由 6:解绑(已登录) ============
app.post('/auth/cpoauth/unlink', async (req, res) => {
  try {
    if (!res.locals.user) return res.send({ error: '未登录' });
    const binding = await getBindingByUserId(res.locals.user.id);
    if (!binding) return res.send({ error: '未绑定' });

    if (binding.refresh_token) {
      try {
        await revokeToken(binding.refresh_token, 'refresh_token');
      } catch (e) { syzoj.log(e); }
    }

    await deleteBinding(res.locals.user.id);
    res.send({ status: 'ok' });
  } catch (e) {
    syzoj.log(e);
    res.send({ error: String(e) });
  }
});

// ============ 路由 7:手动同步(已登录) ============
app.post('/auth/cpoauth/sync', async (req, res) => {
  try {
    if (!res.locals.user) return res.send({ error: '未登录' });
    const binding = await getBindingByUserId(res.locals.user.id);
    if (!binding) return res.send({ error: '未绑定' });
    if (!binding.refresh_token) return res.send({ error: '没有 refresh_token' });

    const tokenRes = await refreshAccessToken(binding.refresh_token);
    if (!tokenRes.ok) {
      return res.send({ error: '刷新 token 失败' });
    }
    const { access_token, refresh_token: newRtoken } = tokenRes.data;

    const infoRes = await fetchUserinfo(access_token);
    if (!infoRes.ok) {
      return res.send({ error: '拉取 userinfo 失败' });
    }

    await upsertBinding(res.locals.user.id, infoRes.data, newRtoken || binding.refresh_token);
    res.send({ status: 'ok', synced_at: Math.floor(Date.now() / 1000) });
  } catch (e) {
    syzoj.log(e);
    res.send({ error: String(e) });
  }
});

console.log('[cpoauth] routes registered');
