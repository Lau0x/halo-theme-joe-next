# Changelog

本文件记录 **Theme Joe3 Next** 所有值得用户感知的变更。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。

> 📎 **升级安全承诺**：所有版本的 `metadata.name` / `settingName` / `configMapName` 与上游 Joe3 一致。在 Halo Console 直接上传新 zip 即可原地覆盖，后台配置（博主信息、Waline Token、颜色等）不会丢。

---

## [Unreleased]

未发布（main 分支当前状态）。下一个 tag 预计继续走 `v1.5.1-next.X` 线，直到 [TODO.md 中 v1.6.0 的前置条件](TODO.md#-发布里程碑--v160-稳定正式版) 全部满足，才切正式版 `v1.6.0`。

### Added
- 社区治理三件套：`CONTRIBUTING.md` / `CODE_OF_CONDUCT.md`（Contributor Covenant 2.1）/ `.github/dependabot.yml`（npm 周扫 + GitHub Actions 月扫）
- `docs/deployment/npm-setup.md` · Nginx Proxy Manager 反代配置指南（gzip / 安全头 / HSTS / `add_header` 继承陷阱深剖）

### Fixed
- **图库页顺序错乱**：`IntersectionObserver` 复用单例防 leak、layout debounce 80ms 防抖动、isotope `sortBy='original-order'` 锚定后端迭代顺序（refs [upstream#353](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/353) 图片顺序部分）

### Changed
- 文档中 securityheaders.com 评级从 "A+" 修正为实际的 "A"（A+ 需配 CSP，Halo 主题架构下成本高，已在 FAQ 说明可选升级路径）

### Routed out
- upstream#353 搜索不能打空格：非主题层问题（走 Halo 官方 `plugin-search-widget`，主题内相关代码已注释），建议去插件仓库报

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
