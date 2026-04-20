# 发版 SOP · Release Standard Operating Procedure

> 2026-04-20 · 经过 **1 天内 25+ 次发版** 血淋淋的教训沉淀出来的操作手册。
> 未来加新 feature、修新 bug 前先读这一份。

---

## 🎯 核心原则 · 三条底层逻辑

### 1. Debug 迭代永远走 prerelease · 不污染 stable

- **stable = "可以放心升级"**：维护者确信 good enough，订阅者收到邮件是"值得点开的通知"
- **prerelease = "我在试"**：tag 形如 `vX.Y.Z-rc.NN`（zero-padded 2 位），GitHub 自动识别 prerelease，不设 "Latest"
- **release.yml 已内置**：`contains(tag, '-')` 自动判断，不用改 workflow

**反面教材**：今天下午 `v1.6.0 → 1.6.1 → 1.6.2 → 1.6.3` 30 分钟连发 4 个 stable 追同一个 bug，每一版订阅者都收邮件，**全是 false positive**。

**正确做法**：`v1.6.4-rc.01 → rc.02 → rc.03 → rc.04` 全走 prerelease，rc.04 修好后**promote 到 v1.6.4 stable**（同 commit 新 tag）。

### 2. 抄上游 proved code 永远比发明新写法快

Halo 主题基于 Thymeleaf + Halo finder API，各种 API 细节 / 表达式兼容性坑点不写在文档里。**最可靠的 reference 是上游 `halo-theme-joe3.0` 源码本身**。

**反面教材**：
- `v1.5.1-next.20` 的 `th:if="${theme.config.post.enable_post_related_recommend}"` 凭感觉写，失败 → 花 4 版才改成 `#bools.isTrue(...)`
- `v1.6.4-rc.02` 的 `postFinder.listByCategory(...).items` 链式调用 → 吞掉整页。原因：**上游根本不这么写**
- `v1.6.4-rc.03` 的 cover fallback 用 `lazyload_thumbnail` 做 fallback → 占位图自己兜底 → 永远显示占位

**正确做法**：加新 feature 前先 `grep templates/modules/` 找**类似功能怎么写**：
- 要写 switch th:if? → grep `enable_` + `th:if` 看上游 switch 判断写法
- 要渲染文章卡片? → 看 `post_item.html` / `latest.html` 怎么搞 cover + meta
- 要调用 postFinder? → 看 `relate.html` / `aside_hot_post.html` 的标准调用姿势
- 要写 config 字段? → 看 settings.yaml 现有 switch / number / text 字段 schema

### 3. 诊断阶段不重构 · 重构阶段不诊断

**反面教材**：`v1.6.4-rc.02` 为了"增强诊断"同时重构了 fragment 内部结构（嵌套三元 → 线性展开），结果在重构中引入**新 bug**（链式 `.items` 调用），**吞掉整页**。一版本同时干两件事 → 无法区分哪个改动引起哪个症状。

**正确做法**：
- **诊断阶段**：改最小单位（加 debug marker / 多一层 th:if），不动业务逻辑
- **重构阶段**：独立提交，无 debug 代码，一次一个目标
- **切忌同时重构 + 加诊断** —— bug 来源混淆，回滚困难

---

## 📋 SOP · 新功能 / bug 修复的标准流程

### 步骤 0 · 上游调研（3 分钟）

```bash
# 类似功能上游怎么写?
grep -rn "类似关键词" /templates/modules/ /settings.yaml
# 上游有类似 config 字段吗? schema 长啥样?
grep -B 1 -A 20 "\$formkit: <type>" settings.yaml | head -40
```

跳过这步就是盲飞。

### 步骤 1 · 本地修改 + 语法校验

```bash
pnpm build-only                                           # LESS / JS 编译
python3 -c "import yaml; yaml.safe_load(open('settings.yaml'))"  # YAML 语法
python3 -c "import xml.etree.ElementTree as ET; ET.parse('templates/xxx.html')"  # XML 合法
```

### 步骤 2 · prerelease tag 发版（不走 stable）

```bash
# version bump
# theme.yaml: version: '1.6.5-rc.01'   ← 必须 zero-padded 2 位

git add theme.yaml templates/... CHANGELOG.md
git commit -m "fix(xxx): ..."
git tag -a v1.6.5-rc.01 -F - <<'EOF'
v1.6.5-rc.01 · xxx 修复 (prerelease)
...
EOF
git push origin main
git push origin v1.6.5-rc.01
```

release.yml 自动判 prerelease（因 tag 含 `-`）。

### 步骤 3 · 生产验证（不手动凭感觉看）

```bash
# 用户升级到 prerelease (Halo 远程下载可能过滤不显示 prerelease, 备选手动上传 zip)

# curl smoke test
/usr/bin/curl -s https://blog.laoda.de/archives/<slug> > /tmp/page.html
grep -c '关键元素 class' /tmp/page.html   # 功能是否渲染
grep -oE 'data-debug-[a-z-]+="[^"]*"' /tmp/page.html  # debug marker

# playwright 视觉验证 (CSS / computed style)
# 必要时: 用 browser_evaluate 取 getComputedStyle + getBoundingClientRect
```

### 步骤 4 · 修好了 → promote stable

```bash
# theme.yaml: version: '1.6.5'  ← 去掉 -rc.NN 后缀

git add theme.yaml CHANGELOG.md
git commit -m "release: v1.6.5 stable · ..."
git tag -a v1.6.5 -F - <<'EOF'
## 🎉 v1.6.5 · 概括亮点
...
EOF
git push origin main
git push origin v1.6.5
```

### 步骤 5 · 没修好 → 继续 rc.02, rc.03...

**不要用新 stable tag 追 bug**。每次失败迭代：
- `v1.6.5-rc.02`, `rc.03`, `rc.04` ...
- 不限迭代次数，反正 prerelease 不进 "Latest"

---

## 🚫 黑名单 · 今天踩过的坑点

| # | 坑 | 教训 |
|---|---|---|
| 1 | Thymeleaf `<!--/* ... */-->` 注释 | 是 parser-level comment 渲染时被吃掉，不会出现在 HTML 输出。想 curl 看 debug 用 `<span style="display:none" data-*="...">` |
| 2 | Thymeleaf th:attr value 里包含 `,` 逗号 | 逗号是多 attr 分隔符，value 里有逗号会语法错 |
| 3 | Thymeleaf 链式调用 `.method().field` | 不可靠。先 `th:with=${obj}` 赋值，再 `.field` 访问 |
| 4 | `.joe_advert__close { position: absolute }` + `:last-child { position: static }` | specificity 相同后来者胜，需要 `:not(.advert)` 精确排除 |
| 5 | `.cover ?? lazyload_thumbnail` 做 fallback | lazyload_thumbnail 自己就是占位图，fallback 应该到真实图（`home.post_thumbnail` / `random_img_api`）|
| 6 | tag 名不 zero-pad（next.9 vs next.20）| GitHub UI 字典序排序 `"9" > "20"`（ASCII）导致排序混乱，未来 `rc.NN` 固定 2 位 |
| 7 | 新 switch config 用 `${field}` 隐式 th:if 判断 | 对包装对象不稳定。用 Thymeleaf 官方 `#bools.isTrue(...)` |
| 8 | 一天内连发 20+ tag | 订阅者骚扰 + 决策疲劳。同主题合并发 1 版 |
| 9 | Halo 远程下载 URL 必须是 **`.zip` 结尾**的完整资产直链。三种错法：(a) `/releases/tag/vX.Y.Z` 是 HTML 页面 → "缺少 theme.yaml"；(b) `/releases/download/vX.Y.Z/` 少 zip 文件名 → "Failed to unzip theme"（GitHub 返回 404 HTML）；(c) `/releases/download/vX.Y.Z/theme-Joe3-X.Y.Z` 少 `.zip` 后缀 → 同 (b) | 正确形式只有一种：`/releases/download/vX.Y.Z/theme-Joe3-X.Y.Z.zip`。Halo Console 输入框可能视觉截断长 URL, paste 后往右拖确认结尾是 `.zip` |
| 10 | rc.02/rc.03 fragment 改动炸整页没本地预跑 curl | fragment 级改动必须本地 Halo 跑 curl 验证 `</html>` + pagination 后再 push tag |
| 11 | Thymeleaf `+` 混类型默认字符串拼接 | config 参与算术永远 `T(java.lang.Integer).valueOf(raw.toString())` 强制转 int, 不能图省事 |
| 12 | 连续 3 版同方向失败继续猜 | 立即加 `data-debug-*` marker span + `.getClass().getName()`, 把变量真实值和类型打到 curl 能抓到的地方 |
| 13 | Thymeleaf `<th:block>` 多 `th:*` 同元素 | each/if/with 同元素处理顺序不可靠, 拆嵌套 single concern. Java `List.subList(0, 1)` > Thymeleaf `outerStat.first` |

---

## 🎓 方法论 · 遇到"开关开了功能不出"怎么查

系统化 7 步诊断（按顺序，不跳）：

1. **验证版本部署**：`curl | grep 'v=<version>'` 确认 theme.yaml 的 version 确实在生产
2. **DOM 层**：`grep -c '关键 class' /tmp/page.html` 确认元素在不在 HTML 里
3. **加 debug marker**：span + `data-debug-*` 属性 + Thymeleaf inline 表达式 → curl 看 config 实际传什么
4. **对照实验**：写 3-5 种不同 th:if 策略同时跑，看哪个 YES 哪个 NO 定位是表达式问题还是 config 问题
5. **playwright computed style**：如果 DOM 在但视觉不见，查 `display`/`visibility`/`opacity`/`z-index`/`position` + `getBoundingClientRect()`
6. **CSS cascade 排查**：两条规则 specificity 相同 → cascade 顺序 → `:not()` 精确排除 / `!important` 兜底
7. **上游对比**：最后一步 —— `git log` 对比上游类似 feature 的实现，模仿它的 pattern 重写

---

## 📦 Tag 命名规范

| 用途 | 格式 | 示例 | GitHub 行为 |
|---|---|---|---|
| Stable | `vX.Y.Z` | `v1.6.4` | Latest release 置顶 |
| Release candidate | `vX.Y.Z-rc.NN` | `v1.6.5-rc.01` | Prerelease |
| Beta | `vX.Y.Z-beta.N` | `v1.7.0-beta.1` | Prerelease |
| Alpha | `vX.Y.Z-alpha.N` | `v2.0.0-alpha.1` | Prerelease |

**数字部分永远 zero-pad**（`rc.01` 不用 `rc.1`），避免 ASCII 字典序错乱。

---

## 📝 维护者的 commit / tag 消息风格

### commit 消息

```
<type>(<scope>): <短描述·一行>

<空行>

<长描述>：
- 根因是什么
- 改了什么
- 为什么这么改（trade-off）
- 已知风险

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

`<type>`: `feat` / `fix` / `docs` / `refactor` / `chore` / `release` / `debug`
`<scope>`: 主要改动的模块，如 `post-related` / `ads` / `readme-banner`

### tag 消息（Annotated tag）

Release workflow 会把 annotated tag 的 message 提取为 "**highlight**"，显示在 GitHub Release 页最顶端。所以 tag 消息要**对读者友好**：

- 第一行: `v1.X.Y · 亮点概括`
- 然后是 markdown 小节：修了什么 / 加了什么 / known limitations

```bash
git tag -a v1.6.5 -F - <<'EOF'
v1.6.5 · 侧边栏广告 × 按钮飞走 + 相关推荐数量 config 生效

Fixed:
- :last-child CSS override 漏掉 :not(.advert), 导致广告位是最后一个
  widget 时 × 按钮被绝对定位到页面左上角 (rectX=6 rectY=6)
- playwright 实测 computed style 定位: ad_position 从 relative 变 static

Added:
- fragment 的 pageSize 从硬编码 4 改为绑定 post_related_recommend_count config
EOF
```

---

## 🔚 Done

如果这份文档今天帮你少发 10 个 prerelease，它就值了。

如果你是第一次读到这份文档的未来维护者 —— 欢迎，**慢慢来**。3.25 的压力是虚的，好代码是真的。
