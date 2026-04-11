// 模版注册表 - 管理所有可用模版

import { TemplateDefinition, TemplateCategory } from '../types/template';

class TemplateRegistry {
  private templates: Map<string, TemplateDefinition> = new Map();
  private categoryIndex: Map<TemplateCategory, Set<string>> = new Map();

  constructor() {
    // 初始化分类索引
    const categories: TemplateCategory[] = [
      'kill-icon', 'skill-icon', 'item-icon', 'social-icon', 'list-table', 'ui-panel', 'banner', 'button', 'other'
    ];
    categories.forEach(cat => this.categoryIndex.set(cat, new Set()));
    
    // 从本地存储加载自定义模版
    this.loadCustomTemplates();
  }

  // 从本地存储加载自定义模版
  private loadCustomTemplates() {
    try {
      const savedTemplates = localStorage.getItem('custom-templates');
      if (savedTemplates) {
        const templates: TemplateDefinition[] = JSON.parse(savedTemplates);
        templates.forEach(t => this.register(t, false)); // 不触发保存，避免循环
      }
    } catch (e) {
      console.error('Failed to load custom templates', e);
    }
  }

  // 保存自定义模版到本地存储
  private saveCustomTemplates() {
    try {
      // 只保存自定义模版（假设内置模版有特定的ID前缀，或者我们保存所有模版）
      // 这里为了简单，我们保存所有模版，实际应用中可能需要区分内置和自定义
      const allTemplates = Array.from(this.templates.values());
      localStorage.setItem('custom-templates', JSON.stringify(allTemplates));
    } catch (e) {
      console.error('Failed to save custom templates', e);
    }
  }

  // 注册模版
  register(template: TemplateDefinition, save: boolean = true): void {
    this.templates.set(template.id, template);
    const categorySet = this.categoryIndex.get(template.category);
    if (categorySet) {
      categorySet.add(template.id);
    }
    if (save) {
      this.saveCustomTemplates();
    }
  }

  // 注销模版
  unregister(templateId: string): void {
    const template = this.templates.get(templateId);
    if (template) {
      this.templates.delete(templateId);
      const categorySet = this.categoryIndex.get(template.category);
      if (categorySet) {
        categorySet.delete(templateId);
      }
      this.saveCustomTemplates();
    }
  }

  // 获取模版
  get(templateId: string): TemplateDefinition | undefined {
    return this.templates.get(templateId);
  }

  // 获取所有模版
  getAll(): TemplateDefinition[] {
    return Array.from(this.templates.values());
  }

  // 按分类获取模版
  getByCategory(category: TemplateCategory): TemplateDefinition[] {
    const ids = this.categoryIndex.get(category);
    if (!ids) return [];
    return Array.from(ids)
      .map(id => this.templates.get(id))
      .filter((t): t is TemplateDefinition => t !== undefined);
  }

  // 搜索模版
  search(query: string): TemplateDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(t => 
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  // 从Figma创建新模版
  createFromFigma(
    figmaUrl: string,
    figmaNodeId: string,
    name: string,
    category: TemplateCategory,
    config: Partial<TemplateDefinition>
  ): TemplateDefinition {
    const now = new Date().toISOString();
    const template: TemplateDefinition = {
      id: `${Date.now()}`,
      name,
      description: config.description || '新模版',
      category,
      tags: config.tags || [],
      status: 'draft',
      figmaUrl,
      figmaNodeId,
      createdAt: now,
      updatedAt: now,
      version: '1.0.0',
      textFields: config.textFields || [],
      imageSlots: config.imageSlots || [],
      previewLayout: config.previewLayout || { width: 800, height: 600 }
    };
    
    this.register(template);
    return template;
  }
}

// 单例实例
export const templateRegistry = new TemplateRegistry();

// 分类显示名称映射
export const categoryLabels: Record<TemplateCategory, string> = {
  'kill-icon': '击杀图标',
  'skill-icon': '技能图标',
  'item-icon': '道具图标',
  'social-icon': '社交互动图标',
  'list-table': '列表表格',
  'ui-panel': 'UI面板',
  'banner': '横幅',
  'button': '按钮',
  'other': '其他'
};