# 主题配置指南

> 本文档整合了 Theme Joe3 的详细配置说明。README 只保留最精炼的入门信息，深度内容全部在这里。
>
> 主题的所有配置都通过 **Halo Console → 外观 → 主题 → 设置** 完成，本页讲其中几个需要额外说明的项。

## 目录

- [首次使用](#首次使用)
- [评论系统 · Waline](#评论系统--waline)
- [博主信息 · 天气](#博主信息--天气)
- [菜单图标 · Iconfont](#菜单图标--iconfont)
- [自定义标签样式](#自定义标签样式)
- [自定义阅读样式](#自定义阅读样式--覆盖-next-默认)
- [本地数据](#本地数据-用真实数据做开发调试)

---

## 首次使用

1. Halo Console → 外观 → 主题 → 启用 `Theme Joe3 Next`
2. 进入 **主题设置**，从第一项到最后一项**每一项都点一下保存**（首次启用时 Halo 需要把默认值写入数据库）
3. 后续修改任意项，保存后前台刷新即可生效

如果发现某些设置不生效，先检查是不是忘了保存；再不行清浏览器缓存 / 强刷 `Ctrl+F5`。

---

## 评论系统 · Waline

Theme Joe3 支持两种评论系统：**Halo 原生评论**（配合 [plugin-comment-widget](https://github.com/halo-sigs/plugin-comment-widget)）和 **Waline**。

### Waline 基础配置

**基本设置 → Waline 基础配置** 是 JSON 格式。先在 [JSON 校验](https://www.json.cn/) 上验一下再填入。示例：

```json
{
  "search": false,
  "reaction": true,
  "login": "force",
  "locale": {
    "placeholder": "欢迎评论啦啦啦"
  },
  "emoji": [
    "//unpkg.com/@waline/emojis@1.2.0/weibo",
    "//unpkg.com/@waline/emojis@1.2.0/bmoji"
  ]
}
```

完整配置项见 [Waline 官网](https://waline.js.org/)。

### Waline 图片上传

支持两种图床：

#### 默认

Waline 自带图片上传，**限制 128 KB**。

#### 兰空图床（LskyPro）

需自建兰空图床服务：

| 字段 | 填什么 |
|---|---|
| 服务端地址 | `https://img.example.com/api/v1/upload`（结尾**不加**反斜杠） |
| Token | 下方获取 Token |

获取 Token（通过兰空图床 API）：

```bash
curl -X POST https://img.example.com/api/v1/tokens \
  -H "Content-Type: application/json" \
  -d '{
    "email": "email@qq.com",
    "password": "password***"
  }'
```

> 如果返回 SSL 证书错误（`curl: (60) schannel: SEC_E_UNTRUSTED_ROOT`），末尾加 `-k` 忽略证书验证。

返回示例：

```json
{"status":true,"message":"success","data":{"token":"2|1bJbwlqBfnggmOMEZqXT5XusaIwqiZjCDs7r1Ob5"}}
```

把 `data.token` 填入 Halo 后台即可。Token 为空时走"游客上传"，需兰空图床后台开放游客权限。

---

## 博主信息 · 天气

### 开启天气

**博主信息 → 展示天气信息** 打开。

> ⚠️ 天气组件的**文字颜色默认为白色**，如果你的博主栏背景是浅色可能看不清，可以通过 Halo 的"代码注入"自定义字体颜色。

### 获取天气 Token

由于**和风天气免费版已停服**，主题现在使用**心知天气**。

1. **注册账号**：前往 [心知天气官网](https://www.seniverse.com/) 注册并登录控制台
2. **添加产品**：
   ![添加产品](./joe3_20240915184016.webp)
3. **配置插件并获取 token**：前往 [心知天气 Widget 配置](https://www.seniverse.com/widgetv3)（注：这个页面在主控制台里不可见，直接走此链接）
   - 配置插件：![配置插件](./joe3_20240915185024.webp)
   - 点击"生成代码"获取 token：![获取token](./joe3_20240915185129.webp)
4. 把 token 填入 Halo 后台 **博主信息 → 天气插件token**

---

## 菜单图标 · Iconfont

Halo 菜单项支持自定义图标。图标来源：[阿里巴巴矢量图标库 iconfont.cn](https://www.iconfont.cn/)。

填写格式：`<Font Family> <图标代码>`，中间空格分隔。示例：

```
jiewen joe-icon-tupian
```

`jiewen` 是 Font Family（从 iconfont 项目里拷贝），`joe-icon-tupian` 是图标的 CSS class 名。

---

## 自定义标签样式

主题内置若干自定义标签（居中、引用框、警告框等）。在文章编辑器里用"HTML 文本"模式插入。

标签样式参考：[Joe3 部分样式](https://www.jiewen.run/archives/joe3style)（原作者维护的文档）

也可以直接使用 Halo 的 [plugin-custom-elements](https://github.com/halo-sigs/plugin-custom-elements)。

---

## 自定义阅读样式 · 覆盖 Next 默认

Joe3 Next 在上游基础上**内置了若干可读性优化**，定义在 `templates/assets/css/joe-next-overrides.less`：

- 文章正文加深字色（亮色 `#333` / 暗色 `#c9d1d9`）并增大字号到 16px
- 首页摘要柔化（亮色 `#666` / 暗色 `#8b949e`）
- 调色评论组件 / 搜索组件的几个 CSS 变量

这些是**主题内置默认**，装了就生效，不用手动复制粘贴代码注入。

### 想改怎么办

去 **Halo Console → 系统 → 设置 → 代码注入 → 全局 head 标签**，用 `<style>` 覆盖即可（代码注入优先级高于主题 CSS）。

**示例 · 把正文字号改到 18px，字色改成更黑的 #1a1a1a**：

```html
<style>
  .joe_detail__article p,
  .joe_detail__article li,
  .joe_detail__article td {
    color: #1a1a1a !important;
    font-size: 18px !important;
  }

  html[data-mode='dark'] .joe_detail__article p,
  html[data-mode='dark'] .joe_detail__article li,
  html[data-mode='dark'] .joe_detail__article td {
    color: #e6edf3 !important;
  }
</style>
```

### 为什么代码注入要写 `!important`

主题 CSS（`joe-next-overrides.min.css`）是**正常加载的 stylesheet**，你在代码注入里写的 `<style>` 虽然在 HTML 更靠下（理论上优先级高），但是 **Halo 把代码注入插在 `<head>` 内且特异性可能不够**，加 `!important` 最稳。

### 可调的 CSS 变量（不用写选择器就能换色）

```html
<style>
  :root {
    --halo-cw-primary-1-color: #ff6b35;   /* 评论主色 */
    --halo-search-widget-primary-color: #ff6b35;   /* 搜索主色 */
  }
</style>
```

完整变量清单见 `templates/assets/css/joe-next-overrides.less` 的 `:root` 块。

### 彻底"恢复上游原版"

如果你就是想要完全未调整的 Joe3 原版视觉，在代码注入里写：

```html
<style>
  /* 取消所有 Next readability 覆盖 */
  .joe_detail__article p,
  .joe_detail__article li,
  .joe_detail__article td {
    all: revert !important;
  }
  .joe_list .abstract {
    color: revert !important;
  }
</style>
```

或者 fork 这个主题 → 删掉 `joe-next-overrides.less` 引用再装回去。

---

## 本地数据 · 用真实数据做开发调试

本地跑 Halo 调试主题时，**强烈建议用线上博客的备份数据填充**——空实例看不出列表分页、标签云、长文排版等边界问题。

### 导入线上数据

```
线上 Halo Console → 工具 → 备份与恢复 → 创建备份 → 下载 zip
本地 http://localhost:8090/console → 工具 → 备份与恢复 → 恢复 → 上传 zip
等待 1-10 分钟（视附件大小）
```

恢复完成后按提示重启 Halo，然后再跑 `./scripts/theme-sync.sh` 把 fork 版主题覆盖回去（备份会恢复线上装的**原版 Joe3**）。

### 安全提醒

备份 zip 包含**用户表密码 hash / session token / API token / 附件原文件**。本地 dev 实例导入真实数据后：

- ❌ **不要**把 `8090` 端口开到公网 / Tailscale 共享 / 局域网转发
- ✅ 用完一次性开发用 `docker compose -f docker-compose.dev.yml down -v` 清干净
- 📅 建议线上备份选博客低流量时段操作，避免备份不一致

---

## 其它

还没覆盖的配置项，请直接看 Halo Console 主题设置界面——每个字段都有简短说明。有疑问可以 [提 issue](https://github.com/Lau0x/halo-theme-joe-next/issues/new)。
