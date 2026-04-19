<h1 align="center">Halo Theme Joe3 · Next</h1>

<p align="center">
  <strong>Halo 2.x 博客主题</strong><br>
  卡片化设计 · 响应式 · 深色模式 · 文章目录 · 代码高亮 · 评论系统
</p>

<blockquote align="center">
  <strong>🚧 Community-maintained continuation</strong><br>
  This is a friendly fork of <a href="https://github.com/jiewenhuang/halo-theme-joe3.0">halo-theme-joe3.0</a> by <a href="https://github.com/jiewenhuang">Jiewenhuang</a>.
  The original author's development has paused; this repo continues maintenance and adds new features under the same <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA 4.0</a> license.
</blockquote>

<p align="center">
  <a href="https://halo.run" target="_blank"><img src="https://img.shields.io/badge/dynamic/yaml?label=Halo&query=%24.spec.require&url=https://raw.githubusercontent.com/Lau0x/halo-theme-joe-next/main/theme.yaml&color=113,195,71" alt="Halo"/></a>
  <a href="https://github.com/Lau0x/halo-theme-joe-next/releases"><img src="https://img.shields.io/github/v/release/Lau0x/halo-theme-joe-next" alt="Release"/></a>
  <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/"><img src="https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-orange" alt="License"/></a>
</p>

<p align="center">
  <img width="100%" src="https://wmimg.com/i/70/2023/08/64d3c41d5bde2.webp" alt="Theme Joe3 Next screenshot"/>
</p>

<p align="center">
  参考站点：<a href="https://blog.laoda.de">blog.laoda.de</a>（维护者博客，基于此主题）· 原作者预览：<a href="https://www.jiewen.run/?preview-theme=theme-Joe3">jiewen.run</a>
</p>

---

## 安装

要求 **Halo ≥ 2.22.2**。

1. 下载最新 [release](https://github.com/Lau0x/halo-theme-joe-next/releases) 的 `halo-theme-joe3-next.zip`
2. Halo Console → 外观 → 主题 → 安装 → 上传 zip
3. 启用主题
4. 外观 → 主题 → 设置 中完成所有配置（首次使用建议每一项保存一遍）

> 📬 **获取更新通知**：本主题暂未登陆 Halo 官方应用市场，Halo 后台不会推送升级提示。
> 请点本仓库右上角 **Watch → Custom → Releases**，新版本发布时 GitHub 会邮件通知你，
> 然后在 Halo Console "升级"处上传新 zip 即可。配置不会丢。

## 功能清单

- ✅ 卡片化设计 · 响应式 · 深色模式 · 文章目录
- ✅ 代码块语言标签 + 复制
- ✅ 字数统计 · 相关文章 · 全文搜索
- ✅ Waline / Halo 原生 评论系统任选
- ✅ 友情链接、瞬时（moments）、图库（photos）插件适配
- ✅ 博主栏天气（心知天气）· 自定义 socials · 头像挂件

完整配置说明见 **[docs/configuration.md](docs/configuration.md)**。

## 本地开发

需要 Docker + Node ≥ 18。

```bash
# 1. 起本地 Halo（http://localhost:8090，admin/halo-dev-2026）
docker compose -f docker-compose.dev.yml up -d

# 2. 安装依赖 + 首次构建
corepack enable && corepack prepare pnpm@10.26.0 --activate
pnpm install
pnpm build-only

# 3. 同步主题到容器（docker cp + 自动重启让 Thymeleaf 重载）
./scripts/theme-sync.sh
```

开发循环：
- 改 `templates/*.html` → `./scripts/theme-sync.sh --templates`
- 改 `templates/assets/{js,css}/*.{js,less}` → `./scripts/theme-sync.sh --build-first`
- 改 `theme.yaml` / `settings.yaml` → `./scripts/theme-sync.sh --settings`

首次使用本地 Halo 建议先做一次 Halo 线上实例的"备份与恢复"，用真实数据做调试基础（见 `docs/configuration.md` "本地数据"章节）。

## 路线图

当前 Sprint 焦点：**工程基建 + 上游已知 bug 修复**。完整 roadmap 见 [TODO.md](TODO.md)。

## 贡献

欢迎 issue / PR：
- **Bug** → [提交 issue](https://github.com/Lau0x/halo-theme-joe-next/issues/new)
- **Feature** → 先开 issue 讨论，再 PR
- 所有修改遵循 CC BY-NC-SA 4.0，PR 合并视为同意该条款

只维护 `main` 一个分支，直接在 `main` 基础上开 feature branch。

## 感谢

此主题建立在许多前辈的工作之上：

- 🙏 [Jiewenhuang / halo-theme-joe3.0](https://github.com/jiewenhuang/halo-theme-joe3.0) — 本 fork 的直接上游
- [qinhua / halo-theme-joe2.0](https://github.com/qinhua/halo-theme-joe2.0) — Halo 1.x 时代的 Joe2.0
- [HaoOuBa / Joe](https://github.com/HaoOuBa/Joe) — 最早的 Typecho Joe 主题
- [Halo](https://halo.run) · [theme-starter](https://github.com/halo-dev/theme-starter)
- 配套插件：[plugin-links](https://github.com/halo-sigs/plugin-links) · [plugin-comment-widget](https://github.com/halo-sigs/plugin-comment-widget) · [plugin-search-widget](https://github.com/halo-sigs/plugin-search-widget) · [plugin-moments](https://github.com/halo-sigs/plugin-moments) · [plugin-photos](https://github.com/halo-sigs/plugin-photos)

## License

[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) — © Jiewenhuang (original), fork maintained by Roy Leo.

允许自由使用、修改、分享；必须署名；不能商用；衍生作品需同协议。
