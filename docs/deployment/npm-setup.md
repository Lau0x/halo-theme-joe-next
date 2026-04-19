# Nginx Proxy Manager · 配置指南

> 这是一份 **实战沉淀** 文档——把部署本主题时亲手踩过的坑、诊断过程、最终落地配置整理出来，给用本主题的其它博主参考。照做能直接拿到 **securityheaders.com A 评级** + **gzip 全压 + 完整的安全头**（要再进 A+ 需配 CSP，见 FAQ · 成本收益不划算，不建议）。
>
> 目标场景：NPM (Nginx Proxy Manager) 反代 Halo + 本主题。跨机部署（NPM 和 Halo 不在同一台机）或同机都适用。

## 目录

- [TL;DR · 直接上配置](#tldr--直接上配置)
- [Proxy Host 的 4 个 Tab](#proxy-host-的-4-个-tab)
  - [Details Tab](#1️⃣-details-tab--基础代理)
  - [Custom Locations Tab](#2️⃣-custom-locations-tab--安全头放这里)
  - [SSL Tab](#3️⃣-ssl-tab--强制-https--hsts)
  - [Advanced Tab (⚙️齿轮)](#4️⃣-advanced-tab-齿轮--server-级指令)
- [深坑注释 · 为什么 add_header 不能写 Advanced](#深坑注释--为什么-add_header-不能写-advanced)
- [验证清单](#验证清单)
- [常见问题 FAQ](#常见问题-faq)

---

## TL;DR · 直接上配置

需要在 NPM 的编辑界面**两个位置**各粘一段。

### Advanced Tab (⚙️齿轮) · 粘这段

```nginx
# === 基础代理设置 ===
client_body_buffer_size 512k;
proxy_read_timeout 60s;
proxy_connect_timeout 30s;
proxy_send_timeout 30s;
client_max_body_size 100m;

# === 避免 RSS / 大 CSS 响应被落盘 ===
proxy_buffers 16 32k;
proxy_buffer_size 64k;
proxy_busy_buffers_size 128k;

# === Gzip 压缩 ===
gzip on;
gzip_min_length 1K;
gzip_buffers 4 8k;
gzip_types
  text/plain text/css text/xml text/javascript
  application/javascript application/json application/xml
  application/rss+xml application/atom+xml
  image/svg+xml
  font/ttf font/otf;
gzip_comp_level 6;
gzip_proxied any;
gzip_vary on;
gzip_disable "MSIE [1-6]\.";
gzip_http_version 1.1;
gzip_static on;

# === URL alias（可选，按需保留）===
rewrite ^/rss$ /rss.xml permanent;
rewrite ^/feed$ /rss.xml permanent;
```

### Custom Locations Tab · 加一条 `/` location

| 字段 | 值 |
|---|---|
| Location | `/` |
| Scheme | `http` |
| Forward Hostname / IP | 和 Details tab 一样 |
| Forward Port | 和 Details tab 一样（Halo 通常 8090/8091） |

点这条 Location 右侧的 **⚙️齿轮（location 级 Advanced）**，粘：

```nginx
# 屏蔽 upstream (Halo) 返回的同名 header，避免和我们加的重复
proxy_hide_header X-Content-Type-Options;
proxy_hide_header X-Frame-Options;
proxy_hide_header X-XSS-Protection;
proxy_hide_header Referrer-Policy;
proxy_hide_header Strict-Transport-Security;

# 5 个安全头（HSTS 由 NPM 默认模板自动追加，不在这里加避免重复）
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
```

> ⚠️ **HSTS 这里不要加**！NPM 会在 `location /` 末尾**自动追加** HSTS，你加了会变成**两次**。详见[深坑注释](#深坑注释--为什么-add_header-不能写-advanced)。

---

## Proxy Host 的 4 个 Tab

### 1️⃣ Details Tab · 基础代理

| 字段 | 推荐值 | 为什么 |
|---|---|---|
| Domain Names | `blog.example.com` | 你的博客域名 |
| Scheme | `http` | NPM → Halo 内网通信。SSL 在 NPM 终结，后端走 http 是标准做法。开 https 反而需要 Halo 自签名证书，多此一举 |
| Forward Hostname / IP | Halo 容器所在机的 IP | 同机部署可用容器名（`blog-strapi`）；跨机用公网 IP |
| Forward Port | Halo 监听端口（通常 `8090`） | Halo 默认 8090，docker-compose 里改了就对齐 |
| Access List | `Publicly Accessible` | 博客就是让人访问的 |
| Cache Assets | **OFF** | Halo 已经给静态资源发 1 年 `Cache-Control`，浏览器会缓存；NPM 再缓存一层占磁盘、主题升级时还会留旧版本残留 |
| Block Common Exploits | **ON** | NPM 自带的基础 WAF 规则，0 成本开 |
| Websockets Support | **ON** | Halo admin 后台的实时通知 / SSE 依赖 |

### 2️⃣ Custom Locations Tab · 安全头放这里

**核心用途**：放置 `add_header` 指令。

**为什么非放这里不可** — nginx 的 `add_header` 有一个继承陷阱：

> **如果 `location` 级有任何 `add_header`，server 级所有 `add_header` 都会失效。**

NPM 在**每个 Proxy Host 的 `location /` 块里**自动塞了一行 HSTS header（NPM 模板强加的），这一行就足以吞掉你写在 Advanced Tab（server 级）里的**所有** `add_header`。所以：

- ❌ 在 Advanced Tab（server 级）写 `add_header` → **被吞掉，不生效**
- ✅ 在 Custom Locations 里建一个 `/` location，把 `add_header` 写在这个 location 的 ⚙️齿轮（location 级）里 → 生效

具体步骤：
1. Custom Locations Tab → Add Location
2. Location: `/`, Forward 信息和 Details 一致
3. 点这条 Location 旁边的 ⚙️齿轮按钮（不是右上角那个）
4. 粘上面 TL;DR 给的 location 级配置

### 3️⃣ SSL Tab · 强制 HTTPS + HSTS

| 字段 | 推荐值 | 说明 |
|---|---|---|
| SSL Certificate | `Request a new SSL Certificate` (Let's Encrypt) | NPM 自动 renew |
| Force SSL | **ON** | HTTP 自动 301 → HTTPS |
| HTTP/2 Support | **ON** | 多路复用省首屏时间 |
| HSTS Enabled | **ON** | 浏览器强制 HTTPS，防 downgrade 攻击 |
| HSTS Subdomains | 按需 | 只在你**所有** `*.你的域名` 子域都走 HTTPS 时开；博客一般 OK |
| Use a DNS Challenge | **OFF** | HTTP-01 Challenge 走 80 端口够用 |
| Email | 你的真实邮箱 | Let's Encrypt 过期提醒 |
| I Agree | **ON** | Let's Encrypt TOS |

**Advanced → Trust Upstream Forwarded Proto Headers**：**保持 OFF**。开启会信任 upstream 的 `X-Forwarded-Proto` header，有被欺骗风险。

### 4️⃣ Advanced Tab (齿轮) · server 级指令

放在这里的指令作用在**整个 Proxy Host 的 server 级**。

**可以放**：
- `gzip on` 及 `gzip_types` 等压缩配置
- `proxy_buffers` / `proxy_buffer_size` 等上游缓冲调优
- `client_max_body_size` 等请求限制
- `rewrite` URL 重写
- `proxy_read_timeout` 等超时

**不要放**：
- ❌ `add_header` —— 被 location 级继承陷阱吞掉，放 Custom Locations
- ❌ 二手从网上复制的整段配置 —— 会和 NPM 默认模板冲突

---

## 深坑注释 · 为什么 add_header 不能写 Advanced

### 真实案例

我们第一次配时，把所有 `add_header` 写在 Advanced Tab：

```nginx
# Advanced Tab (server 级)
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "..." always;
add_header Permissions-Policy "..." always;
```

保存后 `nginx -t` 通过、`docker logs` 没错误，但 **curl 实测响应里一个 header 都没有**。

### 诊断

`docker exec npm-app-1 cat /data/nginx/proxy_host/1.conf` 看合成后的实际 nginx 配置：

```nginx
server {
  # ↓ 我们 Advanced 的内容（server 级）
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;
  ...
  
  location / {
    # ↓ NPM 模板强加的 HSTS（location 级）
    add_header Strict-Transport-Security $hsts_header always;  ⚠️
    proxy_pass http://...;
  }
}
```

### 根因 · nginx add_header 继承规则

> 引自 [nginx docs](http://nginx.org/en/docs/http/ngx_http_headers_module.html)：
>
> "These directives are inherited from the previous configuration level **if and only if there are no `add_header` directives defined on the current level**."

翻译：如果当前层（这里是 `location /`）写了**任何一条** `add_header`，上层（server）的全部 `add_header` 指令会被**完全丢弃**，不会合并。

所以 NPM 那一行 HSTS 就吞掉了我们 server 级的 4 条。

### 正确做法

把 `add_header` 写到**同一个 `location /` 级别**（通过 Custom Locations Tab），和 NPM 模板加的 HSTS 在同一层，nginx 会**累加**同层同名的多条 `add_header`。

### 进阶坑 · HSTS 不能在 Custom Location Advanced 里也加一遍

NPM 会在你的 Custom Location 块**之后**自动追加一行 `add_header Strict-Transport-Security $hsts_header always;`（模板硬编码）。如果你在 Custom Location 的 ⚙️齿轮里**自己也加** HSTS，响应里会出现两次同值的 HSTS。

**所以我们的配置里 HSTS 留给 NPM 自动追加**，自己只加另外 5 个安全头。

---

## 验证清单

改完 Save 后，**在本机**（不是服务器）跑：

### 语法 & reload（在服务器上）

```bash
docker exec npm-app-1 nginx -t
# 预期：syntax is ok + test is successful + 无 duplicate warn
```

### 压缩（在本机）

```bash
# JS 压缩
curl -s -o /dev/null -D - -H 'Accept-Encoding: gzip' \
  https://你的域名/themes/theme-Joe3/assets/lib/jquery@3.5.1/jquery.min.js \
  | awk 'tolower($1)=="content-encoding:"{print}'
# 预期：content-encoding: gzip

# HTML 压缩
curl -s -o /dev/null -D - https://你的域名/ \
  | awk 'tolower($1)=="content-encoding:"{print}'
# 预期：content-encoding: gzip

# JPEG 不压缩（避免浪费 CPU）
curl -s -o /dev/null -D - -H 'Accept-Encoding: gzip' \
  https://你的域名/任意一张图.jpg \
  | awk 'tolower($1)=="content-encoding:"{print}'
# 预期：（空，jpg 已压缩过）
```

### 安全头（在本机）

```bash
curl -s -o /dev/null -D - https://你的域名/ \
  | grep -iE "^(strict|x-frame|referrer|permissions|x-content|x-xss)"
# 预期 6 行，每个 header 各出现一次：
#   x-content-type-options: nosniff
#   x-frame-options: SAMEORIGIN
#   x-xss-protection: 1; mode=block
#   referrer-policy: strict-origin-when-cross-origin
#   permissions-policy: camera=(), microphone=(), geolocation=()
#   strict-transport-security: max-age=63072000;includeSubDomains; preload
```

### 综合评分

[securityheaders.com](https://securityheaders.com/) 输入你的域名扫一下，预期 **A**。

> 🎯 **为什么不是 A+？** A+ 的硬门槛是 **Content-Security-Policy**。Halo 主题有大量第三方 CDN（jsdelivr、心知天气、umami、waline、busuanzi）和 inline script，配 CSP 成本高 / 风险大（配错白屏），**对一个博客 A 评级完全够用**。想折腾 A+ 看下方 FAQ。

---

## 常见问题 FAQ

### Q · 为什么 `curl -I` 看不到 gzip，但 `curl` 能看到？

openresty / NPM 对 `HEAD` 请求的默认返回可能是 `application/problem+json`（特别是 `/` 路径的健康检查）。**用 `curl -s -o /dev/null -D -`（GET + dump headers）测更准**。

### Q · 改完配置，Save 按钮没反应 / 502

先 `docker exec npm-app-1 nginx -t`。如果有 `[emerg]` 错误，nginx 会直接拒绝 reload，旧配置还在跑（不影响现状），但你 UI 的变更没生效。按报错行号修。

### Q · 主题升级后头像挂架显示文字 "挂架"？

和 NPM 无关，是主题 Bug（已修）。升级到 `v1.5.1-next.4` 及以上即可。

### Q · 为什么不要开 brotli？

openresty 官方镜像默认**没有编译 ngx_brotli 模块**。gzip 对文本已经能压到 70%+，brotli 多省 15%。想上 brotli 需要换支持的镜像（如 `zoeyvid/nginx-proxy-manager`），**不值当**。

### Q · `client_max_body_size 100m` 够吗？

- Halo 默认 **50 MB** 附件上限
- 100m 留一倍冗余，够用
- 如果你会传 800MB 视频附件（v1.3.0+ 支持），调到 `800m`

### Q · URL 重写 `rewrite ^/(.*)/$ /$1 permanent;` 要加吗？

**不推荐**。Halo 自己会返回规范化 URL + `rel="canonical"` meta，不需要 nginx 强制去斜杠。强制反而可能把 POST API（带斜杠）降级为 GET，坏事。

### Q · 想拿 securityheaders.com A+ 怎么办？

A+ 的硬门槛是 **Content-Security-Policy**。Halo 主题架构下配 CSP 非常头疼——

**会炸的点**：
- Thymeleaf 模板大量 inline `<script>`（主题初始化逻辑）→ 需要 `'unsafe-inline'` 或 nonce
- 第三方 CDN 一堆：`cdn.jsdelivr.net`（LXGW 字体、waline）、`api.seniverse.com`（心知天气）、`umami.*`（统计）、`busuanzi` JSONP、`unpkg.com`（emoji）
- Waline / 评论组件动态注入资源
- 用户代码注入也可能加 CDN

**折腾 A+ 的正确姿势**（有耐心再搞）：

1. 先在 Custom Location `/` 的 Advanced 里加 **Report-Only**（只报告不拦截）：
   ```nginx
   add_header Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://*.seniverse.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https:; font-src 'self' data: https://cdn.jsdelivr.net; connect-src 'self' https://*.seniverse.com https://umami.*; frame-ancestors 'self';" always;
   ```
2. 刷 1-2 周，观察浏览器 console 的 CSP violation 报告，逐个加白名单
3. 收敛稳定后去掉 `-Report-Only` 后缀，改成正式 `Content-Security-Policy`
4. 重扫 securityheaders.com → A+

**但说实话**：github.com 自己都是 A 级。博客拿 A 完全够——CSP 对抗的是 XSS，而 Halo 本身有严格的内容过滤。**ROI 很低，不建议为了多一个加号折腾**。

### Q · HSTS preload 要不要去 hstspreload.org 提交？

⚠️ **提交前想清楚**：preload 是**单向不可逆**的。一旦提交生效，**你域名永远只能走 HTTPS**（Chrome/Firefox 内置 list 撤销周期 6+ 个月）。如果将来你不玩博客了 / 换域名，都得等回收。

除非你**100% 确信**这个域名永远不会走 HTTP，否则**别提交**。NPM 自动加的 `preload` 关键字只是信号位，未提交前不影响用户。

---

## 参考

- [NPM 官方文档](https://nginxproxymanager.com/guide/)
- [nginx add_header 继承规则](http://nginx.org/en/docs/http/ngx_http_headers_module.html)
- [securityheaders.com · 扫你的站](https://securityheaders.com/)
- [hstspreload.org · 慎用](https://hstspreload.org/)

有问题欢迎 [提 issue](https://github.com/Lau0x/halo-theme-joe-next/issues/new)。
