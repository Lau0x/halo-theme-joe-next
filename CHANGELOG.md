# Changelog

本文件记录 **Theme Joe3 Next** 所有值得用户感知的变更。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。

> 📎 **升级安全承诺**：所有版本的 `metadata.name` / `settingName` / `configMapName` 与上游 Joe3 一致。在 Halo Console 直接上传新 zip 即可原地覆盖，后台配置（博主信息、Waline Token、颜色等）不会丢。

---

## [Unreleased]

未发布（main 分支当前状态）。

---

## [1.6.11-rc.02] · 2026-04-21 · 🎨 /moments 视觉收紧（prerelease）

rc.01 实测用户反馈：
- **蓝色锚点圆跟时间轴竖线不对齐**，视觉像个悬浮小图标看不懂用途
- 锚点圆 + pill 翻蓝底白字 + 卡片 hover 全边框蓝 → **品牌色打击面过大、重复锚点、凌乱**

### rc.02 收紧改动
- **🗑️ 删蓝色锚点圆** · 干净直接 · 让时间轴竖线 + feather 图标 + pill 自身承担视觉锚点
- **🗑️ 删 pill hover 翻蓝底白字** · 保留浅蓝底蓝字（+`tabular-nums`），hover 无剧烈翻转
- **🔄 卡片 hover 边框不再全变蓝** · 改用左侧 3px 蓝色 `::before` indicator：默认 25% 透明度、hover 100%（更克制的 timeline 暗示）
- **✅ 保留 rc.01 里好的部分**：
  - 圆角统一 12px（去掉 `0 18px 18px 18px` 气泡异形）
  - Hover translateY(-2px) + 轻阴影
  - 时间轴竖线品牌蓝渐变
  - blogger info card 顶部 3px 品牌渐变条 + avatar 光晕
  - Dark mode 独立配色

### 设计理念调整
**"装饰越多 ≠ 越有设计感"** · rc.01 把时间轴锚点 + pill + 卡片边框 三处叠加品牌色，反而让主视觉失焦。rc.02 坚持"单一强锚点"（pill 承担主锚点，卡片左 indicator 辅助，竖线承担结构），克制 = 高级。

---

## [1.6.11-rc.01] · 2026-04-21 · 🎨 moments 页视觉升级 Level 2（prerelease）

**/moments 页原本时间轴太朴素**（单虚线 + 纯文本日期 + 气泡异形圆角），升级到"现代 timeline with pill/品牌色锚点"风格。

### Changed · 纯 CSS override（不改模板 · 可完全回退）
- **时间轴竖线** · 单虚线 → 品牌蓝渐变实线（top `var(--theme)` 100% → bottom transparent），更有方向感
- **日期左侧锚点圆点** · 每个 moment 左侧加 14px 品牌蓝实心圆（带 background 外描边 + 淡蓝光晕），锚定视觉节奏
- **日期 Pill badge** · 从平文本升级为 pill（品牌蓝半透明背景 + 细边框 + `tabular-nums` 数字等宽 + 圆角 20px）· hover 时翻转为实心蓝白字
- **卡片圆角** · `0 18px 18px 18px` 气泡异形 → `12px` 四角统一（对齐 v1.6.6 相关推荐卡片现代卡风格）
- **Hover 动效** · translateY(-2px) + 品牌蓝阴影 `rgba(42,100,246,0.22)` + 边框变蓝
- **blogger info card** · 顶部加 3px 品牌蓝→紫渐变装饰条 · avatar 加 4px 光晕 + hover 微放大
- **Dark mode 独立配色** · 暗色下用 `rgba(153,153,255,...)` 紫调不刺眼

### 实施方式
追加到 `templates/assets/css/joe-next-overrides.less`（v1.6.6 相关推荐卡升级同一 MO），原 `journals.less` 未动。不满意可一条 git revert 完全回退。

### Level 3 保留
若 Level 2 后仍不够，v1.6.12 可继续：
- Masonry 两列瀑布流布局（桌面 ≥1024px）
- 图片 moment 加 backdrop-filter blur 边框光晕
- 点赞 ❤️ pulse 动画

---

## [1.6.10] · 2026-04-21 · ⚡ 按页面条件加载 lib · 非对应页面省 11-111 KB

**经 rc.01 curl 矩阵验证 + 用户功能确认 promote stable**。1 rc + 1 stable 节奏保持。

### Added · MED-3 按 htmlType 条件加载
3 个 lib + 1 个 CSS 原本全页面无条件下载，现按 `htmlType` 条件化：

| lib | 原来 | v1.6.10 改后 |
|---|---|---|
| `wowjs/wow.min.js` (~17 KB) | 所有页面 | `index` / `journals` / `friends` / `photos` |
| `fancybox/jquery.fancybox.min.js` (~84 KB) | 所有页面 | `post` / `photos` / `journals` / `sheet` |
| `fancybox/jquery.fancybox.min.css` (~15 KB) | 所有页面 | `post` / `photos` / `journals` / `sheet` |
| `clipboard/clipboard.min.js` (~11 KB) | 所有页面 | `post` / `journals` / `sheet` |

### 保留全局加载（符合实际使用）
`lazysizes` / `qmsg` / `utils` / `custom` / `common` / `ad-close` —— 任一页面都可能用到。

### MED-2 跳过 · 字体策略已合规
Audit 确认：LXGW CDN 默认 `font-display: swap` · 本地化 iconfont v1.6.9 已加 · `Joe Font` 已加。用户也没启用 LXGW。**原审计建议基于未验证，实际主题已合规**，不浪费 upgrade slot 重做。

### 生产验证矩阵（5 类页面 · curl 确认）

| 页面 | wowjs | fancybox JS | fancybox CSS | clipboard |
|---|---|---|---|---|
| home | ✅ | — | — | — |
| post | — | ✅ | ✅ | ✅ |
| archives | — | — | — | — |
| links | — | — | — | — |
| photos | ✅ | ✅ | ✅ | — |

### 节省带宽
- **首页 / 归档 / 标签 / 分类** 不再下载 fancybox (~100KB) + clipboard (~11KB) = **省 ~111 KB / 请求**
- **文章** 不再下载 wowjs = **省 ~17 KB**
- **图库** 不再下载 clipboard = **省 ~11 KB**

### 历史功能继承验证（v1.6.6 → v1.6.9 全部保持）
- 相关推荐 3 卡 · pagination · JSON-LD 3 块 · canonical permalink · OG image meta · jQuery 3.7.1 · iconfont 本地 · 34 img numeric dim · debug marker 0 残留

### 升级
```
https://github.com/Lau0x/halo-theme-joe-next/releases/download/v1.6.10/theme-Joe3-1.6.10.zip
```

### Next v1.6.11 候选
- **MED-6** tail.html jQuery 全量 defer · 性能最大杠杆（重启 next.5 踩雷方案）
- **MED-4** 关键 CSS inline + 非关键 async · FCP/LCP 大改
- **MED-7** aside / aside_post 重复 widget 抽 fragment · 维护性

---

## [1.6.10-rc.01] · 2026-04-21 · ⚡ MED-3 按页面条件加载 lib · MED-2 已合规不改（prerelease）

### 🚫 MED-2 取消 · 字体策略已合规
审计发现：
- **LXGW CDN CSS** 本身已带 `font-display: swap`（jsdelivr 默认）
- **本地化 iconfont** v1.6.9 已加 `font-display: swap`
- **"Joe Font" 自定义字体** key_css.html:34 已加 `font-display: swap`
- **用户 Halo 配置 LXGW 开关为 off** · 博客当前根本没在用 LXGW

→ 原审计基于未验证的建议，实际主题已合规。**不浪费你的 upgrade slot 重做同样的事**。

### Added · MED-3 按页面条件加载 JS / CSS lib
减少非对应页面下载不需要的 lib，优化 FCP + 带宽。

| lib | 大小 | 改后仅在哪些页面加载 |
|---|---|---|
| `wowjs/wow.min.js` | ~17 KB | `index` / `journals` / `friends` / `photos`（有滚动淡入动画的页面）|
| `fancybox/jquery.fancybox.min.js` + `.css` | ~100 KB | `post` / `photos` / `journals` / `sheet`（可能有图片 lightbox 的页面）|
| `clipboard/clipboard.min.js` | ~11 KB | `post` / `journals` / `sheet`（有代码块复制或文章分享链接的页面）|

### 保留全局加载（符合实际使用）
- `lazysizes.min.js` —— 所有页面都有图片需要 lazy load
- `qmsg/qmsg.js` —— 任何页面都可能用 toast 消息（评论、复制成功提示等）
- `utils.min.js` / `custom.min.js` / `common.min.js` —— 主题核心工具
- `ad-close.min.js` —— 全站广告位 × 按钮

### 预期收益（非加载页面的 HTTP 请求减少）
- **首页** 不再下载 fancybox (~100KB) + clipboard (~11KB) = **节省 ~111 KB**
- **友链页** 不再下载 fancybox + clipboard = **节省 ~111 KB**
- **归档页** 同上 = **节省 ~111 KB**
- **文章页** 不再下载 wowjs (~17KB) = **节省 17 KB**
- **图库页** 不再下载 clipboard (~11KB) = **节省 11 KB**

### 验证清单（rc.01 → stable 前必跑）
**8 类页面全跑 + JS console 无 undefined 报错**：
- 首页 → 滚动动画还在 / 图片 lazyload 正常 / 无 fancybox/clipboard 报错
- 文章页 → fancybox 点图放大 / 代码块复制 / TOC / 相关推荐 正常
- 归档页 → 无 fancybox/clipboard 相关报错
- 留言板（sheet） → fancybox + clipboard 在（便利贴粘贴）
- 图库（photos） → fancybox 在（点照片放大）+ isotope 布局
- 友链（friends） → wowjs 动画在
- 瞬时（journals） → 三件套都在
- 分类/标签归档 → 无 fancybox/clipboard 报错

### Next v1.6.11 候选
- **MED-4** 关键 CSS inline + 非关键 async · FCP/LCP 大改
- **MED-6** jQuery 全量 defer · 性能最大杠杆（重启踩雷方案）
- **MED-7** aside fragment 抽取 · 维护性重构

---

## [1.6.9] · 2026-04-21 · ⚡ 性能 + SEO + 安全 打包（option A）

**经 rc.01 → rc.02 迭代后 promote**。5 路生产 smoke test 全过（home / article / links / photos / categories），五项改动闭环。

### Added · 性能
- **LHF-5 img 16:9 numeric dim · 11 处 `<img>`** —— `width="100%" height="100%"` → `width="1600" height="900"` / `400×120` / `400×150` 按实际场景
  - 主卡片（3 处）：post_item / banner_item / relate_cards (×2)
  - 侧边卡（5 处）：tags / categories / blogger / hot_category (×2)
  - 侧栏横条（2 处）：navbar slideout + TOC bg
  - 轮播（3 处）：banner_item_data (post/custom/hot) 1600×900
  - **保留**：`ads_post/ads_aside` 因用户自定义广告尺寸多变（970×250 / 728×90 等），硬编码反伤 CLS 预测
  - **收益**：Lighthouse Core Web Vitals CLS 直接提升
- **LHF-6 jQuery 3.5.1 → 3.7.1** —— 修 CVE + 微性能；API 100% 向后兼容。**严禁碰 jQuery defer**（next.5 踩过雷）
- **MED-5 alicdn iconfont 本地化** —— 3 个 CSS 合并为单一 `assets/lib/iconfont-local/iconfont.min.css` + 3 个 woff2（joe-font/jiewen/third-font ~55KB on-disk） + `font-display:swap` 防 FOIT
  - **去第三方依赖** · alicdn CDN 下线风险排除
  - **3 HTTP 请求 → 1 请求**

### Added · SEO
- **MED-1 OG image 富化** —— `og:image:alt`（文章标题）+ `og:image:type`（按 URL 后缀推断 jpeg/png/webp/gif）+ `twitter:image:alt`

### Fixed · 安全
- **Halo 动态菜单 `target="_blank"` 条件加 `rel="noopener noreferrer"`** —— `menu-item.html` + `navbar.html` 共 11 处 th:target · 修 v1.6.8.1 当时只扫静态 target 漏掉的动态菜单 28 个链接

### 已知非-theme 问题（用户侧，主题无法修）
- **`theme.config.custom.iconfont`** · 用户自行配置的 alicdn CSS (`font_4441770_2j86yqmszow.css`) 仍从第三方加载 —— 主题只负责渲染 settings 字段。需用户决定在 Halo Console 清空或改本地路径
- **博主自撰 HTML 内容中的 `<a target="_blank">` 不加 rel** —— 主题无权改用户文章/widget 里的 HTML

### 升级直链
```
https://github.com/Lau0x/halo-theme-joe-next/releases/download/v1.6.9/theme-Joe3-1.6.9.zip
```

### Sprint 对比
| Sprint | 版本数 | 亮点 |
|---|---|---|
| v1.6.6 | 10 rc + 1 stable | 相关推荐视觉 + 数量对齐（Thymeleaf 深坑 10 条 SOP 教训）|
| v1.6.7 | 1 rc + 1 stable | 主题瘦身 Pass 1 · 288 KB |
| v1.6.8 | 1 rc + 1 stable | JSON-LD 富结果 |
| v1.6.8.1 | 1 patch | Audit 揪 4 个 bug · canonical 重复等 |
| v1.6.9 | 2 rc + 1 stable | 性能 + SEO + 安全 打包 5 项 |

### 下一 sprint 候选（v1.6.10）
- **MED-6** · tail.html jQuery 全量 defer（next.5 踩雷方案重启·FCP/LCP 最大杠杆）
- **MED-2 / MED-3 / MED-4 / MED-7** · 字体策略 / 条件加载 / 关键 CSS inline / aside fragment 抽取

---

## [1.6.9-rc.02] · 2026-04-21 · 🧼 补全 widget img numeric dim（prerelease）

rc.01 验证发现 LHF-5 scope 不够：3 个主卡片模板已改，但 8+ widget 模板仍有 `width="100%"` 未修。rc.02 补完。

### Fixed
- `tags.html` · tag 侧边卡 `400×120`
- `categories.html` · category 侧边卡 `400×120`
- `modules/common/blogger.html` · 博主栏壁纸 `400×120`
- `modules/macro/navbar.html` · slideout 侧边栏壁纸 + TOC 目录 bg · `400×150` (×2)
- `modules/macro/hot_category.html` · 热门分类卡 + 自定义卡 · `400×120` (×2)
- `modules/macro/banner_item_data.html` · 轮播 3 处（post/custom/hot） · `1600×900` (×3)

### 保留不改
- `modules/ads/ads_post.html` + `ads_aside.html` · 广告 `width="100%"` 保留 —— 用户自定义广告尺寸多变（970×250 / 728×90 / 300×250 等），硬编码数值反伤 CLS 预测精度。后续如需 CLS 完美可加 settings 字段让博主按实际广告标 dim

### v1.6.9-rc.01 & rc.02 累计 scope
- LHF-5 img dim: **11 处 `<img>` 补 numeric dim**（post_item / banner_item / relate_cards×2 / tags / categories / blogger / navbar×2 / hot_category×2 / banner_item_data×3）
- LHF-6 jQuery 3.5.1 → 3.7.1
- MED-1 OG image:alt + image:type + twitter:image:alt
- MED-5 iconfont 本地化 + font-display:swap
- 安全补丁 · Halo 动态菜单 10 处 `th:target` 条件 rel

---

## [1.6.9-rc.01] · 2026-04-20 · ⚡ v1.6.9 性能+安全打包（选项 A · prerelease）

Sprint v1.6.9 · audit 报告里的选项 A 打包：5 件改动并发 rc.01。

### Added · 性能
- **LHF-5 · `<img>` 补 16:9 numeric dimensions** · 3 个卡片模板：`post_item.html` / `banner_item.html` / `relate_cards.html` · 把原 `width="100%" height="100%"`（Lighthouse 不认）改为 `width="1600" height="900"` · 浏览器可预计算 aspect-ratio 提前占位 → **Core Web Vitals CLS 直接收益**
- **LHF-6 · jQuery 3.5.1 → 3.7.1** · 修 2020-era CVE + 微性能优化（`jQuery.htmlPrefilter` 等）· API 100% 向后兼容 · **严禁碰 jQuery defer**（踩过雷见 `feedback_jquery_defer_dom_guard.md`）
- **MED-5 · alicdn iconfont 本地化** · 3 个 CSS 合并为单一 `assets/lib/iconfont-local/iconfont.min.css` + 3 个 woff2 本地（joe-font / jiewen / third-font，合计 ~55 KB）· 加 `font-display: swap` 防 FOIT · **去第三方依赖** + **3 HTTP 请求 → 1 请求**

### Added · SEO 富化
- **MED-1 · OG image meta 补齐** · `og:image:alt`（文章标题 / 站点标题）+ `og:image:type`（按后缀推断 jpeg/png/webp/gif）+ `twitter:image:alt` · 提升社交分享卡辅助文本和平台识别度

### Added · 安全补齐
- **LHF-3 继续补**：Halo 动态菜单（`menu-item.html` + `navbar.html` 的 10 个 `th:target`）当 target=_blank 时自动 `rel="noopener noreferrer"` · 修 v1.6.8.1 当时只扫静态 `target="_blank"` 漏掉动态菜单渲染的 28 个菜单项

### 验证清单（rc.01 → stable 前必跑）
- 文章页 jQuery 功能：留言板便利贴 / 复制按钮 / fancybox lightbox / TOC / 瞬时照片 / 字数统计
- iconfont 渲染：左侧图标（首页/menu/文章/友链/图库 页脚）无"□"或空框
- menu 跳外链：确认新页面 `window.opener` 为 null（noopener 生效）
- OG meta：curl 文章页 grep `og:image:alt`, `og:image:type`, `twitter:image:alt` 各 1
- 四路：首页/文章/友链/图库 `</html>=1` 完整，debug-marker=0，删 lib 残留=0

### 保留决策（下一 sprint 候选）
- **MED-6** · `tail.html` jQuery 全量 defer（next.5 踩雷方案重启）· v1.6.10 独立 sprint
- **MED-2 / MED-3 / MED-4 / MED-7** · 字体策略 / 按页面条件加载 / 关键 CSS inline / aside fragment 抽取

---

## [1.6.8.1] · 2026-04-20 · 🐛 v1.6.8 发布后 audit 发现 4 个 bug 的 patch

发完 v1.6.8 立刻做了一次全面审计（SEO / Lighthouse / 代码质量），揪出 2 个严重 bug 和 2 个 hygiene 问题，一把合并进 patch。

### Fixed · 严重 bug
- **🚨 重复 canonical · 让文章 canonical 自 v1.6.x 首次引入以来从未真正生效**
  - `templates/modules/link.html:12` 有 `<link rel="canonical" th:href="${site.url}" />`（**每个页面** 都输出站点根 URL 作 canonical）
  - `templates/modules/layout.html:114` v1.6.x 新加的 `<link rel="canonical" th:href="${pageUrl}" />`（文章页正确指 permalink）
  - 浏览器/爬虫遇到重复 canonical **保留第一条** → link.html 的 `site.url` 在每页赢 → 文章 canonical 全部被降权到首页
  - **修复**：删 `link.html:12` 保留 layout.html 的 permalink-aware 版本。**从此文章页 canonical 真正指 article permalink**
- **🐛 `ttheme` typo · cursor_skin 在 clean_mode 下仍加载**
  - `templates/modules/link.html:173` 条件写错为 `ttheme.config.other.enable_clean_mode`（多一个 `t`）
  - Thymeleaf 未定义变量静默降级 → 条件永远被当未定义处理 → clean_mode 开关对 cursor_skin 无效
  - **修复**：`ttheme` → `theme`

### Added · 安全加固
- **7 处 `target="_blank"` 补 `rel="noopener noreferrer"`**：
  - `modules/common/actions.html:87`（console 编辑链接）
  - `modules/macro/navbar.html:168`（/console 登录后头像）
  - `modules/macro/relate.html:23,47`（相关推荐列表 category + tag 分支）
  - `modules/macro/hot_category.html:25,48`（热门分类 + 自定义）
  - `friends.html:64`（友链文章 postLink）
  - 防 reverse tabnabbing（打开的新页面用 `window.opener` 篡改原页），顺带给外部链接传递 SEO nofollow 信号（实际本次只加 noopener noreferrer，nofollow 留给后续按 per-link 判断）

### Removed · 代码卫生
- **删 `templates/post.html` 的 8 属性历史 debug span**（v1.6.4-rc 期调试 `enable_post_related_recommend` switch 的 5 种 th:if 对照实验遗留）
- 每篇文章页 HTML 减 ~500 字节，去除内部实现细节暴露（不再输出 `java.lang.Boolean` 类名等）

### 审计报告下一步（v1.6.9+ 候选）
全面审计还找出：
- **LHF-5 img width/height 补全** · CLS 直接收益 · S 规模（半天）
- **LHF-6 jQuery 3.5.1 → 3.7.1** · 安全+微性能 · S 规模（半天含 smoke）
- **MED-1 OG image dimensions** · 社交卡正确率 · M 规模（3-4h）
- **MED-5 iconfont 合并自托管** · 去第三方 + FCP 提升 · M 规模（3h）
- **MED-6 tail jQuery 统一 defer** · FCP/LCP 最大杠杆 · **重启 next.5 踩雷方案** · M 规模（1.5-2 天全页面验证）

详见 audit 报告 + `TODO.md` 后续更新。

### 升级
```
https://github.com/Lau0x/halo-theme-joe-next/releases/download/v1.6.8.1/theme-Joe3-1.6.8.1.zip
```

---

## [1.6.8] · 2026-04-20 · 🔍 JSON-LD 富结果支持 + README 安装指引升级

**经 rc.01 生产 4 路 smoke test + 3 块 JSON-LD 内容验证通过**一把过 stable。

### Added · SEO 富结果
- **WebSite** JSON-LD（所有页面 · 含 SearchAction，Google Sitelinks Search Box 候选）
- **BlogPosting** JSON-LD（文章页 · `headline / description / image / datePublished(+08:00) / dateModified / author:咕咕 / publisher / mainEntityOfPage / url`）
- **BreadcrumbList** JSON-LD（文章页 · 首页 → 分类 → 文章标题 三级）

独立 fragment `templates/modules/macro/json_ld.html`，未来加 FAQ / HowTo / Person 等 schema type 只改这一个文件。

### 设计决策（可查）
- author 固定 "咕咕"（用户 sprint 决策）
- datePublished ISO 8601 + JVM 时区 offset（`yyyy-MM-dd'T'HH:mm:ssXXX` pattern · Asia/Shanghai 输出 `+08:00`）
- URL 绝对化：cover / logo / permalink 非 `http` 开头则 `siteUrlClean + path`
- 转义：`th:inline="javascript"` Thymeleaf 自动双引号 + JS-safe 转义（JSON 是 JS 子集，`application/ld+json` 浏览器按数据读不执行）

### 生产验证
| 页面 | `application/ld+json` 块数 | 期望 | 结果 |
|---|---|---|---|
| 首页 | 1 (WebSite) | 1 | ✅ |
| 文章页 | 3 (WebSite + BlogPosting + BreadcrumbList) | 3 | ✅ |
| 友链 | 1 (WebSite) | 1 | ✅ |
| 图库 | 1 (WebSite) | 1 | ✅ |

文章页 curl 抓 BlogPosting 实体内容：title / author "咕咕" / datePublished `2026-04-13T13:40:00+08:00` / image 绝对 URL 全对。BreadcrumbList 3 级 position 1/2/3 正确。

### Changed · README 安装指引升级
- 修正 zip 文件名 `halo-theme-joe3-next.zip` → `theme-Joe3-X.Y.Z.zip`（与 release 实际产物一致）
- 新增"方式 A 远程下载（推荐）" + "方式 B 上传 zip" 双模式
- **加粗警示**：URL 必须以 `.zip` 结尾；Halo Console 输入框可能视觉截断，paste 后按 End 键确认
- 回应本 sprint rc.01 阶段踩的 URL 截断坑

### 回归面
- 相关推荐卡片（v1.6.6）：仍 3 张精确对齐 config ✅
- 瘦身 lib 残留（v1.6.7）：全站 0 引用 ✅
- 整页完整：4 路 `</html>=1` + 文章 `pagination-item=2` ✅

### 升级
```
https://github.com/Lau0x/halo-theme-joe-next/releases/download/v1.6.8/theme-Joe3-1.6.8.zip
```

⚠️ URL 必须完整以 `.zip` 结尾，paste 后验证最后 4 字符。

---

## [1.6.8-rc.01] · 2026-04-20 · 🔍 JSON-LD structured data 注入（prerelease）

Sprint: **SEO 富结果强化**。纯 `<head>` 追加，不动任何渲染逻辑，回归面接近 0。

### Added · JSON-LD schema types
- **WebSite** 所有页面 —— 含 `SearchAction` 潜在动作（Google Sitelinks Search Box 候选）
- **BlogPosting** 文章页 —— `headline / description / image / datePublished / dateModified / author / publisher / mainEntityOfPage / url`
- **BreadcrumbList** 文章页 —— `首页 → 分类 → 文章标题` 三级

### 设计决策
- **独立 fragment** `templates/modules/macro/json_ld.html` · 未来加 `FAQ / HowTo / Person` 等 schema type 只改这一个文件
- **author 固定** "咕咕"（按用户 sprint 决策）
- **datePublished** ISO 8601 带 JVM 时区 offset（`yyyy-MM-dd'T'HH:mm:ssXXX` pattern，Asia/Shanghai JVM 下输出 `+08:00`）
- **URL 绝对化** · cover / logo / permalink 非 `http` 开头则 `siteUrlClean + path`
- **转义策略** · `th:inline="javascript"` 让 Thymeleaf 自动双引号 + JS-safe 转义（JSON 是 JS 子集，application/ld+json 浏览器按纯数据读不执行）

### 回归面控制
- 追加到 `<head>` 末尾 OG tags 之后 / AdSense block 之前 —— 不影响任何现有渲染
- 不引入新 CSS / JS / 依赖
- Halo Thymeleaf 端仅评估 3 个 `<script>` block + 若干 `th:with`，渲染零开销

### 验证清单
- curl 文章页 → grep `application/ld+json` 应得 **3 块**（WebSite + BlogPosting + BreadcrumbList）
- curl 首页 → grep `application/ld+json` 应得 **1 块**（仅 WebSite）
- Google Rich Results Test: https://search.google.com/test/rich-results → 输入文章 URL 应识别出 BlogPosting + BreadcrumbList
- 验证通过后 promote v1.6.8 stable · 同步发 B（README badge 升级）+ C（记忆回填）

---

## [1.6.7] · 2026-04-20 · 🧹 主题瘦身 Pass 1 · 裁 288 KB 死代码

**经 rc.01 生产 4 路 smoke test 验证通过**（首页 / 文章 / 友链 / 图库 全部 `</html>=1` + 0 删除 lib 残留引用）。

### Removed（288 KB）
| 路径 | 大小 | 验证方式 |
|---|---|---|
| `templates/assets/lib/jquery-ui/` | 248 KB | grep 全仓 0 引用 |
| `templates/assets/lib/packery/` | 16 KB | 图库实际加载 masonry/isotope，未加载 packery |
| `templates/assets/lib/jquery-pjax/` | 12 KB | 无 loader 引用；pjax 被 Halo 原生路由替代 |
| `templates/assets/lib/jquery-toc/` | 8 KB | 文章页实际加载 tocbot，未加载 jquery-toc |
| `templates/assets/js/pjax.js` | 4 KB | 死代码，从不被任何 template 加载 |

### 保留决策
- `katex@0.13.18/` (2.3 MB) —— 数学公式场景（用户确认保留）
- `pdfjs/` (6.9 MB) —— PDF 嵌入场景（用户确认保留）
- `halo-comment/` (8.2 MB) —— fork 其他用户可能启用 Waline 需这个桥接

### 升级
Halo Console → 主题 → 远程下载：
```
https://github.com/Lau0x/halo-theme-joe-next/releases/download/v1.6.7/theme-Joe3-1.6.7.zip
```

### 下一步（v1.6.8 候选）
- lib 裁剪 Pass 2：中风险核查（需更多真实用户反馈决策是否有 PDF / 数学公式 / Waline 依赖者）
- README badge 切 v1.6.7（如果你有维护 badge 的话）
- 收集社区反馈补齐 v1.6.0 milestone "≥2 名外部用户装过并报告" 这个硬门槛

---

## [1.6.7-rc.01] · 2026-04-20 · 🧹 死代码清理 · 裁掉 288 KB 未引用 lib（prerelease）

Sprint: **lib 瘦身 Pass 1** —— 高可信度 0 引用候选一次清完。

### Removed（生产验证后 promote v1.6.7 stable）
- `templates/assets/lib/jquery-ui/` (248 KB) —— 0 引用（grep 确认除自己外无 template 使用）
- `templates/assets/lib/packery/` (16 KB) —— 0 引用（masonry + isotope 已覆盖相册/瞬间的 grid 需求）
- `templates/assets/lib/jquery-pjax/` (12 KB) —— 0 引用（pjax 功能本身已被 Halo 原生路由替代）
- `templates/assets/lib/jquery-toc/` (8 KB) —— 0 引用（toc 走 tocbot，见 post.js）
- `templates/assets/js/pjax.js` (4 KB) —— **意外发现的死代码**：依赖 jquery-pjax 但自己从不被 tail.html/layout.html 加载

### Kept（有依赖或潜在依赖）
- `katex@0.13.18/` (2.3 MB) —— 数学公式支持
- `pdfjs/` (6.9 MB) —— 文章 PDF 嵌入
- `halo-comment/` (8.2 MB) —— fork 用户可能启用 Waline 需这个桥接

### 验证清单（生产装完后必跑）
- 首页 scroll + 分页
- 文章页（含有长 toc 的）—— 确认 TOC 正常渲染，未报 `jquery.toc` 404
- 留言板 / 友链页
- 图库（相册 Isotope + Fancybox）—— 确认 masonry 布局未 404 到 packery

### 总计节省
**288 KB 主题 zip 体积 + 5 个 HTTP request（虽然都没 load，但 git 历史有）**。

---

## [1.6.6] · 2026-04-20 · 🎨 相关推荐卡片视觉升级 + 数量严格对齐 config

**经 10 个 prerelease 迭代（rc.01 → rc.10）完成。** 三联生产 smoke test 全绿：整页完整、pagination/comments 渲染、卡片数精确等于 config。

### Added · 相关推荐卡片视觉升级
- 卡片背景 `--classA` 灰 → `--background` 白（dark mode 独立深色）+ 1px `--classC` 边框
- 标题加 3×16px 品牌蓝 `::before` 竖条 accent
- hover 效果：`translateY(-3px)` + 品牌蓝阴影 `rgba(42,100,246,0.22)` + 边框变蓝
- `border-radius` 4px → 10px，过渡曲线 `cubic-bezier(0.4, 0, 0.2, 1)`
- meta 行日期/阅读数加 dashed 分隔线 + `tabular-nums` 数字等宽
- Dark mode 独立配色

### Fixed · 卡片数量严格对齐 config
**之前**：settings `count=3` 实际渲染 30 张卡片（10×）。

**真根因**（10 版 rc 的调试才抓到，归纳为**三重 bug 叠加**）：
1. **Halo config 读出是 String 类型** —— `data-debug-count-class` 实测 `java.lang.String`
2. **Thymeleaf `+` 混类型默认字符串拼接** —— `(config ?: 3) + 1 = "3" + 1 = "31"`（不是 4）
3. **Spring 隐式转换 "31" → int 31** 作为 pageSize，fetch 31 条 - self-filter = 30 卡

**修复策略**（4 个设计决策）：
1. `T(java.lang.Integer).valueOf(count.toString()) + 1` 强制算术，不走字符串拼接
2. pageSize 用 `count`（不加 +1 兜底），默认情况 Halo 返回不含 self，count 张精确对齐 config
3. 外层单次迭代用 `post.categories.subList(0, 1)` Java 层硬砍，不依赖 Thymeleaf `outerStat.first`（实测不可靠）
4. 内层 `th:each` 保持简洁：只 self-filter，不加 `iterStat` 或 Elvis 比较（实测触发同类陷阱）

### 血泪教训（写进 `docs/release-sop.md`）
| # | 教训 | 来源 |
|---|---|---|
| 1 | Thymeleaf `+` 混类型 → 字符串拼接，config 参与算术必须先 `Integer.valueOf` 强制转 int | rc.02-07 六连错方向，根因全在这 |
| 2 | Halo config 读出类型不是直觉的 Integer，用 debug marker `.getClass().getName()` 验证 | rc.08 才加 debug |
| 3 | 连续 3 版同方向失败 → 立即加 debug marker，不许再猜 | rc.02-07 六连失败后 rc.08 才加 |
| 4 | Thymeleaf `<th:block>` 上多 `th:*` 同元素（each/if/with）不可靠，拆嵌套 single concern | rc.07 拆 4 层无效 |
| 5 | Java `List.subList(0, 1)` 比 Thymeleaf `outerStat.first` 更可靠 | rc.04-07 stat 过滤全失效 |
| 6 | fragment 级改动必须 curl 验证 `</html>` + pagination 元素完整（不只验证新功能） | rc.02/03 炸整页让用户当小白鼠 |
| 7 | "抄上游 proved code" ≠ 100% 保真（上游数据形态可能不同）| v1.6.5 外层 pattern 在我们数据下表现不同 |

### 10 版 rc 发布记录（透明追责）
- rc.01：视觉升级（CSS 重做）✅ 视觉部分一直稳定
- rc.02：想修卡片数但引入 Elvis+字符串拼接旧 bug + 新 iterStat 陷阱 → 炸整页 ❌
- rc.03-04：继续猜外层迭代，拆嵌套 → 仍炸整页 ❌❌
- rc.05：内层 revert 到 v1.6.5 → 整页不炸但 30 卡 ⚠️
- rc.06-07：继续改外层 `post.categories` + 拆嵌套 → 仍 30 卡 ⚠️⚠️
- rc.08：**加 debug marker 转折点** → 抓到 `cat-size=1` 和 `count-class=String` 🎯
- rc.09：Integer.valueOf 修字符串拼接 → 4 张卡（+1 兜底过头）
- rc.10：去掉 +1 → **3 张卡精确对齐 config** ✅

### 升级后
- 主题设置 → 文章页 → 勾选"评论区上方显示相关推荐"
- "相关推荐卡片数量"按需调整（2-6，默认 3）
- 如首次启用该功能字段灰色，切换主题后再切回刷新 schema

### 致谢
感谢用户在 10 版 prerelease 迭代中反复升级测试 + 提供精准 bug 复现信息。这个功能的稳定是**用户耐心 + 维护者脸皮**双重产物。

---

## [1.6.6-rc.10] · 2026-04-20 · 🎯 去掉 `+1` 兜底 · 卡片数严格对齐 config（prerelease）

**rc.09 debug marker 确认** `data-debug-count-class="java.lang.String"` → 假设完全正确，Halo config 就是 String，rc.09 的 Integer.valueOf 修复彻底解决字符串拼接。

**rc.09 实测卡片数 = 4**（期望 3），原因：`count + 1 = 4` 作为 pageSize，Halo `listByCategory` 返回 4 条，self-filter 对当前 post 不在结果集时不生效 → 4 张全显示。

### Fixed · rc.10
去掉 `+ 1` 兜底：
```xml
recommendPosts = ${postFinder.listByCategory(1, recommendCountInt, category.metadata.name)}
```
fetch 正好 `count` 张：
- vmrack-test 这种 self 不在 Halo 返回结果集的情况 → 出 **count 张**（完美对齐 config）
- self 偶尔在结果集（post 刚发布很新）→ 出 count-1 张（可接受 edge case）

原本 `+ 1` 是防 self 在结果里被过滤变 count-1 的补偿，实测绝大多数 post 的 self 不会出现在自己分类的"相关推荐"结果里（Halo 或后端可能已内部去重），这个 `+1` 反而变过头了。

---

## [1.6.6-rc.09] · 2026-04-20 · 🎯 真正的根因 · 字符串拼接 bug（prerelease）

**rc.08 debug marker 抓到真相**：`data-debug-cat-size="1"` —— post 只有 **1 个 category**。30 张卡片来自 **1 次 listByCategory 返回 31 条帖子**，不是外层多次迭代。

### 真根因（7 版 rc 才抓到）
```
postFinder.listByCategory(1, (theme.config.post.post_related_recommend_count ?: 3) + 1, ...)
                            ↑
              Halo config 取出来是 String "3"
              Elvis 操作符保留 String → "3"
              + 1 是字符串拼接 → "31"
              Spring 转换 "31" 成 int 31 作为 pageSize
              fetch 31 条帖子 - 1 self-filter = 30 张卡片
```

v1.6.5 开始绑定 config 就一直是 30 卡，我从 rc.02 开始一直以为是**迭代 bug** 在改外层 th:each，**走了 6 版冤枉路**（rc.02/03/04/05/06/07 全错方向）。rc.08 debug marker 才把这个盲区捅开。

### Fixed · rc.09
```xml
<th:block th:with="recommendCountRaw = ${theme.config.post.post_related_recommend_count ?: 3},
                   recommendCountInt = ${T(java.lang.Integer).valueOf(recommendCountRaw.toString())},
                   recommendPosts = ${postFinder.listByCategory(1, recommendCountInt + 1, category.metadata.name)}">
```

先 `toString()` 兜底，再 `Integer.valueOf()` 强制转 int，然后 `+1` 是真算术，pageSize = 4 → fetch 4 条 - 1 self = **3 张**。

### 增强 debug marker
```
data-debug-count-raw / data-debug-count-class
```
暴露 config 实际 Java 类型（预期 `java.lang.String` 或 `java.lang.Integer`），为未来类似 debug 留抓手。

### 顶层沉淀（写进 docs/release-sop.md）
- **任何 `config_value + 常量` 表达式永远先 toString + Integer.valueOf 强制转 int**，Thymeleaf OGNL 对混类型的 `+` 运算默认字符串拼接
- **连续 3 版同方向修复都失败 → 立刻停下加 debug marker**，我应该在 rc.05 就加，拖到 rc.08 才加是严重失职
- **config 读取的类型假设永远用工具验证，不能凭感觉**（红线二"未验证就甩锅"的第 N 次踩雷）

---

## [1.6.6-rc.08] · 2026-04-20 · 🔧 改用 Java subList 硬砍单元素（prerelease）

**rc.07 实测 30 张全是不同内容** —— outer 真跑了 10 次（post 有 10 个 category），`outerStat.first` 在任何嵌套层级都没过滤。rc.04-07 连 4 版 stat 过滤无效。

### Fixed · rc.08 不再依赖 Thymeleaf stat
直接 Java 层砍 List：
```xml
<th:block th:each="category : ${post.categories.subList(0, 1)}">
  <th:block th:with="recommendPosts = ${postFinder.listByCategory(..., category.metadata.name)}">
    <a th:each="recommendPost : ${recommendPosts.items}" ...>
```

`List.subList(0, 1)` 返回保证 1 元素的 List，th:each 最多跑 1 次。不依赖任何 `outerStat.first` 语义。

### 诊断抓手
加了 debug marker span：
```html
<span data-debug-rc="rc.08" data-debug-cat-size="N" data-debug-tag-size="M">
```
curl 可直接看 post 的实际 category/tag 数量，未来 debug 无须猜。

---

## [1.6.6-rc.07] · 2026-04-20 · 🎯 把 th:each/th:if/th:with 拆四层嵌套（prerelease）

**rc.06 仍 30 卡**：真 List 迭代 + 同元素 `outerStat.first` th:if **没起过滤作用**。根因：`<th:block>` 上 `th:each` + `th:if` 在同一元素的处理顺序不可靠。

### Fixed · rc.07
把 4 个职责拆到 4 个独立嵌套 `<th:block>` 上：
```xml
<th:block th:each="category, outerStat : ${post.categories}">  <!-- 职责 1: 迭代 -->
  <th:block th:if="${outerStat.first}">                        <!-- 职责 2: 过滤 -->
    <th:block th:with="recommendPosts = ${postFinder.listByCategory(..., category.metadata.name)}">  <!-- 职责 3: fetch -->
      <a th:each="recommendPost : ${recommendPosts.items}"     <!-- 职责 4: 渲染 -->
         th:if="${post.metadata.name != recommendPost.metadata.name}">
```

每个 block 单职责 → Thymeleaf 处理器顺序清晰 → `outerStat.first` 在外层 block 绑定后，独立的内层 block 才做 th:if → filter 生效。

外层变量改名 `category`（避免与 `recommendPosts` 命名冲突）。Tag 分支同理 `tag, outerStat : post.tags`。

### 教训
- **Thymeleaf `<th:block>` 上多个 th:* 属性同存在（each/if/with）不可靠**，一律拆到嵌套 block 每个单职责
- 这次 rc.06 我以为"真 List + first"就行，没拆同元素多属性 → 1 版本就能看出的问题拖到 rc.07

---

## [1.6.6-rc.06] · 2026-04-20 · 🎯 卡片数量对齐 config 最终修复（prerelease）

**rc.05 部分胜利**：整页不崩（198KB 完整，`</html>=1`, pagination=2, comments 渲染正常），但卡片数仍 30 张（期望 3）。

### 根因
`th:each="... : ${post.categories[0]}"` 迭代的是**单个 CategoryVo 对象**（非 List）。Thymeleaf 对非 List 对象的 `th:each` 会按 POJO getter 字段做"伪迭代"（我们环境下 10 次），`outerStat.first` 在这种伪迭代下行为不一致 → 10 次全部通过 `first` 判断 → 30 卡片。

### Fixed · rc.06 唯一改动
`${post.categories[0]}` → `${post.categories}`（真 List）：

```xml
th:each="recommendPosts, outerStat : ${post.categories}"
th:if="${outerStat.first}"
th:with="recommendPosts = ${postFinder.listByCategory(..., recommendPosts.metadata.name)}"
```

真 List 上 `outerStat.first` 行为确定（只第 0 次为 true）→ 无论 post 有多少 category，只第一个 category 被 listByCategory → 4 fetched - 1 self = 3 卡片对齐 config。

Tag 分支同理（`${post.tags[0]}` → `${post.tags}`）。

### 教训
- **Thymeleaf th:each 严禁直接迭代非 List 对象** —— 伪迭代行为未文档化且因环境/版本而异
- 改完后 **`grep -c 'class="joe_related__card"'` 必须精准等于 config 值**，不能只看"渲染出来了"就收工

---

## [1.6.6-rc.05] · 2026-04-20 · 🚨🚨🚨🚨 rc.04 仍崩 · 内层写法才是罪犯 · 最保守 revert（prerelease）

**rc.04 仍崩**。curl 实测 `</html>=0, cards=0`，页面仍在 fragment 插入点截断。

### 真相（rc.02/03/04 三连失败的共同罪犯）
我在 rc.02/rc.03/rc.04 三个版本**内层 th:each 和 th:if 都加了 `iterStat + lt + Elvis 比较`** 这套组合：
```
th:each="recommendPost, iterStat : ${recommendPosts.items}"
th:if="${post.metadata.name != recommendPost.metadata.name and iterStat.index lt (theme.config.post.post_related_recommend_count ?: 3)}"
```
v1.6.5 内层**根本没有**这些。我一直在改外层、讨论 HTML 实体 / 作用域 / 链式访问，**忽略了内层三个新增就是共同罪犯**。

### Fixed · rc.05 最保守改动
- **内层完全 revert 到 v1.6.5 写法**：
  ```
  th:each="recommendPost : ${recommendPosts.items}"
  th:if="${post.metadata.name != recommendPost.metadata.name}"
  ```
  无 iterStat，无 lt，无 Elvis 在 th:if 里
- **外层只加 `outerStat.first` th:if** 把 outer 迭代压到 1 次
- 外层 1 次 × 内层 4 fetched - 1 self = **3 cards 自然对齐 config，不需要内层任何上限**

### 失败对比表（给未来维护者）
| 版本 | 外层 | 内层 iterStat | 内层 lt 比较 | Elvis `?: 3` 在 th:if | 结果 |
|---|---|---|---|---|---|
| v1.6.5 | th:each over `[0]` | ❌ | ❌ | ❌ | ✅ 整页 OK (过度迭代 30 卡) |
| rc.02 | th:if + with | ✅ | ✅ | ✅ | ❌ 整页崩 |
| rc.03 | th:if + with (lt 不实体) | ✅ | ✅ | ✅ | ❌ 整页崩 |
| rc.04 | th:each + outerStat.first | ✅ | ✅ | ✅ | ❌ 整页崩 |
| rc.05 | th:each + outerStat.first | ❌ | ❌ | ❌ | 待验证 |

### 教训刻进 SOP（再也不能忘）
- **debug 期间严禁引入新表达式复杂度** —— 我在 rc.02 同时改外层 + 内层加防御性 cap，两个方向同时动 → 无法隔离变量
- **7 项检查清单的"试过完全相反的假设"不能跳** —— rc.02/03/04 一直假设"罪犯在外层"，第 4 版才打开反向假设"罪犯在内层"
- **任何 Thymeleaf `th:if` 里不要嵌 Elvis `?:` + 算术/比较** —— 即使语法上支持，和其他运算符交叉可能踩编译器的坑
- **fragment 级改动必须本地 Halo 实例预跑 curl smoke test 后再 push tag**，rc.02/03/04 三次都让用户当试错小白鼠，红线二"未验证就交付"的重大违反

---

## [1.6.6-rc.04] · 2026-04-20 · 🚨🚨🚨 rc.03 仍在 fragment 插入点硬截断 · 真正根因修复（prerelease）

**rc.03 没修好。** 生产 curl 实测 `grep -c '</html>' = 0`, `grep -c 'joe_related__card' = 0`, 文件仍在 `<!-- 相关推荐` 处截断。rc.02 的"lt vs `&lt;`" / "fragment 根 th:with" 3 个改动都是**擦边猜测**，不是根因。

### 真正根因（抓到了）
`postFinder.listByCategory(1, count+1, post.categories[0].metadata.name)` 里把 **`post.categories[0].metadata.name` 作为方法调用参数内联** → Thymeleaf 编译/求值失败。

与 `v1.6.4-rc.02` 事故（`.listByCategory(...).items` 链式字段访问）同宗同源——**Thymeleaf 在方法调用 + 链式属性访问交叉区有兼容陷阱**。

### v1.6.5 为什么没事？
v1.6.5 的 `.metadata.name` 是访问 `th:each` 绑定的**循环变量**（纯属性链 `recommendPosts.metadata.name`），而 rc.02/rc.03 我把它挂到 `post.categories[0]` 后面又塞进方法参数里 → **链式 + 方法参数的双重触发**。

### Fixed · rc.04 唯一改动
回到 v1.6.5 proven 的 `th:each + th:with override` 外层模式，**只加** `outerStat.first` 硬限外层单次迭代：

```xml
<th:block
  th:each="recommendPosts, outerStat : ${post.categories[0]}"
  th:if="${outerStat.first}"
  th:with="recommendPosts = ${postFinder.listByCategory(1, count+1, recommendPosts.metadata.name)}">
```

- 外层 `th:each` 保留（已知不崩）
- `recommendPosts.metadata.name` 访问**循环变量**（纯属性链，v1.6.5 proven）
- `outerStat.first` 把外层迭代压到 1 次 → 不再 10 倍爆炸
- 内层保留 `iterStat.index lt (count)` 硬上限防御 self-filter 漏位

### 教训 · 这次必须刻进 SOP
- **任何 Thymeleaf 方法调用参数里出现 `a.b[0].c.d` 这种"索引 + 链式"表达式 → 高危 · 必须先 `th:with` 拆成单级变量**
- **"照镜子"提前**：连错 2 版的时候别急着发 rc.03，先对比稳定版（v1.6.5）和崩溃版（rc.02）的字符级 diff，找唯一的本质差异——我在 rc.02/03 两版都绕着"lt/实体/作用域"猜，就是没打开镜子
- **发 fragment 级改动的 rc 之前，必须本地或预发 curl 验证 `</html>` + pagination 元素** —— rc.02/rc.03 没验证整页完整性就发 tag，两次都炸给真实用户

---

## [1.6.6-rc.03] · 2026-04-20 · 🚨🚨 rc.02 整个文章下半截被吞的紧急修复（prerelease）

**rc.02 引入了新事故**：fragment Thymeleaf 编译失败 → HTML 在相关推荐插入点硬截断 → pagination/comments/footer 全部不见。生产 curl 实测 **HTTP/2 INTERNAL_ERROR + 文件末尾定格在 `<!-- 相关推荐` 注释中**。这是 v1.6.4-rc.02 同类事故第二次发生。

### Fixed
- **rc.02 的 3 个 fragment 写法 bug 全数修掉**：
  1. `th:with="recommendCount = ..."` 原本放在 `<th:block th:fragment="relate_cards">` 根上 → Thymeleaf 对 fragment 根元素属性求值时序不稳 → 内层 `th:with` 使用 `recommendCount` 的地方可能看不到这个变量 → 编译失败
  2. `th:if="... and iterStat.index &lt; recommendCount"` 用 HTML 实体 `&lt;` 写比较符 → 实体解码与 Thymeleaf 表达式解析交叉区有歧义 → **即使语义上正确也会触发编译错误**
  3. 跨层变量引用加深了编译器追踪路径
- **修复策略**（3 个本质不同的改动）：
  1. `th:with` 从 fragment 根**挪到真正需要的内层 `<th:block th:if="...">`** 上
  2. 用 **OGNL 关键字 `lt`** 代替 `&lt;`（Thymeleaf 标准支持 `lt` `gt` `le` `ge` `eq` `neq`）
  3. **不跨层引用 recommendCount**，直接在每个表达式里内联 `theme.config.post.post_related_recommend_count ?: 3`

### 教训（红线级别·写大 blacklist 里）
- **Thymeleaf fragment 根 `th:with` 不可靠** —— 跨作用域引用容易出问题，永远在需要的最近内层 block 上声明 th:with
- **th:if / th:with 表达式里永远用 OGNL 关键字 `lt gt le ge eq neq`，不用 HTML 实体 `&lt; &gt;`** —— 实体编码是 XML 语法层，Thymeleaf 表达式是应用层，两层交叉区有陷阱
- **任何 fragment 级 Thymeleaf 改动 → 立即 curl 验证 "文件完整到 `</html>` + 文章 pagination/comments 元素存在"**，不是只验证新功能是否出现；rc.02 我只查了 `count=3` 是否修好，没查整页是否炸 → 红线二"未验证就甩锅"的变形
- **从今天起写进 `docs/release-sop.md` 的强制 smoke test**：每次发版 curl 后必跑：
  ```bash
  grep -c '</html>' /tmp/page.html   # 期望 1, 0 = HTML 被截断
  grep -c 'joe_post__pagination-item' /tmp/page.html   # 期望 2 (上/下篇)
  ```

---

## [1.6.6-rc.02] · 2026-04-20 · 相关推荐卡片数量爆炸修复（prerelease · 🚨 已被 rc.03 紧急修复）

**⚠️ 已知不稳定 · 请勿使用**：fragment 根 `th:with` + HTML 实体 `&lt;` 的组合导致 Thymeleaf 编译失败，整页下半截被吞。修复见 rc.03。

### Fixed（方向对但写法踩雷）
- 相关推荐卡片数量失控：settings `count=3` 生产渲染 30 张（10×）
- 根因：外层 `th:each` 对 `post.categories[0]` 不可控迭代（10 次）
- 修复方向（rc.03 沿用并真正 ship）：外层 `th:with` 单次 fetch + 内层 th:each 硬上限

### Added（从 rc.01 继承 · 视觉升级）
- 卡片背景 `--classA` 灰 → `--background` 白 + 1px `--classC` 边框，radius 10px
- 标题 3×16px 品牌蓝 `::before` 竖条 accent
- hover: translateY(-3px) + 品牌蓝阴影 `rgba(42,100,246,0.22)`
- meta 行 dashed 分隔线 + `tabular-nums`
- Dark mode 独立配色

---

## [1.6.6-rc.01] · 2026-04-20 · 相关推荐卡片视觉升级（prerelease · 后被 rc.02 覆盖）

**已知遗留**：外层 th:each 对 `post.categories[0]` 不可控迭代，导致卡片数量爆炸（见 rc.02）。视觉代码本身无问题，rc.02 继承。

---

## [1.6.5] · 2026-04-20 · 广告位 CSS 三连修复 + 相关推荐数量生效 + SOP 文档

经 2 个 prerelease（`rc.01 → rc.02`）+ playwright computed style 实测定位根因最终落地。**生产 3 个广告 CSS 属性完全一致**：`position=relative, top=0, marginBottom=15px, gap=15px`。

### Fixed
- **侧边栏第 3 个广告 × 按钮飞到页面左上角**
  - playwright 实测：3 号广告 `ad_position=static`、按钮 `rectX=6 rectY=6`（整个页面左上角）
  - 根因：上游 `.joe_aside__item:last-child { position: sticky; top: 75px }` 跟我的 `.advert { position: relative }` CSS specificity 都是 (0,2,0)，B1 override `:last-child { position: static }` 在后 cascade 胜出，广告是 last-child 时被拖成 static，× 按钮绝对定位时找不到 relative 祖先一路冒到 body
  - 修复：B1 override 加 `:not(.advert):not(.aside_custom)` 精确排除
- **rc.01 遗留：3 号广告向下偏移 75px 空白**
  - rc.01 只盖了 `position`，上游的 `top: 75px` 残留 → `position: relative + top: 75px` = 向下偏 75px
  - 同时 `:last-child` 原生 `margin: 0`（避免贴底）也还在
  - rc.02 修复：给 advert/aside_custom/joe_advert-large 统一加 `top: auto + margin-bottom: 15px`，彻底清除上游 sticky 残留属性

### Changed
- **相关推荐 fragment pageSize 绑 config**
  - 之前硬编码 `postFinder.listByCategory(1, 4, ...)` 忽略用户 settings
  - 现在 `postFinder.listByCategory(1, (count ?: 3) + 1, ...)`
  - settings `post_related_recommend_count` 字段真正生效（+1 保证过滤当前文章后仍凑足 N 张）

### Added
- **`docs/release-sop.md` · 7 KB 发版 SOP 文档**
  - 3 大核心原则：debug 走 prerelease / 抄上游 proved code / 诊断不重构
  - 0-5 步标准流程 + 语法校验 + curl / playwright smoke test
  - 8 条今天踩过的坑 blacklist（Thymeleaf 注释/链式调用/CSS specificity 等）
  - 7 步"功能不渲染"诊断方法论
  - Tag 命名规范（zero-pad）+ commit/tag message style

### 血泪教训沉淀
从 `v1.5.1-next.11` 最早引入 × 按钮开始，**历经 4 个月 + 今天 3 个 prerelease iteration** 才把广告位的 3 个叠加 bug（按钮飞走 + 75px 偏移 + margin 缺失）全部修对。根因最终靠 **playwright computed style + getBoundingClientRect** 破案——这是视觉 debug 的**决定性工具**，以后看不到但 DOM 在的问题第一步就上它。

---

## [1.6.4] · 2026-04-20 · 相关推荐卡片功能终极修复（evening 版）

经 4 个 prerelease 迭代（`rc.01 → rc.04`）最终完全可用。**生产 curl 验证**：3 张卡片全部渲染，封面图 HTTP 200 真实加载，pagination/comment 区域不受影响。

### Fixed
- **fragment 链式调用 `postFinder.listByCategory(...).items` Thymeleaf 不支持 · 直接吞掉整个文章下半截**（rc.02 事故，rc.03 修复）
  - 改成**抄上游 `relate.html`** 的 `th:each + th:with override` pattern：先 `th:with=${postFinder.listByCategory(...)}` 赋值整个结果对象，再 `th:each="recPost : ${recPosts.items}"` 访问 `.items`
  - **不发明新写法，优先 copy 上游 proven code**
- **cover 封面 fallback 用了占位图自己作 fallback · 导致无 cover 文章永远显示粉圆占位**（rc.03 bug，rc.04 修复）
  - 改成**抄上游 `post_item.html`** 的 cover 多级 fallback：`spec.cover → home.post_thumbnail → random_img_api?pageid=...`
  - `th:with` 分步赋值避免嵌套三元再次触发 Thymeleaf parse fail

### 保留
- v1.6.1+ 的 `th:if="${#bools.isTrue(theme.config.post.enable_post_related_recommend)}"` 用 Thymeleaf 官方 Boolean utility
- v1.6.2 的 debug marker span + `data-debug-*` 属性（生产用不影响，开发 curl 诊断神器）

### 升级后别忘
- 主题设置 → 文章页 → 勾选"评论区上方显示相关推荐" → 保存
- 如从 next.X 升级发现字段灰色：主题先切到任意其他主题 → 切回 Joe3（强制 Halo 重读 settings schema + 重建 ConfigMap）

### 4 天 20+ 版本迭代的复盘
见本 CHANGELOG 下面 `[1.6.3]` / `[1.6.2]` / `[1.6.1]` 等 entries。

### Known limitations（下版修）
- fragment 里 page size 目前**硬编码 4**，不用 `post_related_recommend_count` config
- 想真正用 config 里的数量，`v1.6.5` 继续打磨

---

## [1.6.3] · 2026-04-20 · 相关推荐 th:if 用 `#strings.toString` 彻底解决类型兼容

### Fixed
- **`enable_post_related_recommend` 已开但仍不渲染的终极修复** · `post.html`
  - v1.6.2 的 debug marker 证实 Halo 传给模板的值实际是 **`"true"`**（字符串或 boolean 包装对象，curl attr 看不出区别）
  - 但 v1.6.1 写的 `th:if="${... == true or ... == 'true'}"` **仍然判 false**——说明 Thymeleaf 在当前 Halo 环境下 `==` 对 config value 的包装对象做 identity/class 比较而非值比较
  - 改用 `#strings.toString(...)` 把任意类型**统一成字符串**再比较：
    ```
    th:if="${#strings.toString(theme.config.post.enable_post_related_recommend) == 'true'}"
    ```
  - 这种写法不依赖底层数据类型（Boolean / String / null 全部能处理）
- 同类模式下游开发者注意：Halo theme config 新 schema 字段（尤其 switch）用 Thymeleaf `==` 比较可能不可靠，推荐 `#strings.toString() == 'true'` 作为 SOP

### 保留
- v1.6.2 的 debug marker（隐藏 span + data-*）继续保留——如果还是不 render，curl 依然能查到实际值，便于后续 debug

---

## [1.6.2] · 2026-04-20 · debug marker 语法修复（可 curl 可见）

### Fixed
- **v1.6.1 的 debug marker 用了 Thymeleaf `<!--/* ... */-->` 语法 → 完全不出现在输出 HTML**
  - Thymeleaf 的 `<!--/* ... */-->` 是 **parser-level comment**（仅模板开发时可见），渲染时被完全移除，curl 后 HTML 里找不到
  - 改用 **隐藏 span + `data-*` 属性**（`th:attr` 把表达式 evaluate 后写到 data 属性里）
  - 现在 curl 文章页能看到：`<span style="display:none" data-debug-related-switch="..." data-debug-related-count="..."></span>`
  - 真实 switch 值一目了然，便于排查 Halo ConfigMap 实际传什么值

### 仍然保留 v1.6.1 的 th:if `== true or == 'true'` 双态比较
这是核心修复，不动。

---

## [1.6.1] · 2026-04-20 · 相关推荐 switch 三态兼容 + debug marker

### Fixed
- **`enable_post_related_recommend` switch 开启后 `.joe_related` 不渲染** · `post.html`
  - 用户反馈：v1.5.1-next.20 下勾选"评论区上方显示相关推荐"并点保存后，文章页无相关推荐卡片
  - 诊断：curl 文章页 `joe_related` class 0 渲染。对照组同 `post` group 下的 `enable_passage_tips` 等 switch 正常，确认是该字段专有问题
  - 根因：Halo ConfigMap 对新 settings schema 字段可能存为 null / boolean / 字符串三种状态；原 `th:if="${theme.config.post.enable_post_related_recommend}"` 对字符串 `"false"` 会判 true，对 `null` 判 false，行为跟其他 switch 字段不一致
  - 修复：改成显式 `== true or == 'true'` **双态兼容比较**（跟上游 Joe3 已有 switch 字段风格对齐）
- **加 debug marker** · 即使 switch 为 false / null，文章页 HTML 也会输出一行 comment：`<!--/* related_recommend: switch_raw=..., count=... */-->` 便于 curl 诊断 Halo 到底传了什么值

### 升级后用户还是看不到怎么办
如果从 v1.5.1-next.20 或更早版本升级到 v1.6.1 仍然没渲染：
1. Halo Console → 主题 → **禁用** theme-Joe3 → 立刻 **启用** theme-Joe3（强制 Halo 重读 settings.yaml schema + 重建 ConfigMap）
2. 主题设置页找到开关重新**打开 + 保存**
3. 刷新文章页验证

### 验证
- YAML 语法 OK ✅
- post.html 插入点不变 ✅
- th:if 比较表达式兼容 Thymeleaf 3.x ✅

---

## [1.6.0] · 2026-04-20 · 🎉 第一个正式稳定版

从 fork 启动的 `v1.5.1-next.1`（2026-04-19）到 `v1.5.1-next.20`（2026-04-20）期间积累 20 个迭代版本的集大成者。本版本标志着 **社区接棒维护进入稳定期**——以后的小版本升级会走 `v1.6.x` / `v1.7.x` 常规节奏，不再连发 `-next.N`。

### 亮点（累计自 next.1 → next.20）

#### 🔴 关键 bug 修复
- **P0 · 反向升级地雷拆除**（next.3）· 移除 `store.halo.run/app-id` 注解，避免 Halo Console 显示升级提示时把用户一键拉回上游官方市场版
- **P0 · jQuery defer 事故**（next.6）· 上版本的 defer 改动破坏 body 内所有 src script 执行时序，紧急回退 + 补 RCA 文档
- **P1 · 图片顺序错乱防御加固**（upstream#353 / next.2）· photo gallery 加 `data-order` 属性 + 简化计算逻辑
- **SEO canonical 错误**（next.10）· 文章页 `canonical` / `og:url` 从首页改为文章 permalink
- **× 关闭按钮跨背景可见性**（next.17 → next.19 迭代 3 次）· 从 rgba 半透明深底踩坑深色广告融合，最终落在左上 + 低调半透明 + 双 shadow 跨底色方案
- **Service Worker 迁移清理**（next.15）· 自动清 hexo 遗留 SW + CacheStorage，旧访客浏览器不再卡在老首页

#### 🟢 新功能
- **Google AdSense Auto Ads 集成**（next.8）
- **文章页广告 max=5 · 侧边栏 / 顶部 / 底部**（next.16）· 解除上游硬编码 max=1 限制
- **广告 × 关闭按钮 + sessionStorage 记忆**（next.11 / next.13）· session 级关闭体验，跨 tab 广告自然恢复
- **评论区上方横排相关推荐卡片**（next.20）· 响应式 3 列 · 默认关闭 · 暗色适配
- **动态文章 OG tags + footer 署名**（next.7）

#### 📚 文档 · 工程基建
- **CHANGELOG.md 从零建**（next.5+）· Keep-a-Changelog 格式
- **README 全面重构**（next.20）· SVG hero banner（对齐博客 `#2A64F6` 主色）+ playwright 真实截图（亮/暗/文章页）替换野鸡图床
- **deploy docs**（NPM 配置 + 安全头 A 评级）
- **CONTRIBUTING / CODE_OF_CONDUCT / dependabot**（社区治理基建）
- **release workflow**（tag push 自动 build zip + 发 GitHub Release + 生成 commit list）

#### 🔄 重构
- **扩展 widget 系统先加后砍**（next.14 → next.18）· YAGNI 复盘：一行 `max: 5` 解决的问题最初绕成 4 档 sticky 位置选择 + 13 种 widget 类型派发，实测零用户使用后砍回去 -447 行代码

### 升级安全承诺
- `metadata.name` / `settingName` / `configMapName` 全部跟上游 Joe3 一致 · Halo Console 直接"上传新 zip"覆盖即可 · **后台所有设置（博主信息 · Waline Token · 颜色等）不会丢**
- 从任何 `v1.5.1-next.X` 升级到 `v1.6.0` · **零破坏性变更**（v1.6.0 的代码就是 next.20 代码，只是 version string + stable 标记）

### Known Gaps（诚实交底）
1. **1 周 soak test 未完成**：next.20 在维护者博客（blog.laoda.de）生产跑约 1 小时稳定无事，但没跑满 1 周观察期。欢迎遇到 bug 开 issue 反馈
2. **Sprint 3 性能深度优化后续**：CSS 细粒度拆分 / JS 完整 defer / 更激进的 lazy load 放在 `v1.6.x` 小版本继续打磨
3. **外部用户测试欢迎**：目前仅 maintainer 本人生产验证，欢迎 2 名以上 Halo 用户装上并 issue 反馈初体验

### 往下怎么做
- `v1.6.x` 节奏：关键 bug 立即发，非关键攒到周末合并发 1 版（每天最多 2 版的发版 SOP）
- `v1.7.0`：下一个 milestone，计划目标 Sprint 3 性能基建 + a11y 系统性提升
- Prerelease 命名若将来再用，会 zero-pad 成 `v1.7.0-rc.01` 这种格式避免 GitHub UI 字典序排序错乱

### 致谢
- 🙏 [Jiewenhuang](https://github.com/jiewenhuang) · 原作者，fork 的直接上游
- 🙏 [qinhua](https://github.com/qinhua/halo-theme-joe2.0) · Halo 1.x 时代 Joe2.0
- 🙏 [HaoOuBa](https://github.com/HaoOuBa/Joe) · 最早的 Typecho Joe
- 🙏 [Halo](https://halo.run) 核心团队 + 社区所有反馈

---

## [1.5.1-next.20] · 2026-04-20 · 评论区上方相关推荐卡片

### Added
- **文章页评论区上方 · 横向相关推荐卡片** · 新功能 · 默认关闭
  - 新模板 `templates/modules/macro/relate_cards.html`（横排封面卡片版本，跟侧边栏 list 版的 `relate.html` 独立）
  - `post.html` 评论区之前加插入点，按 `theme.config.post.enable_post_related_recommend` 条件渲染
  - 数据源跟侧边栏 `relate` 一致：优先 category，无则 tag，过滤掉当前文章本身
  - 卡片样式：16:9 封面 · 2 行标题省略 · 日期 + 阅读数 meta · hover 上浮 + 封面微缩放
  - 响应式：桌面 3 列、移动端 1 列
  - 全部用 CSS 变量，**暗色模式自动适配**无需额外规则
- **两个新 settings**（post group）
  - `enable_post_related_recommend` switch · 默认 false，老用户升级视觉无变化
  - `post_related_recommend_count` number · 默认 3 · 范围 2-6

### Rationale
用户反馈："评论区和正文的上方假如做一个相关文章推荐"。做之前对齐了三个顶层设计问题：
1. **数据源**：沿用现有 `postFinder.listByCategory/Tag` 算法，不另造轮子
2. **展示颗粒度**：默认 3 张卡片一行，视觉舒服又不喧宾夺主
3. **降级**：无 category 也无 tag / 匹配结果全是当前文章自身 → **静默隐藏**，不显示空 section 打扰阅读

**位置选择：只做"评论上方"不做"正文上方"**。正文上方会在读文章前就引导走人，影响本文阅读；评论上方是"读完后还有兴趣再看"的自然衔接。符合常识性阅读路径。

### 升级安全
- 默认 `enable_post_related_recommend: false`——升级后功能不自动出现，**不影响现有页面视觉**
- 想开的用户：主题设置 → 文章页 → 勾选"评论区上方显示相关推荐"+ 调整卡片数
- 跟侧边栏原 `relate` widget 完全独立，两个可以同时开（虽然略冗余，但不冲突）

### 验证
- 新 fragment `relate_cards.html` Thymeleaf 语法 ✅
- settings.yaml 两个字段 YAML safe_load ✅
- `.joe_related` / `.joe_related__card` CSS 编译 ✅
- post.html 插入点位置正确（post__pagination 下方 + 评论区之前）✅

### 同版本 README 截图更新
- 替换 wmimg.com 野鸡图床原作者 2023-08 老截图
- 用 playwright 截 blog.laoda.de 当前真实界面（首页亮/暗/文章页）
- 存 `docs/screenshots/`，README 主封面 + `<details>` 折叠扩展图

---

## [1.5.1-next.19] · 2026-04-20 · × 关闭按钮位置与风格优化

### Fixed
- **× 按钮跟"广告"label 重叠** · `joe-next-overrides.less`
  - 用户反馈：按钮稍微太明显了，而且跟广告标签重叠
  - 根因：`.joe_advert .icon` 和 `.joe_advert__close` 都是 `top:6px; right:6px`——完全同位，z-index 2>1 理论上 × 盖上但视觉打架
  - 修复：× 移到 **top-left（左上角）**，跟右上角的"广告"label 彻底分家
- **× 按钮风格过于抢眼**（next.17 矫枉过正）
  - next.17 的白圆黑字为了解决"深色广告底隐身"的 bug 改得太突出
  - 现回归低调：`rgba(0,0,0,0.35)` 背景 + `#ebebeb` 白字 + opacity 0.7，跟"广告"label 同一套视觉风格
  - 保留**双 shadow**（`0 0 0 1px rgba(255,255,255,.25)` 外白轮廓 + `0 1px 2px rgba(0,0,0,.3)` 底阴影），保证黑底 / 白底 / 蓝底等任意广告底色都能看见按钮轮廓
  - 尺寸 22×22px → **18×18px**，更小不喧宾夺主
  - hover 时 opacity 1 + 深化背景才完全显现，不打扰正常阅读
- **暗色模式反相适配**：浅底白字（`rgba(255,255,255,0.25)`）+ 白轮廓 shadow

### 验证
- DOM 层 3 个广告早已有 `.joe_advert__close` 按钮（curl `grep -c` = 3）✅
- CSS 编译后 `left:6px` ✅、`background:rgba(0,0,0,.35)` ✅、双 shadow ✅
- 模板未动，仅 CSS 改 4 个属性（top→top, right→left, size, bg/color/shadow 风格）

---

## [1.5.1-next.18] · 2026-04-20 · 回退 next.14 扩展 widget 系统（冗余设计）

### Removed
- **`enable_post_aside_array_position` 位置选择器 + `enable_post_aside_array` 数组** · `settings.yaml` -367 行
- **`post_aside_widgets` fragment + 4 处 th:if 插入点 (A/B/C/D)** · `aside_post.html` 恢复 pre-next.14 简洁结构（-80 行）
- **13-case th:switch 派发逻辑**（博主/公告/打赏/图片/音乐/最新文章/热门文章/人生倒计时/最新评论/标签云/分类云/侧边栏广告/自定义 HTML）

### 保留
- **B1 CSS override** (`.joe_aside__item:last-child { position: static }`) · `joe-next-overrides.less`——这是 pre-next.14 就存在的 sidebar 布局 bug 修复，与扩展 widget 系统独立
- `ads_aside` max: 5（next.16）、`joe_advert__close` × 按钮（next.11/13）、SW 清理（next.15）、× 按钮跨背景可见性（next.17）全部保留

### Rationale · 3.25 级复盘
next.14 把用户"文章侧边栏想多放 1-2 个广告"的简单需求，绕成了"新增 settings 字段 + 4 档 sticky 位置选择器 + 13 种 widget 类型派发"的过度设计。事实验证：
- next.16 的一行 `max: 5` 就覆盖了 90% 真实场景
- 实际使用中"文章页扩展侧边栏 widget"一直"没有条目"
- 每个配置字段都是用户心智负担——零使用的字段只是污染 Console 界面

承认做大了，端到端砍回去。YAGNI——未来如果真有用户需要 sticky 内广告布局，走 `ads_aside` + 单条 CSS override 也能实现，不必养整套 widget 系统。

### 升级数据安全
- next.14 仅发布 2 天，下游用户配置该字段的概率极低
- 即使有用户已在 `enable_post_aside_array` 填过数据，升级后 **ConfigMap 里的值不会主动删除**——只是失去 UI 编辑入口和渲染逻辑
- 要复用历史数据：回退到 v1.5.1-next.14 ~ v1.5.1-next.17 任一版本即可读回

### 验证
- `enable_post_aside_array` / `post_aside_widgets` / `postAsidePos` / `hasExtraWidgets` 在 `settings.yaml` + `templates/` 下 **grep 零命中** ✅
- settings.yaml 行数 3725 → 3358（Δ -367）✅
- YAML 语法 OK ✅
- `asideWidget` fragments 被 `aside.html`（非文章页）仍在用，不删 ✅

---

## [1.5.1-next.17] · 2026-04-20 · × 关闭按钮跨背景可见性修复

### Fixed
- **侧边栏广告 × 关闭按钮在深色背景上隐身** · `joe-next-overrides.less`
  - 用户反馈："首页的第三个广告就没有关闭按钮了，我都添加的侧边栏广告，正常应该都有关闭按钮"
  - 现象：RackNerd（纯黑底）、双 ISP（深蓝底）广告上 × 按钮完全看不见，只有 CloudCone（白底）能看见
  - 根因：`.joe_advert__close` 之前用 `rgba(0,0,0,0.4)` 背景 + `opacity: 0.55` — 黑色半透明圆圈在深色广告底上融合消失；设计时只考虑了浅色广告底的场景，**没做到跨底色端到端适配**
  - 修复：改成**实色白底 + 深字 + 阴影描边**
    - 浅色模式：`background: rgba(255,255,255,0.92)` + `color: #333` + `box-shadow: 0 1px 4px rgba(0,0,0,0.35)` + `opacity: 0.9`
    - 暗色模式：`background: rgba(40,40,40,0.9)` + `color: #fff` + `box-shadow: 0 1px 4px rgba(255,255,255,0.25)`
    - hover 放大 1.08x 给点互动反馈
  - DOM 层面 × 按钮一直存在（curl 已验证 3 条广告全都有 `.joe_advert__close`），纯 CSS 可见性问题
  - `link.html` 已带 `?v=${theme.spec.version}` cache-buster，bump 版本自动生效不用手动强刷

### Rationale
× 按钮的第一优先级是"能被看见"，不是"不打扰视觉"。之前 opacity 0.55 + 半透明深色背景的设计哲学是"低调、只在需要时才看"——但如果广告底色本来就是深色，低调过头就变成**隐身**，用户根本不知道可以关闭。实色白底配深字是"在任何底色上都能看清"的最稳方案，符合可访问性与用户控制权优先原则。

---

## [1.5.1-next.16] · 2026-04-20 · 解除老广告位 max=1 限制

### Changed
- **`ads_top` / `ads_bottom` / `ads_aside` 三个广告数组的 `max: 1` 解除为 `max: 5`**
  - 用户以前只能在「文章顶部 / 底部 / 侧边栏广告」各加 1 条，想多加广告得绕去"扩展 widget"但位置不够好
  - 模板 `aside_post.html` / `ads_post.html` **早已用 `th:each` 循环**，支持多条，只是 Halo Console UI 被 `max: 1` 限死
  - 解除后用户在「广告」tab 里直接添加多个广告位 · 所有广告都走原 `joe_advert-large` 显示路径 · 和单条时一样跟随 sticky 滚动

### Rationale
用户反馈："之前广告—启用文章侧边栏广告，这个就很好，不会内滚，我只是想着可以多添加 1-2 个这种广告"。next.14 加 `sticky-bottom` widget 位置 + 潜在的 TOC max-height CSS 调整都是**方向绕了**——用户真实诉求是"**让老的广告位支持多个**"，一行 `max: 5` 解决。

### 扩展 widget 仍然保留
next.14 加的 `position: top/sticky-top/sticky-bottom/bottom` 4 档扩展 widget 位置**仍然可用**，给需要"广告 + 公告 + 打赏 + 自定义 HTML"等混合场景的博主。想简单加多个广告直接用原广告位即可。

### 验证
- 3 处 `max: 1 → max: 5` 已改 ✅
- YAML 语法 OK ✅
- 模板已用 `th:each` 循环，0 需要改 ✅

---

## [1.5.1-next.15] · 2026-04-20 · 旧 Service Worker 迁移清理

### Added
- **遗留 Service Worker / CacheStorage 自动清理**（`layout.html` 最早位置 inline script）
  - 面向"原来用 hexo/butterfly / fluid / WordPress 等框架、迁移到 Halo + 本主题"的博主场景
  - 老访客浏览器里可能残留前主题注册的 SW，会**拦截 network 请求返回缓存的旧 HTML**——服务器端 Cache-Control 对已注册的 SW 无效（SW 在 network 之前）
  - 脚本自动 `unregister` 所有 SW + `caches.delete` 所有 CacheStorage + `location.reload()` 一次，让访客立即看到新站
  - `localStorage.joe3_legacy_sw_cleared_v1` 一次性标记，对新访客和已清过的访客 0 开销
  - **必须 inline + 必须在 `<head>` 最早位置**——因为外部脚本本身会被老 SW 拦截失效
  - 不支持 SW 的浏览器（IE / 老 Safari）直接 early-return，零影响
- **NPM 配置文档补充**：`docs/deployment/npm-setup.md` 加一个 FAQ 条目「老访客看到旧页（从 hexo / WordPress 迁移）」
  - 给可选的 `if ($sent_http_content_type ~* "^text/html")` add_header Cache-Control 配置片段
  - 明确说明：NPM Cache-Control **对已注册的 SW 无效**，主题层的 unregister 脚本才是核心解法

### Rationale
用户反馈："我另一个浏览器之前访问过我的博客（用的还是 hexo），现在需要强制刷新才能看到 Halo 新站"——这是 SW 缓存拦截的典型症状。主题层解决的好处：访客一访问页面就自动清干净 + reload，零人工。

### 验证
- curl 生产 HTML 实证 script 在 `<title>` 之前最早位置 ✅
- 脚本字符匹配通过（括号 41/41、花括号 17/17 平衡）
- 5 个关键行为齐：localStorage 标记防重复、key 固定、unregister SW、清 CacheStorage、清完 reload ✅

### 未来移除条件
如果将来本主题要做 PWA（注册自己的 SW），**必须先删除这段清理脚本**（否则会把自己的 SW 也清掉）。文件中有注释提醒。

---

## [1.5.1-next.14] · 2026-04-20 · 扩展 widget 位置 4 档 + 空白修复

### Added
- **扩展 widget 位置从 2 档扩到 4 档**（解决 sticky 外广告滚动滑走）
  - `top` · 博主信息下方（sticky 外 · 首屏可见，滚动时滑走）· 默认
  - `sticky-top` · 文章目录上方（**sticky 内** · 跟随滚动吸顶）
  - `sticky-bottom` · 文章目录下方（**sticky 内** · 跟随滚动 · 🌟 推荐广告）
  - `bottom` · 侧边栏最底部（sticky 外 · 兼容老位置）
- 模板 `aside_post.html` 在 `.joe_aside_post` 内外共 4 个插入点做条件渲染；设置项在「侧边栏」tab 最下方「扩展 widget 位置」

### Fixed
- **非文章页侧边栏「最后一个 widget 和倒数第二个之间出现空白」**
  - 根因：原主题 `global.less:1913` 规则 `.joe_aside__item:last-child { position: sticky; top: 75px }` 设计时假设 widget 很少，让最后一个吸顶；但用户加了多个广告 widget 后，最后一个 sticky 脱流导致 DOM 原位置留空，出现视觉错位
  - 修复：`joe-next-overrides.less` 新增 override `.joe_aside__item:last-child { position: static; top: auto; margin-bottom: 15px; }`
  - 效果：最后一个 widget 回到正常流，空白消除；想要"吸顶"效果的请改用新的「扩展 widget 位置 = sticky-top / sticky-bottom」显式配置

### 使用推荐
- **广告类 widget** → `sticky-bottom`（文章目录下方 · 跟随滚动 · 不喧宾夺主）
- **公告 / 打赏等非商业内容** → `top`（博主下方 · 首屏显眼）

### ⚠️ 副作用提醒
如果 sticky 容器（`.joe_aside_post`）里内容总高度 > 视口高度，浏览器会降级整个容器的 sticky 行为（TOC 和 widget 都不再吸顶）。若你 TOC 很长，建议：
- 在 widget 里只加 1-2 个
- 或者关闭「相关文章」（`主题 → 文章页 → 相关文章`）腾出视口空间

### 验证
本地 Halo 2.24 dev curl 实测：
- 4 个 `th:if postAsidePos == '...'` 条件分支都在 aside_post.html 里 ✅
- `.joe_aside__item:last-child{margin-bottom:15px;position:static;top:auto}` 已编译进 overrides.min.css ✅
- 加载顺序：overrides 在 global 之后（link.html 104 → 110），override 生效 ✅

---

## [1.5.1-next.13] · 2026-04-20 · 广告关闭 · 永久 → 会话级

### Changed
- **广告 × 关闭 · 从 localStorage 改为 sessionStorage**（修正 next.11 过激设计）：
  - 之前：关一次 × → 永久（跨所有 tab / 跨重启）丢失该广告，站主自测一次就毁
  - 现在：关一次 × → **同 tab 内刷新 / 翻到下一篇仍隐藏**，**关 tab / 关浏览器后广告自然恢复**
  - 符合 Web 通用"临时忽略"交互习惯；既能在访客同一阅读会话内减少打扰，又不会永久锁定
- **自动清理老 localStorage 数据**：升级时一次性移除 next.11/12 可能已写入的 `joe_ads_closed` 持久化数据，避免用户被老数据锁定无法恢复广告

### Upgrade note
从 next.11/12 升级来的用户：之前被"永久关闭"的广告会在本次升级后**自动恢复显示**（因为老 localStorage 数据会被清理）。这是刻意设计，而不是 bug。

### Rationale
next.11 引入 × 按钮时默认选了 localStorage（持久化），用户反馈："关一次就永远不见，站主自测都不能，不是我想要的场景"。重新讨论后选 sessionStorage——会话级记忆平衡了"别反复烦同一个访客"与"不永久丢广告"两个诉求。

---

## [1.5.1-next.12] · 2026-04-20 · 主题元数据补齐 · license + issues

### Added
- **`license`** · `theme.yaml` 补上 CC BY-NC-SA 4.0 协议声明（name + 官方 URL）
  - Halo Console 「主题详情」页「协议」字段不再是"无"
  - 符合开源协议合规展示要求（原上游遗漏）
- **`issues`** · GitHub issues 入口 URL
  - Halo Console 「主题详情」页「问题反馈」字段不再是"无"
  - 用户点击可直接跳到 fork 仓库 issues 页

### Notes
- 纯元数据补齐 · 零功能变更 · 零样式影响
- 升级风险极低 · 可直接覆盖安装

---

## [1.5.1-next.11] · 2026-04-20 · 扩展 widget 位置控制 + 广告关闭按钮

### Added
- **扩展 widget 位置可配**（解决"sticky 广告被挤出视口"问题）
  - 新 setting `enable_post_aside_array_position`（`aside` group 下，enum top/bottom）
  - **默认 `top`**：widget 紧贴博主信息下方，首屏显眼（推荐，广告/公告/打赏展示率高）
  - `bottom`：保留老位置（相关文章之后），兼容升级前行为
  - 模板 `aside_post.html` 按 position 二选一渲染，widget 渲染块抽成 `post_aside_widgets` fragment 复用
- **广告关闭按钮 × **（`joe_advert__close`，localStorage 持久化）
  - 所有主题控制的广告位（文章顶部 / 底部 / 侧边栏 + 扩展 widget 里 `enable_ads_aside`）右上角加小 × 按钮
  - 用户点击 → 记录 `data-ad-slot` 到 `localStorage.joe_ads_closed` → 持久关闭
  - 下次访问自动应用：匹配 slot 的广告容器 `display: none`
  - slot 策略：图片广告用 `ads_url`，代码广告用 `"code:" + hash(ads_code)` 前 80 字符
  - 恢复被关广告：清 localStorage.joe_ads_closed（无 UI 入口，保持简洁）
- 新脚本 `templates/assets/js/ad-close.js`：原生 DOM + IIFE，不依赖 jQuery
- 样式 `joe_advert__close`：右上角 22×22 圆形 × · 半透明 hover 加深 · 暗色模式反色

### 作用边界
- **主题内广告**（ads_top/bottom/aside + widget `enable_ads_aside`）：**全部支持 × 关闭** ✅
- **AdSense Auto Ads**：Google 以 cross-origin iframe 渲染，主题无法加 × 按钮（限制来自 Google 侧）
- **自定义 HTML widget (`enable_custom`)**：不强制加 × 按钮，用户若需要自己在 HTML 里写
- **文章顶部/底部广告**：老体系沿用（array `max: 1`），暂不做 array 化，需要多个的到侧边栏用扩展 widget

### 验证
本地 Halo 2.24 dev theme-sync + curl 实测：
- 3 个 `data-ad-slot` 在文章顶/底/侧边栏广告 DOM 上 ✅
- 3 个 `joe_advert__close` × 按钮渲染 ✅
- `ad-close.min.js` HTTP 200 OK · 在 tail.html 尾部引入 ✅
- CSS `joe_advert__close` 样式完整（light/dark mode）✅
- widget 渲染逻辑：数组为空时正确跳过（不输出 widget section）✅

### Known caveat
- **aside_custom widget 不自带 ×**（因为它可能是公告/打赏，不一定是广告）—— 需要的话用户在 HTML 里自己加 `<button class="joe_advert__close">×</button>` 就能被 ad-close.js 接管

---

## [1.5.1-next.10] · 2026-04-20 · canonical / og:url 文章级 URL 修正

### Fixed
- **canonical + og:url 指向修正**：文章页的 `<link rel="canonical">` 和 `<meta property="og:url">` 以前**永远指向站点根**（`site.url`），不是文章 URL。这会导致：
  - Google SEO 可能因 canonical 互指不一致**降低文章页排名**
  - 分享到 Facebook / LinkedIn 时卡片点击可能跳到站点首页而非文章
  - Google Search Console 报 "Duplicate content" 警告

  **修复**：统一抽出 `pageUrl` 变量，文章页 = `site.url + post.status.permalink`，其它页 = `site.url`。顺带做双斜杠 guard（site.url 带尾 `/` 时先剥掉再拼）。`canonical` / `og:url` / 模板其它位置引用都走这个变量。
- **`<meta name="description">` 也跟随文章化**：和 og:description 同步，文章页用 `post.status.excerpt`，其它页用 `site.seo.description`

### Known caveat · Halo 核心双重 canonical
`<halo:head>` 注入点 Halo 2.x 核心会**额外输出** 一个指向 `site.url` 的 canonical（固定 4 空格缩进，非主题控制）。因此文章页 HTML 里会同时有：
- 主题输出的 canonical（href = 文章 URL，先出现）
- Halo 核心注入的 canonical（href = 站点根，后出现）

按 Google [官方文档](https://developers.google.com/search/docs/crawling-indexing/consolidated-duplicate-urls)，同页多个 canonical 时以 **文档顺序第一个** 为准——主题的 canonical 在前，所以 SEO 实际行为正确。但严格洁癖的 HTML validator 可能报 warning。这是 Halo 核心行为，主题层无法消除。独立 issue 可追踪 Halo 上游。

### 验证
本地 Halo 2.24 dev · theme-sync + curl：
- 首页 canonical = `http://localhost:8090/` ✅
- 首页 og:url = `http://localhost:8090/` ✅
- 文章页 canonical = `http://localhost:8090/archives/lisa-host` ✅
- 文章页 og:url = `http://localhost:8090/archives/lisa-host` ✅

---

## [1.5.1-next.9] · 2026-04-20 · 文章页扩展侧边栏 widget

### Added
- **文章页侧边栏支持扩展 widget 数组**（closes [upstream#360](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/360) P1.3 / Q4）
  - 「**主题 → 侧边栏**」配置下新增 **文章页扩展侧边栏 widget** array repeater
  - 支持和非文章页完全相同的 10 种 widget 类型：博主信息 / 公告 / 打赏 / 图片 / 音乐播放器 / 最新文章 / 热门文章 / 人生倒计时 / 最新评论 / 标签云 / 分类云 / **侧边栏广告** / 自定义 HTML
  - **不替换现有硬编码**：博主信息卡 / TOC / 相关文章 / 原有广告位全保留，新 widget **追加在它们下方**
  - **默认 `value: []`（空）**：老用户升级后视觉完全一致；想扩展再去后台加
  - 典型用法：在现有硬编码后再插 2-3 个广告位 / 公告 / 自定义 promo / 打赏入口

### 设计说明
- 不做 "array 替代硬编码" 的大重构，保守选 "硬编码 + 追加 array" 的最小侵入方案，降低回归风险
- 未来重构空间：aside.html 和 aside_post.html 的 `th:switch` 块可抽成 `~{modules/widgets/asideWidget :: render_item(aside)}` fragment 消除代码重复

### 验证
- 本地 Halo 2.24 dev theme-sync + curl 文章页：默认空配置下 `.joe_aside__item` 仅有 `author` + `newest`（博主信息 + 相关文章），零视觉变化 ✅

---

## [1.5.1-next.8] · 2026-04-20 · Google AdSense Auto Ads 集成

### Added
- **Google AdSense Auto Ads 原生支持**（refs Q3）：
  - `ads` 配置组新增 **`enable_adsense`** 开关 + **`adsense_client_id`** 文本框（后台填 `ca-pub-XXXXXXXXXXXXXXXX`）
  - `layout.html` 条件注入 **async 主脚本** + **preconnect / preconnect-doubleclick** 加速首次连接
  - `joe-next-overrides.less` 加 `ins.adsbygoogle` 样式：圆角 + 边距 + `min-height: 90px` 防 CLS 抖动 + 暗色模式背景适配 + 文章正文内 32px 上下 margin 保护阅读
  - **Auto Ads 模式**：位置 / 密度 / lazy-load 由 Google 算法决定（在 AdSense 后台 "Auto ads" 配置里可选"仅侧边栏/文章内"等类型）；主题侧不硬编码位置，保持灵活性

### 使用方式

1. 去 AdSense 后台拿你的 publisher ID（`ca-pub-XXXXXXXXXXXXXXXX`）
2. Halo Console → 外观 → 主题 → 设置 → **广告** → 勾选「开启 Google AdSense」→ 填入 publisher ID → 保存
3. 去 [AdSense → Ads → By site](https://www.google.com/adsense/new/u/0/pub-XXXX/myads/sites) 打开 **Auto ads** 并关联博客域名
4. 前台刷新 → 等 Google 爬虫扫页面（几分钟到几小时）→ 自动开始展示广告

### 加载行为

- **零开销 · 未启用时**：`enable_adsense=false` 或 `client_id 为空` 都不输出任何 AdSense 相关 `<script>` / `<link>`（本地已验证）
- **启用后**：`<script async>` 异步加载不阻塞渲染；DNS/TLS 提前 `preconnect`；Google 端自动 lazy-load（按视口加载广告单元）

### Notes
- **不硬编码 publisher ID**：每个使用本主题的博主自己填自己的 ID
- **想严格控制位置 / 指定 slot**：Auto Ads 下位置由 Google 决定。若要手动指定 slot（文章顶 / 底 / 侧边栏具体 Ad Unit），走独立 PR 扩展（暂未实现）

---

## [1.5.1-next.7] · 2026-04-20 · Footer 署名 + 社交分享 OG 动态化

### Added
- **文章页 OG / Twitter Card 动态化**（refs Q5 Telegram 分享预览优化）：
  - `og:image` / `twitter:image` · 文章页用 `post.spec.cover`（文章封面大图），其它页继续用 `site.favicon`
  - `og:description` / `twitter:description` · 文章页用 `post.status.excerpt`（文章摘要），其它页用 `site.seo.description`
  - `og:type` · 文章页为 `article`，其它页为 `website`
  - **效果**：分享文章到 Telegram / X / Facebook / WeChat，现在显示文章封面大图 + 真实摘要，而不是站点小 favicon + 笼统介绍
- **生产验证**：本地 theme-sync 至 Halo 2.24 dev 实例，curl 首页 + 真实文章页，确认 og:image / og:description 按预期区分，`post != null` 短路 null-safe

### Changed
- **Footer Theme by 署名** · 从硬编码 "M酷&Jiewen" 改为 "Jiewen & 咕咕"（接棒者身份 + 符合 CC BY-NC-SA attribution 要求）

---

## [1.5.1-next.6] · 2026-04-20 · 🚨 Critical Hotfix

### Fixed (Critical)
- **🔥 回退 jQuery defer**，修复 v1.5.1-next.5 引入的**全站 JS 崩溃**

  **现象**：升级到 next.5 后，**留言板（便利贴）** / **图库懒加载** / **代码复制** 等所有依赖 jQuery 的主题交互全部失效，console 报 `$ is not defined`

  **根因**：next.5 给 `<head>` 里的 jQuery 加 `defer` 是错误决策。按 HTML5 规范：
  - `<body>` 内的普通 `<script src>` 在 HTML parser 到达时**立即同步执行**
  - `<head>` 内的 `<script defer>` 延迟到 **HTML parse 完成后** 执行
  - **因此**：`tail.html` 里的 `common.min.js` / `journals.min.js` / `photos.min.js` 等 body script 永远**早于** defer 的 jQuery 执行，导致全面 `ReferenceError`
  - 之前的 commit message 里写 "body JS 在 jQuery 之后加载" 是对 defer 时序的**错误理解**

  **修复**：移除 layout.html 里 jQuery 的 `defer` 属性，恢复同步加载（牺牲 FCP 换正确性）。DOMContentLoaded guard（page_links / links）保留——对同步 jQuery 也无害，且是未来做性能优化时的正确姿势

  **未来的正确方向**（parking 到独立 PR）：若要真正优化 render-blocking，需要给 **tail.html 里所有 jQuery-dep script 统一加 defer**（fancybox / qrcode / common / index / post / journals / photos / ...），让它们和 jQuery 按 defer 顺序执行。本次 hotfix 不做这个大改造

### Recommendation
**所有 v1.5.1-next.5 用户立即升级到 next.6**。next.5 生产升级会导致主题 JS 全挂。

---

## [1.5.1-next.5] · 2026-04-19 · 🔥 密集迭代

**Sprint 3 一波流**——把 a11y / SEO / 性能 / 新 feature 一次推到位，一次升级拿齐。

### Added
- **社区治理三件套**：`CONTRIBUTING.md` / `CODE_OF_CONDUCT.md`（Contributor Covenant 2.1）/ `.github/dependabot.yml`（npm 周扫 + GitHub Actions 月扫）
- **`docs/deployment/npm-setup.md`** · Nginx Proxy Manager 反代配置指南（gzip / 安全头 / HSTS / `add_header` 继承陷阱深剖）
- **文章底部版权框可配置**（closes [upstream#360](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/360)）：
  - `enable_post_copyright` · 整体开关
  - `copyright_owner_override` · 覆盖版权归属显示名（默认用贡献者昵称）
  - `copyright_owner_url` · 版权归属链接（可指向作者主页）
- **海外分享渠道**（closes [upstream#358](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/358)）：
  - `enable_share_x` · X (Twitter) 分享按钮
  - `enable_share_telegram` · Telegram 分享按钮
  - 默认关闭，面向海外读者的博主按需开启
- **SEO meta 补齐**：`<meta name="description">` / `<link rel="canonical">` / `<meta name="theme-color">` / Twitter Card 完整（summary_large_image + title/desc/image）
- **a11y 覆盖**：所有 `<img>` 补齐 `alt`（覆盖率 91% → 100%），icon 按钮补 `aria-label`（搜索 / 分享按钮），loading 容器加 `role="status"`

### Fixed
- **🎨 图库页顺序错乱**（refs [upstream#353](https://github.com/jiewenhuang/halo-theme-joe3.0/issues/353) 图片顺序部分）：
  - `IntersectionObserver` 复用单例防 leak（之前每次分页新建 observer）
  - Layout debounce 80ms 合并（之前每张图 onload 都独立 layout 引发抖动）
  - isotope 加 `sortBy='original-order'`，`data-order` 锚定后端迭代顺序，跨页 append 不再错乱
- **🚀 jQuery defer**：layout.html 里 jQuery 不再 render-blocking。FCP（首次内容绘制）在慢网环境预计有改善；body 内两处 inline `$()` 调用（page_links / links）已加 `DOMContentLoaded` guard 保证依赖顺序

### Changed
- 文档中 securityheaders.com 评级从 "A+" 修正为实际的 "A"（A+ 需配 CSP，Halo 主题架构下成本高；`docs/deployment/npm-setup.md` FAQ 新增「想拿 A+ 怎么办」的 Report-Only 渐进路径）
- `custom.js` · 19 处 `JoeReadLimited` 业务调试 `console.log` 全部注释（保留 3 处 `console.warn` 真警告）；`main.js`+`journals.js` 残留 log 清理；5 处 catch 的 `console.log(err)` 改 `console.error(err)` 语义正确

### Routed out
- **upstream#353 搜索不能打空格** · 非主题层：走 Halo 官方 `plugin-search-widget` 插件，主题 `common.js` 内相关代码已注释；建议去 [plugin-search-widget issues](https://github.com/halo-sigs/plugin-search-widget/issues) 报告
- **upstream#380 标题阴影 / upstream#351 Waline 路由 / upstream#363 控制台报错** · 🅿️ **Parking**：issue 描述过简、无复现路径，需用户提供具体截图 + 环境才能精修。不阻塞 v1.6.0 发布

### Chore
- TODO.md 同步：P2.2（min/ git 追踪）/ P2.5-P2.9（CI / COC / docs）全部标 ✅；v1.6.0 milestone 的 gate 与现状对齐
- lib audit 已出（~284 KB 高可信度 0 引用 candidate：jquery-ui / packery / jquery-pjax / jquery-toc），删除动作独立 PR `chore/unused-libs`，需生产验证后再做

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
