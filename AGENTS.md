# AGENTS.md · Theme Joe3 Next 维护交接手册

> 这份文件给 AI agent / 接棒维护者读的快速上手手册（Codex / Claude Code / 其它 LLM 通用）。
>
> - **项目对外面貌**：见 [README.md](README.md)
> - **发版完整 SOP**：见 [docs/release-sop.md](docs/release-sop.md)
> - **主题配置说明**：见 [docs/configuration.md](docs/configuration.md)
> - **NPM 反代配置**：见 [docs/deployment/npm-setup.md](docs/deployment/npm-setup.md)
> - **本文件**：项目身份 + 红线 + 踩坑速查 + 接活 SOP

---

## 1. 项目身份（30 秒看懂这是什么）

- **社区接棒 fork**——不是新项目，继承自 [jiewenhuang/halo-theme-joe3.0](https://github.com/jiewenhuang/halo-theme-joe3.0)（原作者开发已停）
- **本仓库**：[Lau0x/halo-theme-joe-next](https://github.com/Lau0x/halo-theme-joe-next)
- **维护者**：Roy Leo / 咕咕（GitHub: `Lau0x`）
- **License**：CC BY-NC-SA 4.0（viral · 与上游一致）
- **生产参考站**：见 README.md 顶部链接（截图即实站）
- **技术栈**：Halo 2.x（Spring Boot WebFlux + Thymeleaf + R2DBC）· jQuery 3.7.1 · less · rolldown build · pnpm 10.x

## 2. 当前状态（最后更新：2026-05-15）

- **最新 stable**：`v1.6.11.6`（2026-05-15）
- **近期 sprint 焦点**：评论 widget 主题适配 + Open Graph 分享优化（v1.6.11.4 / .5 / .6）
- **维护者生产站**：已装 v1.6.11.6

近 5 版概览（详见 CHANGELOG.md）：

| 版本 | 主题 |
|---|---|
| v1.6.11.6 | Open Graph 分享卡优化（og:title 去 site 后缀 · og:image 条件输出 · 路径绝对化） |
| v1.6.11.5 | 暗色模式评论组件 primary 色（绿 → 紫，跟 `--theme` 协调） |
| v1.6.11.4 | 评论 success toast 主题色（Shadow DOM 注样式 patch） |
| v1.6.11.3 | v1.6.11.x 安全 hotfix 系列清理（debug marker 退场） |
| v1.6.11.1 / .2 | P0 hotfix · `/moments` 私有内容前台泄露 |

---

## 3. 🚨 三条红线（不可触碰，碰了等于回退一整代）

### 红线 ① · 升级兼容铁三角不准改

```yaml
metadata.name:      theme-Joe3              # ← 不准改
spec.settingName:   theme-Joe-setting       # ← 不准改
spec.configMapName: theme-Joe-configMap     # ← 不准改
```

这三个字段必须跟上游 `jiewenhuang/halo-theme-joe3.0` 100% 一致——只有这样老用户在 Halo Console 上传新 zip 才能**原地覆盖升级**，后台配置（颜色、Waline、博主信息）不丢。

改了 = 用户升级时变全新主题 = 配置全丢 = 灾难。

### 红线 ② · 不准复活 `store.halo.run/app-id` annotation

上游在 Halo 应用市场注册了 `app-ZxiPb`。如果本 fork 在 `theme.yaml` 的 `metadata.annotations` 里保留这个 annotation，**用户的 Halo Console 会被引导"升级"到上游市场版**，一键覆盖咱们 fork 的所有修复——这叫**反向升级地雷**。

`v1.5.1-next.3` commit `f7bb4e6` 已经移除。**除非未来给本 fork 注册了自己的 Halo App Store app-id，否则永远不能加回**。

### 红线 ③ · 开源仓库永远不写真实域名 / IP / 邮箱

任何 commit、PR、issue、文档示例、代码注释里**不准出现**：

- 维护者博客**真实域名**（README 已公开的除外，但代码示例不引用）
- 维护者**真实 IP**（VPS / 家庭网络任何一段）
- 维护者**真实邮箱**（GPG / git 配置 / 联系信息除外）
- 任何能精确定位到维护者本人 / 服务器 / 家庭网络的标识符

文档示例**永远用占位符**：`blog.example.com` / `<YOUR-BLOG-DOMAIN>` / `<YOUR-VPS-IP>` / `<YOUR-EMAIL>`。

commit 前自查脚本（替换 `<PRIVATE-PATTERN>` 为维护者实际私密标识列表，**不要把列表 commit 进仓库**）：

```bash
# 在本地 ~/.gitconfig 或 ~/.zshrc 维护私密 grep 模式列表
git diff --cached --name-only | xargs grep -nE "<PRIVATE-PATTERN>" 2>/dev/null
```

如果发现具体泄漏点，回退 stash → 改占位 → 重新 stage → 再 commit。

---

## 4. 接活 SOP · 5 分钟 catch-up

每次开始动手前跑这一套：

```bash
cd <仓库本地路径>

# 1) 拉远端最新
git pull && git log --oneline -20

# 2) 看最新 release 状态
gh release list --repo Lau0x/halo-theme-joe-next --limit 5

# 3) 看本地是否有未 commit 的工作
git status -sb

# 4) 看 CHANGELOG 最近 3 个版本段
sed -n '/^## \[/,/^## \[/p' CHANGELOG.md | head -120

# 5) 看 Parking 待办（本文 § 8）
```

---

## 5. 🔥 七大踩坑速查（接棒必读 · 一句话版）

> 完整 RCA 在维护者本地 Claude Code 持久化记忆（`~/.claude/projects/<your-project>/memory/feedback_*.md`），核心教训已浓缩在下面。

### 5.1 Thymeleaf / Halo 模板 8 条深坑 · v1.6.6 sprint 10 rc 代价

1. **Halo `theme.config.xxx.yyy` 取出是 String 不是 Boolean / Integer**：判断布尔开关用 `#bools.isTrue(theme.config.xxx.flag)`，不能裸 `${...}`
2. **`+` 是字符串拼接不是加法**：`"3" + 1 = "31"`（不是 4）。要数学运算前先 `T(java.lang.Integer).parseInt()`
3. **`<th:block>` 上挂多个 `th:*` 不可靠**：分两层嵌套，外层 `th:if`、内层 `th:with`、再内层渲染
4. **`outerStat.first` 在嵌套 `th:each` 里不可靠**：用 Java `List.subList(0, 1)` 替代
5. **链式调用 + 字段访问会炸 fragment**：`postFinder.listByCategory(...).items` 这种链式不要用，**分两步**先 `th:with` 取列表，再访问 `.items`
6. **Halo enum 字段 Thymeleaf 层是 enum 对象，不是 String**：`spec.visible == 'PUBLIC'` 永远 false。用 `.name == 'PUBLIC'` 或 `.toString() == 'PUBLIC'`（v1.6.11.1 → .2 踩过这个）
7. **连续 2 版同方向失败 → 立即加 debug marker**：

   ```html
   <span style="display: none"
         th:attr="data-debug-x=${someExpr},
                  data-debug-x-class=${someExpr != null ? someExpr.getClass().getName() : 'null'}">
   </span>
   ```

   `.getClass().getName()` 是杀手锏——curl 看到实际 Java 类型，避免凭假设猜。

8. **Fragment 改动 push tag 前必跑 curl smoke test**：

   ```bash
   UA="-A Mozilla/5.0"
   URL="https://你的预览站/archives/任意文章"
   [ $(curl -sL $UA "$URL" | grep -c "</html>") = 1 ] || echo "❌ HTML 不完整"
   [ $(curl -sL $UA "$URL" | grep -c "joe_post__pagination-item") -ge 1 ] || echo "❌ 分页丢了"
   ```

### 5.2 jQuery 永远不准加 `defer`

`v1.5.1-next.5` 给 `<head>` jQuery 加 defer → 留言板/图库/复制按钮全挂。next.6 紧急回退。

**根因**：HTML5 规范里 body 内的 `<script src>` 在 parse 到达时**同步执行**，永远早于 `<head>` defer 完成。所以 jQuery defer = `$ is not defined`。

**正确方向**（如果未来要做）：给 `tail.html` 里所有 jQuery-dep `<script>` **统一** defer，**整体迁移**，不能只 defer jQuery 自己。

### 5.3 CSS Grid 多列布局一律用 `minmax(0, 1fr)`

`v1.6.11-rc.03` `/moments` 页两列瀑布流用 `grid-template-columns: repeat(2, 1fr)` → 左列被挤成 100px 竖条。

**根因**：`1fr` = `minmax(auto, 1fr)`，其中 auto 最小值 = grid item 的 min-content 宽度。代码块、长 URL、UGC 内容会撑爆 min-content，挤压其它列。

**SOP**：

```css
grid-template-columns: repeat(N, minmax(0, 1fr));
.grid-item { min-width: 0; }                 /* 兜底 */
.grid-item pre { overflow-x: auto; }          /* 代码块 */
.grid-item .ugc { overflow-wrap: anywhere; } /* UGC / 长 URL */
```

### 5.4 主题模板必须自做 visibility 白名单过滤

`v1.6.11.1` P0 hotfix · `/moments` 私有内容前台泄露。

**根因**：Halo finder 对已登录管理员返回**完整列表**（含 PRIVATE / INTERNAL）。原主题模板 `th:each` 遍历全量 → 管理员浏览前台 = 私有内容渲染 = 演示/截图/投屏泄露。

**SOP**：post / page / moment / comment 任何列表渲染都**模板层自做白名单**：

```html
<li th:if="${moment.spec.visible.name == 'PUBLIC'}">...</li>
```

用 `.name` 不要裸 `==`（参考 § 5.1 第 6 条）。

### 5.5 og:title ≠ `<title>` · 默认 og:image 不能是大正方形

`v1.6.11.6` 修这俩坑。

- **og:title**：不能复用 `<title>` 变量（带 `-Site Name` 后缀），跟 `og:site_name` 重复显示。`og:title` 应该**只是文章标题本身**。
- **og:image**：默认 fallback 图必须是横图（1200×630 标准）或 < 400×400 小图。1024×1024 正方形会被 Telegram 当大图渲染，撑高预览框。**没封面的文章干脆不输出 og:image meta**，Telegram 渲染纯文字紧凑卡片更好。

### 5.6 改 widget 颜色类 ticket 必须同时审 light + dark

`v1.6.11.4 → .5` 连环坑。改了 toast success 色（light + dark via `var(--theme)`），没顺手扫 primary 1/2/3 → 暗色 primary 被插件默认 emerald 绿覆盖。

**SOP**：动颜色 / 主题适配类 ticket，**必须同时验证 light + dark 两个模式**，不留尾巴。

特别注意：上游 PluginCommentWidget 用 Shadow DOM + 没暴露所有 CSS 变量。

- `.toast--success / --error / --warn` 颜色硬编码 → 改色需 JS 注 `adoptedStyleSheets` 到 shadowRoot
- 见 `templates/modules/macro/tail.html` 的 `patchHaloCommentToastTheme()`

### 5.7 GitHub Actions runner 排队 5 分钟+ → workflow_dispatch 兜底

`v1.6.11.6` 发版踩过。push 触发 16 分钟没分到 runner → workflow 被标记 failure。

**SOP**：

```bash
# 1. 如果 push 触发的 workflow queue 超过 5 分钟，重跑 + 手动 dispatch 并行
gh run rerun <RUN_ID> --repo Lau0x/halo-theme-joe-next
gh workflow run release.yml --repo Lau0x/halo-theme-joe-next --field tag=vX.Y.Z
```

`gh workflow run` 用 `workflow_dispatch` 通道，调度优先级常常比 push 触发高。

---

## 6. 发版 SOP（速记 · 详见 docs/release-sop.md）

### 6.1 三档授权（很重要）

| 档 | 类型 | 动作 |
|---|---|---|
| 🟢 全权 | patch / docs / chore（拼写、补文档、CSS 色微调、bug fix） | 打 tag → 直接发，做完报告 |
| 🟡 过目（默认） | minor feat（新功能、视觉改动、非破坏性增量） | 写好 notes 贴给用户看 → 用户点头才推 |
| 🔴 必对齐 | major / breaking（schema 破坏、API 弃用、v2.0） | 先讨论版本号 + 时机 → 用户明确授权才发 |

### 6.2 标准发版步骤（按顺序跑）

```bash
# 1. bump 版本（只改 theme.yaml，不改 package.json）
sed -i '' "s/version: '1.6.11.x'/version: '1.6.11.y'/" theme.yaml

# 2. CHANGELOG 加新段（参考 v1.6.11.6 段落格式）
$EDITOR CHANGELOG.md

# 3. commit（Conventional Commits）
git add theme.yaml CHANGELOG.md <其它改动文件>
git commit -m "fix(scope): vX.Y.Z · 一句话说清楚

详细描述 ...
"

# 4. annotated tag（必须 -a，不能 lightweight）
git tag -a vX.Y.Z -m "vX.Y.Z · 标题"

# 5. push commit + tag → CI 自动 build + 发 Release
git push origin main
git push origin vX.Y.Z

# 6. 验证 release（5 分钟内出 zip）
gh release view vX.Y.Z --repo Lau0x/halo-theme-joe-next
```

### 6.3 prerelease vs stable

- **debug 迭代**：用 `vX.Y.Z-rc.NN`（2 位 zero-padded）。`release.yml` 自动识别为 prerelease，不设 "Latest"。
- **stable**：rc.NN 验证通过 → **同 commit 打新 tag** promote 成 `vX.Y.Z`。
- **反面教材**：v1.6.0 → 1.6.1 → 1.6.2 → 1.6.3 一小时连发 4 个 stable 追同一 bug，每版邮件订阅者一次假升级——**永远别这样**。

---

## 7. 架构速览

```
templates/
├── *.html                              # 顶层路由模板（index/post/page/moments/...）
├── modules/
│   ├── layout.html                     # SEO meta / OG / canonical / theme-color
│   ├── macro/
│   │   ├── navbar.html                 # 导航
│   │   ├── loading.html
│   │   └── tail.html                   # 全局 JS 注入点（含 toast patch）
│   ├── common/{actions,aside,footer,pagination,blogger,donate}.html
│   └── widgets/                        # 侧边栏 widget 系列
└── assets/
    ├── css/*.less                      # 源 (注意：min/*.min.css 在 .gitignore，CI build 生成)
    ├── js/*.js                         # 源 (同上)
    └── lib/*                           # 第三方库（jquery / fancybox / clipboard / ...）

settings.yaml                            # Halo Console 配置 schema
theme.yaml                               # 主题元信息 + version
CHANGELOG.md                             # Keep-a-Changelog
.github/workflows/
├── build.yml                            # push/PR → build zip 上传 artifact
└── release.yml                          # tag v* → 创建 GH Release + 上传 zip
```

**关键决定**：

- `min/` 在 `.gitignore`，**CI 跑 `pnpm build` 时生成**，不入 git。本地改 less / js 源即可，min 文件不用 commit。
- 主题用 `html[data-mode='dark']` 切换暗色（在 `templates/assets/js/common.js`），**同时设置** `html[data-color-scheme='dark']` 让 PluginCommentWidget 跟随。

---

## 8. Parking · 待办池（次要 / 阻塞中）

### 需用户提供复现才能动
- upstream#380 标题文字阴影（无截图）
- upstream#351 Waline 路由（需启用 Waline 的用户复现）
- upstream#363 控制台报错（细节不明）
- upstream#353 搜索空格（非主题层，转 `plugin-search-widget`）

### 独立 PR · 改动大需生产验证
- **lib/ 进一步裁剪**：待核查 `katex@0.13.18` 2.3MB / `pdfjs` 6.9MB / `halo-comment` 8.2MB 是否还在用
- **jQuery 全量 defer**：给 tail.html 所有 jQuery-dep `<script>` 统一 defer（真正的 render-blocking 优化，回归面大）
- **AdSense 手动 slot 模式**：当前只有 Auto Ads
- **aside.html / aside_post.html 的 switch 块抽 fragment 复用**

### 长期理想
- **Halo 应用市场注册发布**（在 halo.run/developers 注册新 app-id · 不能复用上游 `app-ZxiPb` · 见红线 ②）
- upstream#364 pjax 支持
- upstream#339 中英切换
- Lighthouse baseline + 性能深度优化
- a11y 系统审计

---

## 9. 接棒态度（文化品味 · 可选项）

维护者偏好：

- **中文为主**：commit / CHANGELOG / 文档默认中文。代码注释中英都 OK，公开向（README）尽量中文。
- **诚实记录**：CHANGELOG 写"翻车回退"也照写不删（参考 v1.6.11 revert 段）。**raw history 比漂亮 history 有价值得多**。
- **不发明轮子**：上游 `halo-theme-joe3.0` 源码是最可靠 reference。加新功能前先 `grep templates/modules/` 找类似实现。
- **小步快跑 / 不一次性大重构**：一个 sprint 一个主题，颗粒度 1-2 rc 内一把过。**诊断阶段不重构，重构阶段不诊断**。
- **生产验证再发**：JS 加载方式 / CSS 变量 / 依赖版本任一变更，必须在生产站 curl + DevTools 验证才能打 tag。commit message 不写"预期"/"应该"，写具体验证事实。

---

## 10. 关联文档地图

| 文档 | 用途 |
|---|---|
| [README.md](README.md) | 用户面对的安装 / 升级 / 截图 |
| [CHANGELOG.md](CHANGELOG.md) | 所有版本变更记录（Keep-a-Changelog 格式） |
| [docs/configuration.md](docs/configuration.md) | 主题配置详细（Waline / 天气 / Iconfont / 阅读样式） |
| [docs/release-sop.md](docs/release-sop.md) | 发版完整 SOP（核心 3 原则 + 完整流程） |
| [docs/deployment/npm-setup.md](docs/deployment/npm-setup.md) | NPM 反代完整配置 + securityheaders A 评级 |
| `.github/workflows/release.yml` | tag 触发 → 自动 build zip + 创建 Release |
| `.github/workflows/build.yml` | push/PR 触发 → build 验证 |
| `.github/dependabot.yml` | npm 周扫 + GH Actions 月扫 |

---

## 11. 接手 checklist · 第一次维护前

- [ ] 读完本文（10-15 分钟）
- [ ] `git clone` + `pnpm install`（要 Node 20+ / pnpm 10.x via Corepack）
- [ ] 跑一次 `pnpm build` 看本地能否 build 通过
- [ ] 拉一次 `gh release list` 确认 GitHub CLI 已配 auth
- [ ] 读 CHANGELOG 最近 5 版理解最近 sprint 节奏
- [ ] 找一个 P3 长期理想里的小任务（比如读 lib/ 看哪些库 0 引用）热身
- [ ] **永远先验证 → 再修复 → 再发版**，不凭假设动手

---

*Last updated: 2026-05-15 · at v1.6.11.6 · by Roy Leo / 咕咕*
