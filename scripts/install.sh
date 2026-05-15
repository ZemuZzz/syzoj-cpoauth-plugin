#!/usr/bin/env bash
# syzoj-cpoauth-plugin 一键安装脚本
#
# 用法:
#   cd <your SYZOJ docker-compose 目录>
#   git clone https://github.com/<you>/syzoj-cpoauth-plugin
#   bash syzoj-cpoauth-plugin/scripts/install.sh
#
# 脚本会:
#   1. 校验环境(docker-compose / mariadb / 必要环境变量)
#   2. 在 DB 建 user_cpoauth_binding 表
#   3. 打印 docker-compose.yml 应该加的 volumes 片段(不自动改)
#   4. 提示用户手动改 login.ejs / sign_up.ejs / user.ejs / user.js (3 行 include + 1 段代码注入)
#
# 注意:本脚本不会自动改你的 docker-compose.yml,因为不知道你的 service 名和缩进格式

set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PLUGIN_ROOT="$( dirname "$SCRIPT_DIR" )"
SQL_FILE="$PLUGIN_ROOT/sql/001_create_binding_table.sql"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== syzoj-cpoauth-plugin 安装 ===${NC}"
echo

# ============ Step 1: 校验 ============
echo -e "${GREEN}[1/4] 校验环境...${NC}"

if ! command -v docker &> /dev/null; then
  echo -e "${RED}错误: docker 未安装${NC}"; exit 1
fi

if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then
  echo -e "${RED}错误: docker compose 未安装${NC}"; exit 1
fi

# 让用户选 mariadb 容器名
echo -n "请输入你的 MariaDB/MySQL 容器名称(例如 myoj-mariadb-1): "
read DB_CONTAINER
if [ -z "$DB_CONTAINER" ]; then
  echo -e "${RED}错误: 容器名不能为空${NC}"; exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  echo -e "${RED}错误: 容器 $DB_CONTAINER 未运行${NC}"; exit 1
fi

echo -n "请输入 MariaDB root 密码(回车跳过=root 用户无密码): "
read -s DB_PASSWORD
echo
if [ -n "$DB_PASSWORD" ]; then
  DB_AUTH="-u root -p$DB_PASSWORD"
else
  DB_AUTH="-u root"
fi

echo -n "请输入 SYZOJ 数据库名(默认 syzoj): "
read DB_NAME
DB_NAME=${DB_NAME:-syzoj}

# ============ Step 2: 建表 ============
echo
echo -e "${GREEN}[2/4] 在 $DB_NAME 数据库建表...${NC}"

docker exec -i "$DB_CONTAINER" mariadb $DB_AUTH "$DB_NAME" < "$SQL_FILE"

# 校验
RESULT=$(docker exec -i "$DB_CONTAINER" mariadb $DB_AUTH "$DB_NAME" -e "SHOW TABLES LIKE 'user_cpoauth_binding';")
if echo "$RESULT" | grep -q "user_cpoauth_binding"; then
  echo -e "${GREEN}  ✓ user_cpoauth_binding 表已创建${NC}"
else
  echo -e "${RED}  ✗ 建表失败,请手动检查${NC}"
  exit 1
fi

# ============ Step 3: 打印 docker-compose.yml 应该加的内容 ============
echo
echo -e "${GREEN}[3/4] 接下来需要手动改 docker-compose.yml${NC}"
echo
echo "请把下面的 volumes 加到 web 服务里(参考 examples/docker-compose.snippet.yml):"
echo -e "${YELLOW}"
cat <<'EOF'
    volumes:
      - ./syzoj-cpoauth-plugin/plugin/modules/cpoauth.js:/app/modules/cpoauth.js:ro
      - ./syzoj-cpoauth-plugin/plugin/views/cpoauth_choose.ejs:/app/views/cpoauth_choose.ejs:ro
      - ./syzoj-cpoauth-plugin/plugin/views/_cpoauth_login_button.ejs:/app/views/_cpoauth_login_button.ejs:ro
      - ./syzoj-cpoauth-plugin/plugin/views/_cpoauth_profile_card.ejs:/app/views/_cpoauth_profile_card.ejs:ro

    environment:
      SYZOJ_WEB_CPOAUTH_CLIENT_ID: "你的-client-id"
      SYZOJ_WEB_CPOAUTH_CLIENT_SECRET: "你的-client-secret"
      SYZOJ_WEB_CPOAUTH_BASE_URL: "https://cpoauth.com"
      SYZOJ_WEB_CPOAUTH_REDIRECT_URI: "https://your-oj.example.com/auth/cpoauth/callback"
      SYZOJ_WEB_CPOAUTH_SCOPE: "openid profile cp:linked"
EOF
echo -e "${NC}"

# ============ Step 4: 提示 view/module 改动 ============
echo
echo -e "${GREEN}[4/4] 还需要改 4 处 SYZOJ 现有文件:${NC}"
echo
echo "  1. views/login.ejs 加一行 include:"
echo "     <% include _cpoauth_login_button %>"
echo "     详见: integration/login_integration.md"
echo
echo "  2. views/sign_up.ejs 加一行 include:"
echo "     <% include _cpoauth_login_button %>"
echo "     详见: integration/sign_up_integration.md"
echo
echo "  3. views/user.ejs 加一行 include:"
echo "     <% include _cpoauth_profile_card %>"
echo "     详见: integration/user_view_integration.md"
echo
echo "  4. modules/user.js 在 GET /user/:id 的 res.render 前注入 binding 数据"
echo "     详见: integration/user_module_integration.md"
echo
echo -e "${GREEN}完成 4 处改动后,重启 SYZOJ 容器:${NC}"
echo "    docker compose up -d --force-recreate web"
echo
echo -e "${GREEN}=== 安装步骤已显示完毕 ===${NC}"
echo -e "${YELLOW}注意:本脚本不会自动改你的 SYZOJ 源代码(避免破坏现有 patch)${NC}"
echo -e "${YELLOW}请按 integration/*.md 手动改 4 处${NC}"
