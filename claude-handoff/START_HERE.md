# START_HERE · 给 Claude 的入口

你现在接手维护 `halo-theme-joe-next`。先读项目根目录的 `CLAUDE.md`，再读 `AGENTS.md` 和 `docs/release-sop.md`。

当前最新版：

```text
v1.6.11.8
https://github.com/Lau0x/halo-theme-joe-next/releases/download/v1.6.11.8/theme-Joe3-1.6.11.8.zip
```

先不要合 Dependabot PR，不要升级 Waline v3，不要改主题身份三字段，不要 push，除非 Roy 明确说“推”。

接活第一步：

```bash
git status -sb
git log --oneline -8
gh release list --repo Lau0x/halo-theme-joe-next --limit 5
gh pr list --repo Lau0x/halo-theme-joe-next --state open
```

常规验证：

```bash
pnpm exec prettier --check <changed-files>
git diff --check
pnpm build
```
