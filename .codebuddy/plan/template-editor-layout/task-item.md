# 实施计划

- [ ] 1. 修改 TemplateEditor.css 中 `.editor-main` 为强制左右结构
   - 将 `.editor-main` 的 `flex-direction: column` 改为 `flex-direction: row !important`
   - 添加 `padding: 0 !important` 和 `gap: 0 !important`
   - 确保 `.editor-nav` 保持 `width: 200px; min-width: 200px; flex-shrink: 0`
   - 确保右侧内容区使用 `flex: 1; overflow-y: auto` 独立滚动
   - 添加 `.template-editor` 父级选择器前缀确保样式隔离
   - _需求：1.1、1.2、1.3、1.4、1.5_

- [ ] 2. 更新 SKILL.md 中的 CSS 作用域隔离示例
   - 确认 SKILL.md 中通用编辑器的 CSS 示例已经是 `flex-direction: row !important`（当前文档已正确，验证即可）
   - 如有不一致之处进行修正
   - _需求：2.1_

- [ ] 3. 更新 references/css-guidelines.md 中的布局规范
   - 确认 css-guidelines.md 中所有编辑器布局示例统一为强制左右结构
   - 确认"常见样式问题"章节包含正确的排查指引
   - _需求：2.2、3.1、3.2_

- [ ] 4. 验证样式隔离：确保修改不影响击杀图标编辑器
   - 检查 TemplateEditor.css 中修改的选择器是否都带有 `.template-editor` 前缀
   - 检查是否有全局选择器（如 `.editor-main`）被意外修改
   - 确认 KillIconEditor.css 无需任何改动
   - _需求：1.5_