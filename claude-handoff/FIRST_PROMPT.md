# FIRST_PROMPT · 直接复制给 Claude

```text
你接手这个 Halo 主题项目。默认中文、简洁回复。

先读 CLAUDE.md、AGENTS.md、docs/release-sop.md，再看 theme.yaml、settings.yaml、.github/workflows/release.yml。

当前最新版是 v1.6.11.8：
https://github.com/Lau0x/halo-theme-joe-next/releases/download/v1.6.11.8/theme-Joe3-1.6.11.8.zip

红线：
- 不要改 metadata.name / spec.settingName / spec.configMapName
- 不要恢复 store.halo.run/app-id
- 不要把真实私密域名/IP/邮箱写进仓库
- 不要乱合 Dependabot major PR
- 不要顺手升 Waline v3
- 不要 push，除非我明确说“推”

维护策略：
小步、低风险、可验证。改完至少跑 git diff --check 和 pnpm build。推完必须等 GitHub Release workflow 成功，并给我 theme-Joe3-*.zip 的直接下载链接。

现在先汇报你读到的当前状态、红线和你认为下一步该做什么，不要先改代码。
```
