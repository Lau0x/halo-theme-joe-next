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

resolve_health_endpoint() {
  local port_mappings mapping bind_host host_port health_host priority
  local selected_priority=999

  port_mappings=$(docker port "$CONTAINER" 8090/tcp 2>/dev/null || true)
  PORT_MAPPINGS="$port_mappings"
  PORT_MAPPING=""
  HEALTH_HOST=""
  HOST_PORT=""

  while IFS= read -r mapping; do
    [[ "$mapping" =~ ^(\[[^]]+\]|[^:]+):([0-9]+)$ ]] || continue
    bind_host=${BASH_REMATCH[1]}
    host_port=${BASH_REMATCH[2]}
    (( 10#$host_port >= 1 && 10#$host_port <= 65535 )) || continue

    # 优先本机 IPv4、IPv4 wildcard、本机 IPv6、IPv6 wildcard，其余具体地址按 Docker 输出顺序选首个。
    case "$bind_host" in
      127.0.0.1)
        health_host="$bind_host"
        priority=10
        ;;
      0.0.0.0)
        health_host="127.0.0.1"
        priority=20
        ;;
      '[::1]')
        health_host="$bind_host"
        priority=30
        ;;
      '[::]')
        health_host="[::1]"
        priority=40
        ;;
      *)
        health_host="$bind_host"
        priority=50
        ;;
    esac

    if (( priority < selected_priority )); then
      selected_priority=$priority
      PORT_MAPPING="$mapping"
      HEALTH_HOST="$health_host"
      HOST_PORT=$((10#$host_port))
    fi
  done <<< "$port_mappings"

  [ -n "$PORT_MAPPING" ] || return 1
  HEALTH_URL="http://${HEALTH_HOST}:${HOST_PORT}/actuator/health"
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
  if ! resolve_health_endpoint; then
    echo -e "${RED}无法解析 ${CONTAINER} 的容器端口 8090 有效发布映射（端口必须为 1-65535）${NC}"
    [ -n "$PORT_MAPPINGS" ] && printf '%s\n' "$PORT_MAPPINGS"
    exit 1
  fi
  echo -e "${YELLOW}>>> 健康检查 ${CONTAINER}：${PORT_MAPPING} → ${HEALTH_URL}${NC}"
  MAX_ATTEMPTS=12
  RETRY_DELAY=5
  READY=false
  for ((i = 1; i <= MAX_ATTEMPTS; i++)); do
    code=$(curl --noproxy '*' -sS --connect-timeout 1 --max-time 2 -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || true)
    if [ "$code" = "200" ]; then
      echo -e "${GREEN}Halo 就绪：${CONTAINER} @ ${HEALTH_HOST}:${HOST_PORT}（第 ${i}/${MAX_ATTEMPTS} 次）${NC}"
      READY=true
      break
    fi
    (( i < MAX_ATTEMPTS )) && sleep "$RETRY_DELAY"
  done
  if ! $READY; then
    echo -e "${RED}Halo 健康检查超时：${CONTAINER} @ ${HEALTH_URL}${NC}"
    docker ps -a --filter "name=^/${CONTAINER}$" --format '容器={{.Names}} 状态={{.Status}} 端口={{.Ports}}'
    exit 1
  fi
else
  echo -e "${YELLOW}同步完成（未重启，templates 改动可能被 Thymeleaf 缓存）${NC}"
fi
