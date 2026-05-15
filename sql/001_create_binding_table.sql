-- syzoj-cpoauth-plugin: 创建 CP OAuth 绑定表
-- 兼容 MySQL 5.7+ / MariaDB 10.3+
-- 字符集: utf8mb4 / utf8mb4_unicode_ci

CREATE TABLE IF NOT EXISTS user_cpoauth_binding (
  id INT AUTO_INCREMENT PRIMARY KEY,

  -- SYZOJ 用户表的外键(逻辑外键,不建 FK 约束,避免循环依赖)
  user_id INT NOT NULL,

  -- CP OAuth 提供方返回的全局唯一标识(OIDC sub claim)
  cpoauth_sub VARCHAR(128) NOT NULL,

  -- CP OAuth 用户名(可空,某些 provider 不提供)
  cpoauth_username VARCHAR(128) DEFAULT NULL,

  -- CP OAuth 显示名
  display_name VARCHAR(128) DEFAULT NULL,

  -- 头像 URL
  avatar_url VARCHAR(512) DEFAULT NULL,

  -- 个人简介
  bio TEXT DEFAULT NULL,

  -- 关联平台资料(JSON,如 [{platform, platformUid, platformUsername}, ...])
  cp_summary JSON DEFAULT NULL,

  -- refresh_token(用于后续同步;若 OAuth provider 不返回则为 NULL)
  refresh_token VARCHAR(1024) DEFAULT NULL,

  -- 首次绑定时间(unix timestamp)
  linked_at INT NOT NULL,

  -- 上次同步成功时间(unix timestamp)
  last_synced_at INT DEFAULT NULL,

  -- 一个 SYZOJ 用户只能绑定一个 CP OAuth 账号
  UNIQUE KEY uq_user (user_id),

  -- 一个 CP OAuth 账号只能绑定一个 SYZOJ 用户(防止冒用)
  UNIQUE KEY uq_sub (cpoauth_sub),

  -- 加速查找
  KEY idx_user (user_id),
  KEY idx_sub (cpoauth_sub)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
