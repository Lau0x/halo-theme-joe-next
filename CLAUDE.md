# CLAUDE.md · Theme Joe3 Next 接手入口

你正在接手维护 Halo 主题项目 `Lau0x/halo-theme-joe-next`。

默认用中文回复 Roy，简洁、先给结论。除非 Roy 明确说“推”，不要 push 远端；除非 Roy 明确要求，不要新建 README 或大规模文档。

## 先读顺序

1. `AGENTS.md`：项目身份、红线、踩坑速查。
2. `docs/release-sop.md`：发版流程和 rc/stable 规则。
3. `theme.yaml`：主题身份和版本。
4. `settings.yaml`：后台配置 schema。
5. `.github/workflows/release.yml`：Release zip 自动构建与上传。

## 当前状态

- 最新 stable：`v1.6.11.8`
- 最新 commit：`c69ce5a chore(theme): v1.6.11.8 · 发布直链与 Waline 稳定性`
- 最新 zip：
  `https://github.com/Lau0x/halo-theme-joe-next/releases/download/v1.6.11.8/theme-Joe3-1.6.11.8.zip`
- 本地构建产物：`dist/theme-Joe3-1.6.11.8.zip`
- 维护策略：小步、低风险、可验证；优先安全、可见性、发布流程、资源加载、Waline 兼容。

## 绝对红线

不要改这三个字段：

```yaml
metadata.name: theme-Joe3
spec.settingName: theme-Joe-setting
spec.configMapName: theme-Joe-configMap
```

不要恢复 `store.halo.run/app-id` annotation。

不要把真实私密域名、IP、邮箱写进代码、示例、commit、issue、PR。示例统一用 `blog.example.com`、`<YOUR-BLOG-DOMAIN>`、`<YOUR-VPS-IP>`、`<YOUR-EMAIL>`。

## 当前打开的 PR

先不要合：

- PR #11：`lint-staged 15.5.2 -> 17.0.5`，CI 绿，但 major，v17 不支持 Node 20。
- PR #10：`rolldown 1.0.0-beta.58 -> 1.0.1`，CI 红，lockfile overrides 与 `package.json` 不匹配。
- PR #3：`@waline/client 2.15.8 -> 3.13.0`，CI 绿，但 Waline v3 major，需要专项测试。

## 开工检查

```bash
git status -sb
git log --oneline -8
gh release list --repo Lau0x/halo-theme-joe-next --limit 5
gh pr list --repo Lau0x/halo-theme-joe-next --state open
```

## 修改原则

- 先读现有实现，再改最小范围。
- Thymeleaf 布尔配置优先用 `#bools.isTrue(...)`。
- Halo enum 可见性判断用 `.name == 'PUBLIC'`。
- 不要链式 `postFinder.xxx(...).items`，先 `th:with` 接对象再访问字段。
- 不要只给 jQuery 加 `defer`。
- 不要把 Waline v3 当顺手依赖升级合入。
- 诊断阶段不重构，重构阶段不诊断。

## 验证命令

改模板、配置或 workflow 后至少跑：

```bash
pnpm exec prettier --check <changed-files>
git diff --check
pnpm build
unzip -p dist/theme-Joe3-<version>.zip theme.yaml | rg "name: theme-Joe3|settingName|configMapName|version"
```

如果只是纯 Markdown 交接文档，可只跑 `git diff --check`。

## 发版规则

- 下一次小修版本建议：`v1.6.11.9`
- 不确定的线上验证走 prerelease：`v1.6.11.9-rc.01`
- stable 版本才作为 Latest Release。
- Debug 连续失败两次，停止猜，加入可 curl 看到的 debug marker。

当 Roy 说“推”时：

1. 确认 `git status -sb` 只有预期提交。
2. 推 main。
3. 打并推 tag。
4. 等 `.github/workflows/release.yml` 完成。
5. 拉 Release asset URL。
6. 给 Roy 可直接复制的 zip 直链。

直链格式必须是：

```text
https://github.com/Lau0x/halo-theme-joe-next/releases/download/vX.Y.Z/theme-Joe3-X.Y.Z.zip
```

## 给 Roy 的输出习惯

- 中文。
- 简洁。
- 先结论。
- 推完必须给 zip 直链。
- 不要用一长串技术细节淹没他；必要时把关键命令结果翻译成人话。
