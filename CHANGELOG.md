# Changelog

本文件记录 **Theme Joe3 Next** 所有值得用户感知的变更。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。

> 📎 **升级安全承诺**：所有版本的 `metadata.name` / `settingName` / `configMapName` 与上游 Joe3 一致。在 Halo Console 直接上传新 zip 即可原地覆盖，后台配置（博主信息、Waline Token、颜色等）不会丢。

---

## [Unreleased]

未发布（main 分支当前状态）。

---

## [1.5.1-next.10] · 2026-04-20 · canonical / og:url 文章级 URL 修正

### Fixed
- **canonical + og:url 指向修正**：文章页的 `<link rel="canonical">` 和 `<meta property="og:url">` 以前**永远指向站点根**（`site.url`），不是文章 URL。这会导致：
  - Google SEO 可能因 canonical 互指不一致**降低文章页排名**
  - 分享到 Facebook / LinkedIn 时卡片点击可能跳到站点首页而非文章
  - Google Search Console 报 "Duplicate content" 警告

  **修复**：统一抽出 `pageUrl` 变量，文章页 = `site.url + post.status.permalink`，其它页 = `site.url`。顺带做双斜杠 guard（site.url 带尾 `/` 时先剥掉再拼）。`canonical` / `og:url` / 模板其它位置引用都走这个变量。
- **`<meta name="description">` 也跟随文章化**：和 og:description 同步，文章页用 `post.status.excerpt`，其它页用 `site.seo.description`

### Known caveat · Halo 核心双重 canonical
`<halo:head>` 注入点 Halo 2.x 核心会**额外输出** 一个指向 `site.url` 的 canonical（固定 4 空格缩进，非主题控制）。因此文章页 HTML 里会同时有：
- 主题输出的 canonical（href = 文章 URL，先出现）
- Halo 核心注入的 canonical（href = 站点根，后出现）

按 Google [官方文档](https://developers.google.com/search/docs/crawling-indexing/consolidated-duplicate-urls)，同页多个 canonical 时以 **文档顺序第一个** 为准——主题的 canonical 在前，所以 SEO 实际行为正确。但严格洁癖的 HTML validator 可能报 warning。这是 Halo 核心行为，主题层无法消除。独立 issue 可追踪 Halo 上游。

### 验证
本地 Halo 2.24 dev · theme-sync + curl：
- 首页 canonical = `http://localhost:8090/` ✅
- 首页 og:url = `http://localhost:8090/` ✅
- 文章页 canonical = `http://localhost:8090/archives/lisa-host` ✅
- 文章页 og:url = `http://localhost:8090/archives/lisa-host` ✅

---

## [1.5.1-next.9] · 2026-04-20 · 文章页扩展侧边栏 widget

### Added
- **文章页侧边栏支持扩展 widget 数组**（closes [upstream#360](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/360) P1.3 / Q4）
  - 「**主题 → 侧边栏**」配置下新增 **文章页扩展侧边栏 widget** array repeater
  - 支持和非文章页完全相同的 10 种 widget 类型：博主信息 / 公告 / 打赏 / 图片 / 音乐播放器 / 最新文章 / 热门文章 / 人生倒计时 / 最新评论 / 标签云 / 分类云 / **侧边栏广告** / 自定义 HTML
  - **不替换现有硬编码**：博主信息卡 / TOC / 相关文章 / 原有广告位全保留，新 widget **追加在它们下方**
  - **默认 `value: []`（空）**：老用户升级后视觉完全一致；想扩展再去后台加
  - 典型用法：在现有硬编码后再插 2-3 个广告位 / 公告 / 自定义 promo / 打赏入口

### 设计说明
- 不做 "array 替代硬编码" 的大重构，保守选 "硬编码 + 追加 array" 的最小侵入方案，降低回归风险
- 未来重构空间：aside.html 和 aside_post.html 的 `th:switch` 块可抽成 `~{modules/widgets/asideWidget :: render_item(aside)}` fragment 消除代码重复

### 验证
- 本地 Halo 2.24 dev theme-sync + curl 文章页：默认空配置下 `.joe_aside__item` 仅有 `author` + `newest`（博主信息 + 相关文章），零视觉变化 ✅

---

## [1.5.1-next.8] · 2026-04-20 · Google AdSense Auto Ads 集成

### Added
- **Google AdSense Auto Ads 原生支持**（refs Q3）：
  - `ads` 配置组新增 **`enable_adsense`** 开关 + **`adsense_client_id`** 文本框（后台填 `ca-pub-XXXXXXXXXXXXXXXX`）
  - `layout.html` 条件注入 **async 主脚本** + **preconnect / preconnect-doubleclick** 加速首次连接
  - `joe-next-overrides.less` 加 `ins.adsbygoogle` 样式：圆角 + 边距 + `min-height: 90px` 防 CLS 抖动 + 暗色模式背景适配 + 文章正文内 32px 上下 margin 保护阅读
  - **Auto Ads 模式**：位置 / 密度 / lazy-load 由 Google 算法决定（在 AdSense 后台 "Auto ads" 配置里可选"仅侧边栏/文章内"等类型）；主题侧不硬编码位置，保持灵活性

### 使用方式

1. 去 AdSense 后台拿你的 publisher ID（`ca-pub-XXXXXXXXXXXXXXXX`）
2. Halo Console → 外观 → 主题 → 设置 → **广告** → 勾选「开启 Google AdSense」→ 填入 publisher ID → 保存
3. 去 [AdSense → Ads → By site](https://www.google.com/adsense/new/u/0/pub-XXXX/myads/sites) 打开 **Auto ads** 并关联博客域名
4. 前台刷新 → 等 Google 爬虫扫页面（几分钟到几小时）→ 自动开始展示广告

### 加载行为

- **零开销 · 未启用时**：`enable_adsense=false` 或 `client_id 为空` 都不输出任何 AdSense 相关 `<script>` / `<link>`（本地已验证）
- **启用后**：`<script async>` 异步加载不阻塞渲染；DNS/TLS 提前 `preconnect`；Google 端自动 lazy-load（按视口加载广告单元）

### Notes
- **不硬编码 publisher ID**：每个使用本主题的博主自己填自己的 ID
- **想严格控制位置 / 指定 slot**：Auto Ads 下位置由 Google 决定。若要手动指定 slot（文章顶 / 底 / 侧边栏具体 Ad Unit），走独立 PR 扩展（暂未实现）

---

## [1.5.1-next.7] · 2026-04-20 · Footer 署名 + 社交分享 OG 动态化

### Added
- **文章页 OG / Twitter Card 动态化**（refs Q5 Telegram 分享预览优化）：
  - `og:image` / `twitter:image` · 文章页用 `post.spec.cover`（文章封面大图），其它页继续用 `site.favicon`
  - `og:description` / `twitter:description` · 文章页用 `post.status.excerpt`（文章摘要），其它页用 `site.seo.description`
  - `og:type` · 文章页为 `article`，其它页为 `website`
  - **效果**：分享文章到 Telegram / X / Facebook / WeChat，现在显示文章封面大图 + 真实摘要，而不是站点小 favicon + 笼统介绍
- **生产验证**：本地 theme-sync 至 Halo 2.24 dev 实例，curl 首页 + 真实文章页，确认 og:image / og:description 按预期区分，`post != null` 短路 null-safe

### Changed
- **Footer Theme by 署名** · 从硬编码 "M酷&Jiewen" 改为 "Jiewen & 咕咕"（接棒者身份 + 符合 CC BY-NC-SA attribution 要求）

---

## [1.5.1-next.6] · 2026-04-20 · 🚨 Critical Hotfix

### Fixed (Critical)
- **🔥 回退 jQuery defer**，修复 v1.5.1-next.5 引入的**全站 JS 崩溃**

  **现象**：升级到 next.5 后，**留言板（便利贴）** / **图库懒加载** / **代码复制** 等所有依赖 jQuery 的主题交互全部失效，console 报 `$ is not defined`

  **根因**：next.5 给 `<head>` 里的 jQuery 加 `defer` 是错误决策。按 HTML5 规范：
  - `<body>` 内的普通 `<script src>` 在 HTML parser 到达时**立即同步执行**
  - `<head>` 内的 `<script defer>` 延迟到 **HTML parse 完成后** 执行
  - **因此**：`tail.html` 里的 `common.min.js` / `journals.min.js` / `photos.min.js` 等 body script 永远**早于** defer 的 jQuery 执行，导致全面 `ReferenceError`
  - 之前的 commit message 里写 "body JS 在 jQuery 之后加载" 是对 defer 时序的**错误理解**

  **修复**：移除 layout.html 里 jQuery 的 `defer` 属性，恢复同步加载（牺牲 FCP 换正确性）。DOMContentLoaded guard（page_links / links）保留——对同步 jQuery 也无害，且是未来做性能优化时的正确姿势

  **未来的正确方向**（parking 到独立 PR）：若要真正优化 render-blocking，需要给 **tail.html 里所有 jQuery-dep script 统一加 defer**（fancybox / qrcode / common / index / post / journals / photos / ...），让它们和 jQuery 按 defer 顺序执行。本次 hotfix 不做这个大改造

### Recommendation
**所有 v1.5.1-next.5 用户立即升级到 next.6**。next.5 生产升级会导致主题 JS 全挂。

---

## [1.5.1-next.5] · 2026-04-19 · 🔥 密集迭代

**Sprint 3 一波流**——把 a11y / SEO / 性能 / 新 feature 一次推到位，一次升级拿齐。

### Added
- **社区治理三件套**：`CONTRIBUTING.md` / `CODE_OF_CONDUCT.md`（Contributor Covenant 2.1）/ `.github/dependabot.yml`（npm 周扫 + GitHub Actions 月扫）
- **`docs/deployment/npm-setup.md`** · Nginx Proxy Manager 反代配置指南（gzip / 安全头 / HSTS / `add_header` 继承陷阱深剖）
- **文章底部版权框可配置**（closes [upstream#360](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/360)）：
  - `enable_post_copyright` · 整体开关
  - `copyright_owner_override` · 覆盖版权归属显示名（默认用贡献者昵称）
  - `copyright_owner_url` · 版权归属链接（可指向作者主页）
- **海外分享渠道**（closes [upstream#358](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/358)）：
  - `enable_share_x` · X (Twitter) 分享按钮
  - `enable_share_telegram` · Telegram 分享按钮
  - 默认关闭，面向海外读者的博主按需开启
- **SEO meta 补齐**：`<meta name="description">` / `<link rel="canonical">` / `<meta name="theme-color">` / Twitter Card 完整（summary_large_image + title/desc/image）
- **a11y 覆盖**：所有 `<img>` 补齐 `alt`（覆盖率 91% → 100%），icon 按钮补 `aria-label`（搜索 / 分享按钮），loading 容器加 `role="status"`

### Fixed
- **🎨 图库页顺序错乱**（refs [upstream#353](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/353) 图片顺序部分）：
  - `IntersectionObserver` 复用单例防 leak（之前每次分页新建 observer）
  - Layout debounce 80ms 合并（之前每张图 onload 都独立 layout 引发抖动）
  - isotope 加 `sortBy='original-order'`，`data-order` 锚定后端迭代顺序，跨页 append 不再错乱
- **🚀 jQuery defer**：layout.html 里 jQuery 不再 render-blocking。FCP（首次内容绘制）在慢网环境预计有改善；body 内两处 inline `$()` 调用（page_links / links）已加 `DOMContentLoaded` guard 保证依赖顺序

### Changed
- 文档中 securityheaders.com 评级从 "A+" 修正为实际的 "A"（A+ 需配 CSP，Halo 主题架构下成本高；`docs/deployment/npm-setup.md` FAQ 新增「想拿 A+ 怎么办」的 Report-Only 渐进路径）
- `custom.js` · 19 处 `JoeReadLimited` 业务调试 `console.log` 全部注释（保留 3 处 `console.warn` 真警告）；`main.js`+`journals.js` 残留 log 清理；5 处 catch 的 `console.log(err)` 改 `console.error(err)` 语义正确

### Routed out
- **upstream#353 搜索不能打空格** · 非主题层：走 Halo 官方 `plugin-search-widget` 插件，主题 `common.js` 内相关代码已注释；建议去 [plugin-search-widget issues](https://github.com/halo-sigs/plugin-search-widget/issues) 报告
- **upstream#380 标题阴影 / upstream#351 Waline 路由 / upstream#363 控制台报错** · 🅿️ **Parking**：issue 描述过简、无复现路径，需用户提供具体截图 + 环境才能精修。不阻塞 v1.6.0 发布

### Chore
- TODO.md 同步：P2.2（min/ git 追踪）/ P2.5-P2.9（CI / COC / docs）全部标 ✅；v1.6.0 milestone 的 gate 与现状对齐
- lib audit 已出（~284 KB 高可信度 0 引用 candidate：jquery-ui / packery / jquery-pjax / jquery-toc），删除动作独立 PR `chore/unused-libs`，需生产验证后再做

---

## [1.5.1-next.4] · 2026-04-19

### Added
- **首页 `<h1>`** · SEO 合规，视觉隐藏（`.sr-only`）不影响布局
- **图片宽度默认分级**：`.full` / 默认 60% / `.special-30` / `.special-15`，含 768px 断点响应式
- Release workflow 支持读取 annotated tag 内容作为 release 亮点（`git tag -a vX -m "..."` 会显示在 GitHub Release 顶部）

### Fixed
- **头像挂架 / 相框 URL** · Halo 给静态资源注入版本 query 后，`@{/path/}+'/'+var` 会被破坏成 `?v=X/frame.png`；改用 `@{/path/__${var}__.png}` 语法内联展开（closes [#6](https://github.com/Lau0x/halo-theme-joe-next/issues/6)）
- **`og:description` 元标签** · 补上缺失的 `${}` 表达式语法，之前渲染出字面量 `site.seo.description`

---

## [1.5.1-next.3] · 2026-04-19 · 🚨 Critical Fix

### Fixed (Critical)
- **🔥 移除 `store.halo.run/app-id: app-ZxiPb` 注解**：这个注解指向上游 Joe3 在 halo.run 应用市场的发布 ID。保留会导致使用本 fork 的博主在 Halo Console 看到"升级提示"，升级后安装的是上游版，**所有 fork 的修复被覆盖**——**强烈建议从 next.1/next.2 立即升级到 next.3 或更高**

### Changed
- README 新增「获取更新通知」指引（Watch → Custom → Releases）——本主题暂未登陆 Halo 应用市场，后台不会推送升级提示

### CI
- Release notes 自建 commit list（GitHub `generate_release_notes` 对 direct-to-main 无效），附升级注意事项 + 回退指南

---

## [1.5.1-next.2] · 2026-04-19

### Added
- **[LXGW WenKai（霞鹜文楷）](https://github.com/lxgw/LxgwWenKai)** 中文字体支持，从 jsDelivr CDN 按需加载（closes [upstream#362](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/362)）
- **阅读默认内置**：正文字色加深（亮 `#333` / 暗 `#c9d1d9`）、字号 16px、评论/搜索组件 CSS 变量调色——定义在 `templates/assets/css/joe-next-overrides.less`，代码注入可覆盖
- `joe-next-overrides` · 暗色模式额外覆盖：评论 widget / 搜索 widget 文字色跟上

### Fixed
- **代码复制按钮** · 没装语法高亮插件时也能用（fallback 选择器链：`.language-*` → `code` → `item.text()`，closes [upstream#369](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/369)）
- **博主头像缓存** · URL 自动带 `?v=<theme.spec.version>`，换头像立即生效（closes [upstream#367](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/367)）
- **暗色模式背景图** · 原代码用了取反的 `enable_background_light` 判断，改回 `enable_background_dark`（closes [upstream#368](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/368)）
- **百度推送** · 移除失效的 `bbchin.com` JSONP（SSL 过期），替换为 Baidu Webmaster 直接跳转链接（closes [upstream#365](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/365)/[#366](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/366)）
- **图片放大阅读量误触** · Fancybox `hash: false` + 各 gallery wrapper `data-hash="false"`（closes [upstream#361](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/361)）
- **busuanzi 访客统计** · 脚本加载失败时不再拖垮整页面，加 `onerror` 兜底隐藏 widget（closes [upstream#371](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/371)）
- **博主栏背景图** · 外部 URL 无效时回退到本地默认图，不再显示 alt 文本（closes [upstream#389](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/389)，按原作者已发布的修复方案 apply）

### Changed
- **控制台主题署名** · 从硬编码的 "Theme By Jiewen" 改为 "Theme Joe3 Next · V<version> | Original © Jiewenhuang | Maintained by Roy Leo"，动态读取 `theme.spec.version`

---

## [1.5.1-next.1] · 2026-04-19 · 🌱 Fork Bootstrap

**第一个社区接棒维护的 pre-release 版本。** 继承上游 [Jiewenhuang/halo-theme-joe3.0](https://github.com/jiewenhuang/halo-theme-joe3.0) 代码库，上游开发已暂停。

### Added
- **本地开发环境** · `docker-compose.dev.yml`（Halo 2.24 + H2） + `scripts/theme-sync.sh`（docker cp 同步 + 自动重启）
- **CI workflow** · `.github/workflows/build.yml`：push / PR 自动 `pnpm build` + 上传 zip artifact
- **Release workflow** · `.github/workflows/release.yml`：`git tag v*` + push 自动出 GitHub Release + 挂载 zip asset
- **TODO.md roadmap** · 汇总 upstream 未闭环 issues（P0-P3 分级）+ 接棒后自加项
- **文档整理** · `docs/configuration.md` 深度配置指南（Waline / 天气 / Iconfont / 阅读样式覆盖 / 本地数据导入）

### Changed
- **品牌重铸** · `displayName: Theme Joe3 Next`，维护者标注 "Roy Leo (continued from Jiewenhuang)"，homepage / repo 指向本 fork
- `metadata.name` / `settingName` / `configMapName` **保持不变**，保证原 Joe3 用户可直接在 Halo Console 原地升级覆盖
- `README.md` 精炼到 100+ 行，深度内容迁移到 `docs/`

### Fixed
- **博主背景图回退** · 外部链接无效时使用本地资源（原作者 [upstream#389](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/389) 已发布方案）

### Chore
- **构建产物不入库** · `git rm --cached -r templates/assets/{css,js}/min`，由 CI 构建生成（原仓库问题：`.gitignore` 已列但文件仍 tracked）

---

## [上游 1.5.1] 及更早

上游 Jiewenhuang/halo-theme-joe3.0 的版本历史见 [原仓库 commits](https://github.com/jiewenhuang/halo-theme-joe3.0/commits/main)。本 fork 从 **upstream `main` 2025-12-15 附近** checkout 起开始独立演进。

---

## 协议

[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) — 原作 © Jiewenhuang，fork 由 Roy Leo 继续维护。
