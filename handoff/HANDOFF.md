# HANDOFF · 接手 halo-theme-joe-next

> 给接手维护的 AI agent（Codex / 其它 LLM）的**单文件入口**。
> 权威手册是根目录 `AGENTS.md`——本文只给最短路径 + 当前状态快照，细节一律以 AGENTS.md 为准。

维护者：Roy Leo / 咕咕（GitHub `Lau0x`）。默认**中文**回复，简洁、先给结论。

## 先读顺序

1. `AGENTS.md` —— 项目身份、三条红线、七大踩坑、发版 SOP、架构、Parking 待办（**最重要**）。
2. `docs/release-sop.md` —— 完整发版流程和 rc / stable 规则。
3. `theme.yaml` —— 主题身份三字段和版本。
4. `settings.yaml` —— Halo Console 后台配置 schema。
5. `.github/workflows/release.yml` —— tag 触发自动 build zip + 建 Release。

## 当前状态（快照 · 2026-07-12）

- 仓库：`Lau0x/halo-theme-joe-next`
- 本地路径：`/Users/royleo/Documents/Codex/NEW_HAI/halo_theme/halo-theme-joe-next`
- 技术栈：Halo 2.x（Thymeleaf + jQuery 3.7.1 + Less + rolldown + pnpm 10.x，Node 20+）
- 最新 stable：`v1.6.11.9`
- 本地构建包：`dist/theme-Joe3-1.6.11.9.zip`（13.53 MB）。
- 已在 Halo 2.25.4 完成 `v1.6.11.8 → v1.6.11.9` 控制台覆盖升级测试；主题保持激活，自定义设置保留。
- 最新下载直链：
  `https://github.com/Lau0x/halo-theme-joe-next/releases/download/v1.6.11.9/theme-Joe3-1.6.11.9.zip`
- 2026-07-10 开工时 `main` 与 `origin/main` 一致；v1.6.11.9 发布前已完成完整本地验证。
- 维护策略：小步、低风险、可验证。诊断阶段不重构，重构阶段不诊断。

## 🚨 三条红线（细节见 AGENTS.md §3）

1. **不改主题身份铁三角**——老用户原地覆盖升级、配置不丢全靠它：
   ```yaml
   metadata.name: theme-Joe3
   spec.settingName: theme-Joe-setting
   spec.configMapName: theme-Joe-configMap
   ```
2. **不复活** `store.halo.run/app-id` annotation（上游 `app-ZxiPb`，会把用户反向引导回上游市场版）。
3. **开源仓库不写真实域名 / IP / 邮箱**。示例一律用 `blog.example.com`、`<YOUR-BLOG-DOMAIN>`、`<YOUR-VPS-IP>`、`<YOUR-EMAIL>`。

附加纪律：不乱合 Dependabot major PR；不顺手升 Waline v3；**不 push，除非 Roy 明确说“推”**。

## 开着的 PR（都先不合）

- **#14** GitHub Actions major 更新组：CI 绿，需独立评估 runner 与 action runtime 后再决定。
- **#13** 构建工具 minor/patch 更新组：CI 绿，但混合打包 CLI、Less、Prettier 与 Rolldown，不能整包直接合。
- **#11** `lint-staged` 15.5.2 → 17.0.5：CI 绿，但 major，v17 不支持 Node 20。
- **#3** `@waline/client` 2.15.8 → 3.13.0：CI 绿，但 v3 major，需专项测试，不当顺手依赖升。

已关闭未合并：**#10** `rolldown` 更新，历史 CI 红，不再列为开放 PR。

## 开工检查（每次动手前）

```bash
cd /Users/royleo/Documents/Codex/NEW_HAI/halo_theme/halo-theme-joe-next
git status -sb
git log --oneline -8
gh release list --repo Lau0x/halo-theme-joe-next --limit 5
gh pr list --repo Lau0x/halo-theme-joe-next --state open
```

## 改动后验证

```bash
pnpm exec prettier --check <changed-files>
git diff --check
pnpm build
unzip -p dist/theme-Joe3-<version>.zip theme.yaml | rg "name: theme-Joe3|settingName|configMapName|version"
```

纯 Markdown 交接文档改动，可只跑 `git diff --check`。

## 发版 / 交付习惯

- 授权分档见 AGENTS.md §6.1：patch/docs/chore 可全权发；minor feat 过目；major/breaking 必对齐。
- 发版标准步骤见 AGENTS.md §6.2；rc 用 `vX.Y.Z-rc.NN`，stable 才是 Latest。
- Roy 说“推”后：确认 `git status -sb` → 推 main → 打并推 annotated tag → 等 `release.yml` 成功 → 拉 Release asset URL → **给 Roy 可直接复制的 zip 直链**：
  ```text
  https://github.com/Lau0x/halo-theme-joe-next/releases/download/vX.Y.Z/theme-Joe3-X.Y.Z.zip
  ```
- Debug 连续失败两次，停止猜，加可 curl 看到的 debug marker（`.getClass().getName()`，见 AGENTS.md §5.1）。
