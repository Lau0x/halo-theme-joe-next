# 贡献指南 · Contributing to Theme Joe3 Next

感谢你想为 Theme Joe3 Next 做贡献！这是一个社区接棒维护的 Halo 主题 fork，任何形式的帮助都很珍贵——**报 bug、提建议、写文档、改代码都算贡献**。

> 原作者 [Jiewenhuang](https://github.com/jiewenhuang) 的开发已暂停，本 fork 由 [Roy Leo](https://github.com/Lau0x) 继续维护。所有贡献沿用原仓库 **CC BY-NC-SA 4.0** 协议。

---

## 目录

- [报 Bug](#报-bug)
- [提 Feature / 改进建议](#提-feature--改进建议)
- [本地开发环境](#本地开发环境)
- [提交代码 (PR)](#提交代码-pr)
- [Commit 规范](#commit-规范)
- [License 与 CLA](#license-与-cla)
- [维护者联系方式](#维护者联系方式)

---

## 报 Bug

发现问题先别急着动手——**先搜 [issues](https://github.com/Lau0x/halo-theme-joe-next/issues?q=is%3Aissue)**，看看是不是别人已经报过了。

还没人报 → [新建 issue](https://github.com/Lau0x/halo-theme-joe-next/issues/new)，填写以下信息（越详细越快修）：

- **环境**：Halo 版本、浏览器 + 版本、主题版本（Halo Console → 外观 → 主题 看版本号）
- **复现步骤**：1. 2. 3. 最小化，越短越好
- **期望行为** vs **实际行为**
- **截图 / 录屏 / console 报错**：有就附上，贴代码用 ``` 包
- **是否在生产环境**：本地 dev 炸和线上炸优先级不同

示例好 issue：
> 环境：Halo 2.24.1 / Chrome 131 / Joe3-Next v1.5.1-next.4
> 复现：1. 文章页点图片放大 → 2. 退出 Fancybox → 3. URL 多了 `#fancybox-XX` 锚点
> 期望：URL 不变
> 实际：URL 变了，后退按钮失效
> 报错：console 无报错

---

## 提 Feature / 改进建议

新功能建议**先开 issue 讨论，再动手 PR**。原因：

- 有些 feature 我（维护者）有不同规划，直接 PR 可能白干
- 有些功能上游 Halo 已经有插件可替代（如 [plugin-links](https://github.com/halo-sigs/plugin-links) 管友链），主题层不需要重复造
- 配置项涉及 `settings.yaml` 变更会影响所有用户，需要拉通设计

issue 模板：
- **背景**：你想解决什么问题
- **方案**：你想怎么解决
- **备选方案**：有没有想过别的路子，为什么选 A 不选 B
- **影响面**：会动哪些文件 / 会不会影响现有用户配置

---

## 本地开发环境

### 前置要求

- Docker + Docker Compose
- Node.js ≥ 18
- pnpm 10.x（通过 Corepack 启用）

### 快速开始

```bash
# 1. 克隆
git clone https://github.com/Lau0x/halo-theme-joe-next.git
cd halo-theme-joe-next

# 2. 起本地 Halo
docker compose -f docker-compose.dev.yml up -d
# → http://localhost:8090，初始账号 admin / halo-dev-2026

# 3. 装依赖 + 首次构建
corepack enable && corepack prepare pnpm@10.26.0 --activate
pnpm install
pnpm build-only

# 4. 把主题同步进容器
./scripts/theme-sync.sh
```

### 开发循环

| 改什么 | 用什么命令 |
|---|---|
| `templates/*.html`（Thymeleaf 模板） | `./scripts/theme-sync.sh --templates` |
| `templates/assets/{js,css}/*.{js,less}` | `./scripts/theme-sync.sh --build-first` |
| `theme.yaml` / `settings.yaml` / `annotation-setting.yaml` | `./scripts/theme-sync.sh --settings` |

建议先走一次 Halo 后台「备份与恢复」用真实数据填充本地，空实例看不出列表分页 / 标签云 / 长文排版等边界问题。详见 [`docs/configuration.md#本地数据`](docs/configuration.md#本地数据-用真实数据做开发调试)。

### 验证改动

动 UI 的改动提 PR 前：

- [ ] 浏览器清缓存强刷（Ctrl+F5）确认生效
- [ ] 亮色 + 暗色两套主题都看过
- [ ] 手机宽度（< 768px）看过
- [ ] `pnpm build` 能构出 zip 不报错
- [ ] 没有 console 报错 / 新增 warning

---

## 提交代码 (PR)

### 分支策略

- 只维护 `main` 一个分支
- 所有 feature branch 从 `main` 开，开发完 PR 回 `main`
- 分支命名：`fix/xxx`（修 bug）/ `feat/xxx`（加功能）/ `docs/xxx`（改文档）/ `chore/xxx`（基建）

### PR Checklist

提 PR 前自己过一遍：

- [ ] 标题按 [Commit 规范](#commit-规范) 写（复用 commit 标题即可）
- [ ] 关联 issue：`Closes #XX` 或 `Refs #XX`
- [ ] 描述说清 **为什么改** 不是 **改了什么**（diff 会显示改了什么）
- [ ] 没改无关文件（不要顺手 reformat 整个文件）
- [ ] 构建产物 `templates/assets/{css,js}/min/*` 不要提交（`.gitignore` 已挡）

### PR 评审节奏

- 小改动（< 50 行）：24-48 小时内会看
- 大改动（涉及 settings 或跨多文件）：可能需要几天讨论
- 被 request changes 别玻璃心——**对事不对人**，改完 push 同分支自动更新

---

## Commit 规范

采用 [Conventional Commits](https://www.conventionalcommits.org/) 风格：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**type**（必填）：
- `fix` — 修 bug
- `feat` — 新功能
- `docs` — 只改文档
- `style` — 不影响逻辑的格式改动（空格、换行、分号）
- `refactor` — 重构（既不修 bug 也不加功能）
- `perf` — 性能优化
- `ci` — CI / GitHub Actions 相关
- `chore` — 杂项（版本号、依赖升级、.gitignore）

**scope**（可选）：改动的主要模块，如 `blogger` / `search` / `waline` / `release` / `deploy`

**subject**：
- 祈使句，小写开头
- 不加句号
- < 72 字符

**示例**：

```
fix(blogger): avatar frame URL broken when Halo appends ?v= (#367)

Thymeleaf `@{/assets/frame/}+'/'+var+'.png'` gets mangled into
`/assets/frame?v=X/bull.png` because Halo's version query injection
inserts before the concatenation. Use `@{/assets/frame/__${var}__.png}`
syntax for in-URL variable expansion instead.

Closes #6
```

**引用 upstream issue**：格式 `refs upstream#389` 或 `Closes upstream#389`（指 [jiewenhuang/halo-theme-joe3.0 的 issues](https://github.com/jiewenhuang/halo-theme-joe3.0/issues)）。

---

## License 与 CLA

本项目采用 **[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)**（Creative Commons 署名-非商业性使用-相同方式共享 4.0 国际）：

- ✅ 可自由使用、修改、分享
- ✅ 必须署名（原作 © Jiewenhuang，fork © Roy Leo）
- ❌ 不能商用
- 🔗 衍生作品必须沿用相同协议

**提交 PR 即视为你同意**：
1. 你的贡献以 CC BY-NC-SA 4.0 授权
2. 你拥有提交内容的版权（或已获授权）
3. 贡献内容不含第三方受限代码（如 GPL、私有代码）

---

## 维护者联系方式

- **GitHub Issues**：首选，所有讨论留痕
- **维护者博客**：[blog.laoda.de](https://blog.laoda.de)（基于本主题）

非紧急问题请走 GitHub，邮件回复可能会慢。

---

> ⭐ 觉得项目有用请点 Star，也可以 Watch → Custom → Releases 订阅新版本通知。
