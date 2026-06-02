# CURRENT_STATE · 2026-06-02

## 项目

- 仓库：`Lau0x/halo-theme-joe-next`
- 本地路径：`/Users/royleo/Documents/Codex/halo_theme/halo-theme-joe-next`
- 技术栈：Halo 2.x、Thymeleaf、jQuery、Less、rolldown、pnpm 10.x
- 最新 stable：`v1.6.11.8`
- 最新 commit：`c69ce5a chore(theme): v1.6.11.8 · 发布直链与 Waline 稳定性`

## 最新下载

```text
https://github.com/Lau0x/halo-theme-joe-next/releases/download/v1.6.11.8/theme-Joe3-1.6.11.8.zip
```

## 最近两版

- `v1.6.11.8`
  - Release 正文和 workflow summary 增加 zip 直链。
  - Waline 默认功能 JS 锁到 `@waline/client@v2`。
  - Waline 留言页移除多余 import，昵称、头像、评论内容安全转义。
  - `beauty.min.css` 只在开启大图或友链页加载。

- `v1.6.11.7`
  - 私密文章/动态前台白名单过滤。
  - 默认评论和 Waline 最新评论安全渲染。
  - 修复自定义字体优先级。
  - 分享链接参数编码。
  - 删除无入口旧资源，主题包约 22M 降到约 16.4M。

## 已知 PR

- #11 `lint-staged` major：不急合。
- #10 `rolldown`：CI 红，不合。
- #3 `@waline/client` v3：需专项测试，不急合。

## 交付习惯

Roy 说“推”后，要推 main + tag，等 Release workflow 成功，再给 zip 直链。不要只给 Release 页面。

直链示例：

```text
https://github.com/Lau0x/halo-theme-joe-next/releases/download/v1.6.11.8/theme-Joe3-1.6.11.8.zip
```
