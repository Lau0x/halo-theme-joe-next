# TODO · Roadmap

> 本 roadmap 汇总了接棒后的待办事项，来源三处：**upstream open issues** / **代码审计** / **接棒后自加的增强**。优先级按 P0（阻塞 bug，先修）→ P1（高价值 feature / 已知痛点）→ P2（优化项）→ P3（长期理想）。

## 🔴 P0 · Bug 修复（上游遗留，接棒首要任务）

| # | 来源 | 标题 | 备注 |
|---|---|---|---|
| 1 | [upstream #389](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/389) ⭐ | 博主栏背景图输入链接无效 | **作者已提供完整修复代码**（blogger.html），直接 apply 即可 |
| 2 | [upstream #369](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/369) | 代码块复制按钮失效 | 需排查 clipboard API 调用 |
| 3 | [upstream #368](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/368) | 暗黑模式的背景图设置不生效 | CSS 选择器问题 |
| 4 | [upstream #367](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/367) | 博主头像不更新（缓存） | 加 cache-busting query string |
| 5 | [upstream #361](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/361) | 点图片查看也会增加阅读量 | 图片点击事件误触发阅读计数 |
| 6a | [upstream #353](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/353) 拆分 A | ~~搜索框不能打空格~~ | ⚠️ **不在主题层**：搜索走 Halo 官方 `plugin-search-widget` 插件，主题 `common.js` 的搜索 handler 已全被注释。用户应到 [plugin-search-widget issues](https://github.com/halo-sigs/plugin-search-widget/issues) 报告 |
| 6b | [upstream #353](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/353) 拆分 B | 图片顺序错乱（图库页） | ✅ **已做防御性加固**（photos.js v2 + photos.html data-order）：Observer 复用、layout debounce、isotope sortBy 锚定后端顺序。若仍有具体顺序问题需用户提供复现截图 |
| 7 | [upstream #365](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/365) / [#366](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/366) | 百度收录 API 证书过期导致页面报错 | 直接移除百度推送或换 HTTPS 备用端点 |
| 8 | [upstream #371](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/371) | busuanzi 访客统计服务报错 | 加 try/catch 兜底或移除依赖 |
| 9 | [upstream #363](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/363) | 控制台报错 | 要看具体是哪些 |
| 10 | [upstream #380](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/380) | 标题文字阴影渲染不对 | CSS text-shadow 调 |
| 11 | [upstream #351](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/351) | Waline 路由跳转 BUG | Waline 评论插件配合问题 |

## 🟡 P1 · 已知高价值 feature（用户呼声高）

| # | 来源 | 标题 | 备注 |
|---|---|---|---|
| 1 | [upstream #362](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/362) ⭐ | 支持 LXGW WenKai 霞鹜文楷字体 | my-blog 项目已实现过，有现成 SOP |
| 2 | 自加 | **全面的暗色/亮色主题切换**（含代码高亮双主题） | my-blog 刚做过，可直接迁移方案 |
| 3 | [upstream #360](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/360) | 允许修改文章页底部信息 | 加 settings.yaml 可配置项 |
| 4 | [upstream #348](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/348) | 友情链接页面管理 | 配合 halo-sigs/plugin-links |
| 5 | [upstream #358](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/358) | 增加分享渠道 | X / Telegram / Mastodon 等 |
| 6 | [upstream #381](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/381) | 相册页面选项 | 分页 / 全部 切换 |

## 🟢 P2 · 代码质量 / 工程化（接棒维护者的长期负债清理）

| # | 发现来源 | 项 | 说明 |
|---|---|---|---|
| 1 | 代码审计 | `templates/modules/config.html:389` **硬编码** `'%cTheme By Jiewen \| 版本 V' + ThemeConfig.version` | 控制台输出硬编码作者和版本，应改为从 `theme.yaml` 动态读取 或删掉 credit 放到代码注释 |
| 2 | 代码审计 | ~~`.gitignore` 已忽略 `templates/assets/{css,js}/min/` 但这些文件**仍被 git tracked**~~ | ✅ **已完成**（fork-bootstrap 阶段一并清理，`git ls-files` 返回 0；构建产物现由 CI 生成、不入库） |
| 3 | 代码审计 | jQuery 版本 3.5.1（2020）过时，最新是 3.7.1 | 升级到 3.7.1，或评估是否能**完全移除 jQuery** 改用原生 DOM |
| 4 | 代码审计 | `templates/assets/` 总体 35MB，`lib/` 目录下有 DPlayer / APlayer / 各种 polyfill | 审计实际用到哪些，裁掉未使用的 lib |
| 5 | 自加 | 缺少 GitHub Actions CI | 每次 push 自动 `pnpm build` + 上传 zip artifact |
| 6 | 自加 | 缺少 Release workflow | 打 tag 时自动发 GH Release + 上传 theme zip |
| 7 | 自加 | 缺少 `CONTRIBUTING.md` / `CODE_OF_CONDUCT.md` | 接棒维护者应有的社区治理文件 |
| 8 | 自加 | 缺少 Dependabot / Renovate | 自动提 PR 升级依赖 |
| 9 | 自加 | `docs/` 目录空着 | 整理使用文档（替代原作者分散在多个 jiewen.run/archives 的文章） |

## 🔵 P3 · 长期理想（不急，但想过）

| # | 项 | 为什么想做 |
|---|---|---|
| 0 | 注册 Halo 官方应用市场 发布 Joe3 Next | 现在用户只能靠 Watch GH 手动升级；发到 halo.run/store 后后台会推送升级提示。需要在 halo.run/developers 注册账号 + 提交审核获得新的 app-id（绝**不能**复用原作者的 app-ZxiPb） |
| 1 | [upstream #364](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/364) pjax 支持 | 页面切换不刷新，提升体验，但对 Thymeleaf 主题改造大 |
| 2 | [upstream #339](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/339) 中英切换 | 配合 Halo 国际化做 |
| 3 | 自加 SEO meta 自动化（og:description / twitter:card / JSON-LD） | 博主维护者不用手动填每篇文章 meta |
| 4 | 自加 首屏性能优化（关键 CSS inline + 延迟加载非首屏 JS） | Lighthouse 性能分 |
| 5 | 自加 无障碍（a11y）审计 | 目前主题对屏幕阅读器支持有限 |

## 🧭 建议的实施顺序

**Sprint 1（1-2 天可完成）**：
1. P0.1 #389 直接 apply 作者已有 fix → 第一个 PR，证明"接棒"可信
2. P2.1 删掉或动态化 `Theme By Jiewen` 硬编码
3. P2.2 清理 `templates/assets/min/` git 追踪
4. P2.5 加 CI workflow（每次 push 自动 build）
5. P2.6 Release workflow（打 tag 自动出 GH release）

**Sprint 2（后续 feat）**：
6. P1.2 暗色/亮色主题切换（高价值 + 已有 SOP）
7. P1.1 LXGW WenKai 字体支持
8. P0 其余 bug 逐个啃

**Sprint 3+**：按 issue 互动量 / 社区反馈再排序。

---

## 🎯 发布里程碑 · v1.6.0 稳定正式版

所有 `v1.5.1-next.X` 都是 pre-release（开发迭代版本）。下一个 tag **不带 `-` 后缀**的 release 将是第一个**正式稳定版**（GitHub "Latest release" 指向它）。

**版本号选择**：`v1.6.0`
- 不用 `v1.5.1`（避免和上游未来 patch 撞号）
- 不用 `v2.0.0`（无 breaking change，不是大版本）

**发布 v1.6.0 的前置条件**（全部满足才发）：

- [ ] 至少 1 个 `-next.X` 版本在生产（blog.laoda.de）稳定跑 1 周无 critical bug
- [ ] P0 剩余 bug 清完：`#380` 标题阴影、`#353` 搜索空格 + 图片顺序错乱
- [ ] Sprint 3 主要优化完成：主题层性能（CSS 拆分 + JS defer）、a11y 系统修
- [ ] 更新 README 顶部 badge 从 pre-release 示例切到正式版
- [ ] 至少 2 名社区用户（除 maintainer 外）装过并报告无问题
- [ ] 写一份正式的 `CHANGELOG.md`（整合所有 `-next.X` 的变更）

**发布命令**（条件全满足后）：
```bash
git tag -a v1.6.0 -m "## 🎉 Joe3 Next 第一个正式稳定版
...亮点..."
git push origin v1.6.0
```

---

> 📝 **开发流程**（参考 README）：
> 1. `docker compose -f docker-compose.dev.yml up -d` —— 起本地 Halo
> 2. 改代码
> 3. `pnpm build-only`（仅改 less/js 时）
> 4. `./scripts/theme-sync.sh` —— 推到容器
> 5. 前台刷新验证
>
> 📎 **原仓库链接**：https://github.com/jiewenhuang/halo-theme-joe3.0 （upstream，已作为 git remote 保留）
