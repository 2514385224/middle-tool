---
name: frontend-design
description: >-
  MiddleTool 前端视觉规范。在新建或改版 UI（Dashboard、侧边栏、表单、列表）时使用。
  避免泛 AI 模板审美，按开发者控制台风格执行：克制、信息优先、工具感。
---

# MiddleTool Frontend Design

基于 [Anthropic frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)，针对本项目的约束扩展。

## 产品定位

- **是什么**：桌面端中间件连接管理器，导出 MCP 配置给 Cursor
- **受众**：开发者 / 运维，在本地 Electron 中高频操作
- **参考气质**：VS Code 设置、Linear 内部工具、Raycast — **不是** SaaS 营销页

## 设计令牌（MiddleTool）

| 角色 | 值 | 说明 |
|------|-----|------|
| 背景 `--bg` | `#111318` | 中性炭灰，避免蓝紫底 |
| 表面 `--bg-surface` | `#181a20` | 卡片/面板 |
| 边框 `--border` | `#2c3038` | 细线分隔 |
| 正文 `--text` | `#e8eaed` | 高对比可读 |
| 次要 `--text-muted` | `#8b919e` | 说明文字 |
| 强调 `--accent` | `#4a9eff` | 工具蓝，**不用** `#6366f1` 靛紫 |
| 圆角 | `4px` / `6px` | 小圆角，避免 12px+ 胶囊卡片 |
| 字体 UI | IBM Plex Sans | `index.html` 引入 |
| 字体数据 | IBM Plex Mono | 统计数字、代码、连接预览 |

## 禁止（AI slop）

- Emoji 作为导航主图标（🚀📋◉⬡ 等）
- 大面积紫色/靛蓝渐变、发光阴影、`box-shadow` 装饰
- 三列等大「统计卡片」+ 超大数字（32px+）作为首页主视觉
- Inter / 系统默认无个性堆叠 + 千篇一律的 `border-radius: 12px` 卡片墙
- 空洞营销文案（「统一管理」「赋能」）；改用动词和操作结果

## 组件模式

### 侧边栏

- 左栏固定宽度 ~220px，品牌区一行标题 + 一行副标题（小字、muted）
- 导航项：文字为主，激活态用 **左侧 2px accent 竖条**，不用整块紫色底
- 图标：几何/CSS 标记或省略，不用 emoji

### 概览页

- 指标区：**横向 metrics 条**（label + value 一行），等宽分隔，mono 数字
- 快捷操作：**列表行**（标题、说明、右侧按钮），非卡片网格
- 信息密度适中，留白用于分组而非装饰

### 表单与列表

- 字段分组用细线标题，不用大色块
- 主按钮仅一个强调色；次要操作为 ghost/outline
- 表格/列表 hover 用 `--bg-hover`，无动画花哨

## 流程

1. 先确认页面任务（用户要完成什么操作）
2. 用上述 token，不引入新色除非有理由
3. 改完后自检：是否像「AI 生成的深色 SaaS」？若是，减圆角、减渐变、减装饰
4. 保持 `prefers-reduced-motion`、键盘 focus 可见

## 与全局 CSS 的关系

- 令牌定义在 `src/index.css` `:root`
- 布局在 `AppLayout.css`，页面在各自 `*.css`
- 新页面复用 `.page-header`、`.btn-primary`、`.card`，不重复造变量
