# 需求文档：通用编辑器强制左右布局

## 引言

当前项目中，击杀图标编辑器（KillIconEditor）采用强制左右结构布局（`flex-direction: row`），而通用编辑器（TemplateEditor）的 `.editor-main` 仍使用垂直布局（`flex-direction: column`）。这导致两个编辑器的布局风格不一致。本需求要求将通用编辑器改为与击杀图标编辑器一致的强制左右结构，并同步更新 Skill 文档中的 CSS 示例。

### 当前状态对比

| 属性 | 击杀图标编辑器 (KillIconEditor.css) | 通用编辑器 (TemplateEditor.css) |
|------|------|------|
| `.editor-main` flex-direction | `row`（水平，左右结构） | `column`（垂直，上下结构） |
| `.editor-main` padding | `0` | `24px 32px` |
| `.editor-main` gap | `0` | `24px` |
| 导航栏 | `.sidebar-nav`，160px 固定宽度 | `.editor-nav`，200px 固定宽度 |
| 内容区 | `.editor-content`，独立滚动 | 内嵌在 `.editor-main` 中 |

---

## 需求

### 需求 1：通用编辑器 `.editor-main` 改为强制左右结构

**用户故事：** 作为一名游戏视觉设计师，我希望通用编辑器与击杀图标编辑器保持一致的左右结构布局，以便在不同模版之间切换时获得统一的操作体验。

#### 验收标准

1. WHEN 用户打开通用编辑器 THEN `.template-editor .editor-main` SHALL 使用 `flex-direction: row !important` 实现强制水平排列
2. WHEN 通用编辑器渲染时 THEN `.template-editor .editor-main` SHALL 设置 `padding: 0 !important` 和 `gap: 0 !important`，与击杀图标编辑器一致
3. WHEN 通用编辑器渲染时 THEN 左侧导航栏（`.editor-nav`）SHALL 保持固定宽度（200px），右侧内容区 SHALL 使用 `flex: 1` 填充剩余空间
4. WHEN 左侧导航栏和右侧内容区内容超出可视区域 THEN 各自 SHALL 独立滚动（`overflow-y: auto`），互不影响
5. IF 通用编辑器的 CSS 修改影响了击杀图标编辑器的布局 THEN 系统 SHALL 通过父级选择器（`.template-editor`）隔离样式，确保不产生副作用

### 需求 2：SKILL.md 文档中 CSS 示例保持同步

**用户故事：** 作为一名开发者，我希望 Skill 文档中的 CSS 示例与实际代码保持一致，以便后续新增模版时能参考正确的样式规范。

#### 验收标准

1. WHEN 开发者查阅 SKILL.md 中的 CSS 作用域隔离示例 THEN 通用编辑器的示例 SHALL 显示为 `flex-direction: row !important`（而非 `column`）
2. WHEN 开发者查阅 references/css-guidelines.md THEN 文档中的布局规范 SHALL 与实际代码一致

### 需求 3：CSS 参考文档同步更新

**用户故事：** 作为一名开发者，我希望 CSS 参考文档中的规范与实际代码保持一致，以便后续维护时有准确的参考。

#### 验收标准

1. WHEN 开发者查阅 `references/css-guidelines.md` THEN 所有编辑器的布局示例 SHALL 统一为强制左右结构
2. WHEN 开发者查阅文档中的"常见样式问题"章节 THEN SHALL 包含"编辑器变成上下结构"的问题排查指引