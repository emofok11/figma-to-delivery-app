# 需求文档 — 将发包神器协作流程整理为可复用 Skill

## 引言

用户希望将发包神器项目从零到一的完整协作流程（从安装 Figma MCP → 读取设计稿 → 生成填表式发包应用 → 迭代优化）整理为一个可复用的 Skill，以便后续新增模版或创建类似项目时能快速复用这套流程。

---

## 需求

### 需求 1：创建 figma-to-delivery-app Skill

**用户故事：** 作为一名游戏视觉设计师，我希望将发包神器的完整工作流整理为可复用的 Skill，以便后续新增模版或创建类似项目时能快速复用这套流程。

#### 验收标准

1. WHEN Skill 被触发 THEN 系统 SHALL 按照以下完整工作流执行：
   - 第一步：通过 Figma MCP 读取设计稿结构
   - 第二步：定义模版数据结构（TextFieldConfig + ImageSlotConfig）
   - 第三步：生成左右结构的填表式编辑器
   - 第四步：实现图片上传组件（裁切/缩放）
   - 第五步：实现文档预览（深色背景、绿色标题、灰色图片标签）
   - 第六步：注册到模版库

2. WHEN 用户提到"发包神器"、"发包模版"、"Figma 模版生成"、"填表式发包"等关键词 THEN Skill SHALL 被自动触发

3. WHEN Skill 文件创建完成 THEN 系统 SHALL 将其保存到 `.codebuddy/skills/figma-to-delivery-app/SKILL.md`

4. IF Skill 需要安装到全局 THEN 用户 SHALL 手动将文件复制到 `~/.codebuddy/skills/` 目录

---

## 已完成

Skill 文件已创建并保存至：`f:\game-test\.codebuddy\skills\figma-to-delivery-app\SKILL.md`

### Skill 内容概要

| 章节 | 内容 |
|------|------|
| 核心工作流 | Figma 链接 → MCP 读取 → 解析模版 → 生成编辑器 → 注册模版库 → 预览导出 |
| 第一步 | 通过 FigmaPartner MCP 读取设计稿（get_design_context / get_screenshot / get_raw_design_context） |
| 第二步 | 定义 TemplateDefinition 数据结构（文字字段 + 图片坑位） |
| 第三步 | 生成左右结构编辑器（导航栏 + 表单区），含 CSS 作用域隔离规范 |
| 第四步 | 图片上传组件（裁切/缩放/预览/默认预填充） |
| 第五步 | 文档预览样式规范（深色背景、绿色标题、灰色图片标签） |
| 第六步 | 模版注册与复用 |
| 新增模版流程 | 7 步标准流程 |
| 常见问题 | Figma 权限、CSS 冲突、导航栏布局 |

---

## 技术架构

| 技术栈 | 说明 |
|--------|------|
| React 18 | 前端框架 |
| TypeScript 5 | 类型安全 |
| Vite 5 | 构建工具 |
| react-image-crop | 图片裁切 |
| html-to-image | 文档导出 |
| uuid | 唯一标识生成 |
| Figma MCP (FigmaPartner) | 设计稿读取 |

## 项目文件结构

```
f:\game-test\
├── src/
│   ├── App.tsx                          # 应用入口
│   ├── main.tsx                         # 渲染入口
│   ├── index.css                        # 全局样式
│   ├── components/
│   │   ├── TemplateLibrary.tsx/.css      # 模版库管理
│   │   ├── TemplateEditor.tsx/.css       # 通用模版编辑器
│   │   ├── KillIconEditor.tsx/.css       # 击杀图标专用编辑器
│   │   ├── DocumentPreview.tsx/.css      # 文档预览
│   │   ├── ImageUploader.tsx/.css        # 图片上传（裁切/缩放）
│   │   ├── TextFieldEditor.tsx/.css      # 文本字段编辑器
│   │   └── CreateTemplateModal.tsx/.css  # 创建模版弹窗
│   ├── templates/
│   │   └── killIconTemplate.ts           # 击杀图标模版数据
│   ├── types/
│   │   └── template.ts                   # 模版类型定义
│   └── lib/
│       ├── figmaImporter.ts              # Figma 导入器
│       ├── templateRegistry.ts           # 模版注册中心
│       └── templateSkills.ts             # 模版技能库
├── public/
│   ├── images/                           # 示例图片资源
│   └── compliance-examples.png
├── package.json
├── vite.config.ts
└── tsconfig.json
```
