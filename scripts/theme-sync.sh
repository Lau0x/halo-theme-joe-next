#!/usr/bin/env bash
# theme-sync.sh —— 把本地主题源码同步到本地 Halo dev 容器
#
# 用法：
#   ./scripts/theme-sync.sh                  # 全量同步 + 自动重启 Halo（默认）
#   ./scripts/theme-sync.sh --templates      # 只同步 templates/（最常用，HTML/CSS/JS）
#   ./scripts/theme-sync.sh --settings       # 只同步 theme.yaml / settings.yaml / annotation-setting.yaml
#   ./scripts/theme-sync.sh --build-first    # 先跑 pnpm build-only 再同步（改 less/js 后用）
#   ./scripts/theme-sync.sh --no-restart     # 同步后不重启 Halo（仅改静态资源如 img 时用）
#
# 默认会 docker restart halo-joe-dev 让 Thymeleaf 模板缓存失效，约 15 秒重启完成。

set -euo pipefail

CONTAINER="halo-joe-dev"
TARGET="/root/.halo2/themes/theme-Joe3"

# 颜色
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

# 参数解析
MODE="full"
BUILD_FIRST=false
RESTART=true
for arg in "$@"; do
  case "$arg" in
    --templates) MODE="templates" ;;
    --settings) MODE="settings" ;;
    --build-first) BUILD_FIRST=true ;;
    --no-restart) RESTART=false ;;
    -h|--help)
      head -12 "$0" | tail -11 | sed 's/^# \?//'
      exit 0 ;;
    *) echo -e "${RED}未知参数: $arg${NC}"; exit 1 ;;
  esac
done

# 容器在跑吗？
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo -e "${RED}容器 ${CONTAINER} 未运行${NC}"
  echo "先跑：docker compose -f docker-compose.dev.yml up -d"
  exit 1
fi

# 可选：先构建
if $BUILD_FIRST; then
  echo -e "${YELLOW}>>> pnpm build-only${NC}"
  pnpm build-only
fi

# 确保目标目录存在
docker exec "$CONTAINER" mkdir -p "$TARGET"

copy() {
  local src="$1"
  echo -e "${GREEN}  → ${src}${NC}"
  docker cp "$src" "$CONTAINER":"$TARGET"/
}

case "$MODE" in
  templates)
    echo -e "${YELLOW}>>> 同步 templates/ 到 ${CONTAINER}:${TARGET}${NC}"
    copy templates
    ;;
  settings)
    echo -e "${YELLOW}>>> 同步配置文件${NC}"
    copy theme.yaml
    copy settings.yaml
    copy annotation-setting.yaml
    ;;
  full)
    echo -e "${YELLOW}>>> 全量同步到 ${CONTAINER}:${TARGET}${NC}"
    copy templates
    copy theme.yaml
    copy settings.yaml
    copy annotation-setting.yaml
    ;;
esac

if $RESTART; then
  echo -e "${YELLOW}>>> 重启 Halo 让 Thymeleaf 模板缓存失效（约 15s）${NC}"
  docker restart "$CONTAINER" > /dev/null
  for i in $(seq 1 12); do
    code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8090/actuator/health 2>/dev/null)
    [ "$code" = "200" ] && echo -e "${GREEN}Halo 就绪（${i}×5s）${NC}" && break
    sleep 5
  done
else
  echo -e "${YELLOW}同步完成（未重启，templates 改动可能被 Thymeleaf 缓存）${NC}"
fi
