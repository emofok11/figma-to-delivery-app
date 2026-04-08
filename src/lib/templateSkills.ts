import { TemplateDefinition } from '../types/template';

export interface TemplateModule {
  id: string;
  title: string;
  color: string;
}

export interface TemplateSkill {
  id: string;
  name: string;
  description: string;
  modules: readonly TemplateModule[];
  fieldLabels: Record<string, string>;
  imageSectionTitles: Record<string, string>;
  // 判断一个模版是否适用此框架（根据字段和坑位匹配度）
  matchScore: (template: TemplateDefinition) => number;
}

// 击杀图标基础框架
export const killIconSkill: TemplateSkill = {
  id: 'kill-icon-v1',
  name: '击杀图标基础框架',
  description: '适用于常规击杀图标发包，包含整体印象、具体需求、徽章、边框等模块',
  modules: [
    { id: 'overall', title: '整体印象', color: '#FF6B6B' },
    { id: 'specific', title: '具体需求', color: '#4ECDC4' },
    { id: 'badge', title: '徽章', color: '#4ECDC4' },
    { id: 'border', title: '边框', color: '#95E1D3' },
    { id: 'kill-mark', title: '击杀印记', color: '#DDA0DD' },
    { id: 'colorful', title: '炫彩', color: '#98D8C8' },
    { id: 'reference', title: '刻画方式及精度参考', color: '#F7DC6F' },
    { id: 'interface', title: '输出要求', color: '#85C1E9' },
    { id: 'icon', title: '图标效果图', color: '#A78BFA' }
  ],
  fieldLabels: {
    'overall-impression-1': '整体印象',
    'specific-requirements': '具体需求',
    'material-description': '材质描述',
    'badge-description': '徽章描述',
    'badge-keywords': '主题关键字',
    'border-description': '边框描述',
    'kill-mark-description': '击杀印记描述',
    'colorful-description': '炫彩描述'
  },
  imageSectionTitles: {
    specific: '互动彩蛋',
    badge: '设计参考图',
    border: '局部特征参考',
    'kill-mark': '印记图形参考',
    colorful: '颜色方案预览',
    reference: '刻画方式及精度参考',
    interface: '界面效果图（五种颜色）',
    icon: '图标落地效果'
  },
  matchScore: (template) => {
    let score = 0;
    if (template.category === 'kill-icon') score += 50;
    
    // 检查是否包含特征字段
    const hasOverall = template.textFields.some(f => f.id.includes('overall'));
    const hasBadge = template.textFields.some(f => f.id.includes('badge'));
    const hasBorder = template.textFields.some(f => f.id.includes('border'));
    
    if (hasOverall) score += 10;
    if (hasBadge) score += 10;
    if (hasBorder) score += 10;
    
    return score;
  }
};

// 通用默认框架（当没有匹配的特定框架时使用）
export const defaultSkill: TemplateSkill = {
  id: 'default-v1',
  name: '通用发包框架',
  description: '适用于未分类的通用发包需求',
  modules: [
    { id: 'overall', title: '整体说明', color: '#FF6B6B' },
    { id: 'reference', title: '参考图', color: '#F7DC6F' },
    { id: 'interface', title: '效果图', color: '#85C1E9' },
    { id: 'other', title: '其他补充', color: '#A78BFA' }
  ],
  fieldLabels: {},
  imageSectionTitles: {
    reference: '参考图',
    interface: '效果图',
    other: '其他图片'
  },
  matchScore: () => 1 // 最低优先级
};

// 社交互动图标框架
export const socialIconSkill: TemplateSkill = {
  id: 'social-icon-v1',
  name: '社交互动图标框架',
  description: '适用于社交互动表情、图标等发包，包含整体印象、材质、具体需求等模块',
  modules: [
    { id: 'overall', title: '整体印象', color: '#FF6B6B' },
    { id: 'material', title: '材质', color: '#4ECDC4' },
    { id: 'specific', title: '具体需求', color: '#95E1D3' },
    { id: 'icon', title: '图标', color: '#DDA0DD' },
    { id: 'other', title: '其他信息', color: '#A78BFA' }
  ],
  fieldLabels: {
    'overall-impression-1': '整体印象',
    'material-description': '材质描述',
    'specific-requirements': '具体需求'
  },
  imageSectionTitles: {
    specific: '互动彩蛋',
    icon: '图标参考',
    other: '其他参考'
  },
  matchScore: (template) => {
    let score = 0;
    if (template.category === 'social-icon' || template.name.includes('社交互动')) score += 50;
    
    // 检查是否包含特征字段
    const hasOverall = template.textFields.some(f => f.id.includes('overall'));
    const hasMaterial = template.textFields.some(f => f.id.includes('material'));
    const hasSpecific = template.textFields.some(f => f.id.includes('specific'));
    
    if (hasOverall) score += 10;
    if (hasMaterial) score += 10;
    if (hasSpecific) score += 10;
    
    return score;
  }
};

// 列表表格框架（描述+参考图，逐行排列）
export const listTableSkill: TemplateSkill = {
  id: 'list-table-v1',
  name: '列表表格框架',
  description: '适用于逐条列出需求的发包，每条包含描述文字和参考图片，以表格形式从上往下排列',
  modules: [
    { id: 'overall', title: '整体印象', color: '#FF6B6B' },
    { id: 'specific', title: '具体需求', color: '#4ECDC4' },
    { id: 'reference', title: '参考资料', color: '#F7DC6F' }
  ],
  fieldLabels: {
    'overall-impression-1': '整体印象',
    'specific-requirements': '具体需求'
  },
  imageSectionTitles: {
    specific: '具体需求',
    reference: '参考资料'
  },
  matchScore: (template) => {
    let score = 0;
    // 分类直接匹配
    if (template.category === 'list-table') score += 50;
    // 名称包含列表/表格关键词
    if (template.name.includes('列表') || template.name.includes('表格')) score += 20;
    // 检查是否有 specific 前缀的图片坑位（列表表格的典型特征）
    const hasSpecificImages = template.imageSlots.some(s => s.id.startsWith('specific'));
    if (hasSpecificImages) score += 15;
    return score;
  }
};

// 注册的技能库
export const skillRegistry = [killIconSkill, socialIconSkill, listTableSkill, defaultSkill];

// 获取最匹配的技能框架
export function getBestMatchingSkill(template: TemplateDefinition): TemplateSkill {
  let bestSkill = defaultSkill;
  let maxScore = -1;

  for (const skill of skillRegistry) {
    const score = skill.matchScore(template);
    if (score > maxScore) {
      maxScore = score;
      bestSkill = skill;
    }
  }

  return bestSkill;
}

// 动态生成模块定义（基于Figma解析出的字段）
export function generateDynamicSkill(template: TemplateDefinition): TemplateSkill {
  // 如果有高匹配度的现有框架，直接使用
  const bestSkill = getBestMatchingSkill(template);
  if (bestSkill.matchScore(template) > 20) {
    return bestSkill;
  }

  // 【优先】如果模板有 containers 字段（自定义模板），直接按容器结构生成模块
  if (template.containers && template.containers.length > 0) {
    const dynamicModules: TemplateModule[] = [];
    const fieldLabels: Record<string, string> = {};
    const imageSectionTitles: Record<string, string> = {};
    
    const colors = ['#FF6B6B', '#4ECDC4', '#95E1D3', '#DDA0DD', '#98D8C8', '#F7DC6F', '#85C1E9', '#A78BFA'];
    
    template.containers.forEach((container, index) => {
      // 为每个容器生成一个模块
      dynamicModules.push({
        id: container.id,
        title: container.label,
        color: colors[index % colors.length]
      });
      
      // 记录字段标签
      container.textFields.forEach(f => {
        fieldLabels[f.id] = f.label;
      });
      
      // 记录图片区域标题
      container.imageSlots.forEach(s => {
        imageSectionTitles[s.id] = s.label;
      });
    });
    
    return {
      id: `container-${template.id}`,
      name: `容器框架 - ${template.name}`,
      description: '基于自定义容器结构生成的框架',
      modules: dynamicModules,
      fieldLabels,
      imageSectionTitles,
      matchScore: () => 100
    };
  }

  // 否则，根据Figma解析出的字段动态生成一个框架
  const dynamicModules: TemplateModule[] = [];
  const fieldLabels: Record<string, string> = {};
  const imageSectionTitles: Record<string, string> = {};

  // 提取所有前缀作为模块
  const prefixes = new Set<string>();
  
  template.textFields.forEach(f => {
    const prefix = f.id.split('-')[0];
    if (prefix && prefix !== 'text') prefixes.add(prefix);
    fieldLabels[f.id] = f.label;
  });

  template.imageSlots.forEach(s => {
    const prefix = s.id.split('-')[0];
    if (prefix && prefix !== 'image') prefixes.add(prefix);
    imageSectionTitles[prefix] = `${s.label}参考`;
  });

  // 如果没有提取到有意义的前缀，使用默认框架
  if (prefixes.size === 0) {
    return defaultSkill;
  }

  // 生成动态模块
  const colors = ['#FF6B6B', '#4ECDC4', '#95E1D3', '#DDA0DD', '#98D8C8', '#F7DC6F', '#85C1E9', '#A78BFA'];
  let colorIndex = 0;

  prefixes.forEach(prefix => {
    // 尝试找到对应的中文名称
    let title = prefix;
    const firstField = template.textFields.find(f => f.id.startsWith(prefix));
    const firstImage = template.imageSlots.find(s => s.id.startsWith(prefix));
    
    if (firstField) {
      title = firstField.label.replace(/描述|说明|要求/g, '');
    } else if (firstImage) {
      title = firstImage.label.replace(/参考|效果|图/g, '');
    }

    dynamicModules.push({
      id: prefix,
      title: title || prefix,
      color: colors[colorIndex % colors.length]
    });
    colorIndex++;
  });

  return {
    id: `dynamic-${template.id}`,
    name: `动态框架 - ${template.name}`,
    description: '基于Figma内容自动生成的动态框架',
    modules: dynamicModules,
    fieldLabels,
    imageSectionTitles,
    matchScore: () => 100
  };
}

// ===== 学习模板能力：根据分类推荐最佳框架 =====

/**
 * 根据模板分类推荐最佳框架
 * 当新建模板时，根据用户选择的分类自动推荐合适的 Skill 框架
 */
export function getRecommendedSkillForCategory(category: string): TemplateSkill | null {
  // 分类 → 框架映射表
  const categorySkillMap: Record<string, TemplateSkill> = {
    'kill-icon': killIconSkill,
    'social-icon': socialIconSkill,
    'list-table': listTableSkill,
  };

  return categorySkillMap[category] || null;
}

/**
 * 克隆一个 Skill 框架的结构，用于新模板
 * 保留模块定义、字段标签映射、图片分区标题，但生成新的 ID
 */
export function cloneSkillStructure(
  sourceSkill: TemplateSkill,
  newName: string
): TemplateSkill {
  return {
    ...sourceSkill,
    id: `cloned-${sourceSkill.id}-${Date.now()}`,
    name: `${newName} 框架`,
    description: `基于「${sourceSkill.name}」克隆的框架`,
    // 保留所有模块、字段标签和图片分区标题
    modules: [...sourceSkill.modules],
    fieldLabels: { ...sourceSkill.fieldLabels },
    imageSectionTitles: { ...sourceSkill.imageSectionTitles },
    matchScore: () => 100 // 克隆框架始终最高优先级
  };
}

/**
 * 从已有模板中学习并生成 Skill 框架
 * 分析模板的字段和图片坑位结构，自动生成对应的模块分组
 */
export function learnSkillFromTemplate(template: TemplateDefinition): TemplateSkill {
  const modules: TemplateModule[] = [];
  const fieldLabels: Record<string, string> = {};
  const imageSectionTitles: Record<string, string> = {};
  const colors = ['#FF6B6B', '#4ECDC4', '#95E1D3', '#DDA0DD', '#98D8C8', '#F7DC6F', '#85C1E9', '#A78BFA'];

  // 收集所有字段的前缀，按前缀分组
  const prefixMap = new Map<string, { textCount: number; imageCount: number; firstLabel: string }>();

  template.textFields.forEach(f => {
    const prefix = f.id.split('-')[0];
    if (!prefix || prefix === 'text') return;
    fieldLabels[f.id] = f.label;
    const existing = prefixMap.get(prefix) || { textCount: 0, imageCount: 0, firstLabel: f.label };
    existing.textCount++;
    prefixMap.set(prefix, existing);
  });

  template.imageSlots.forEach(s => {
    const prefix = s.id.split('-')[0];
    if (!prefix || prefix === 'image') return;
    const existing = prefixMap.get(prefix) || { textCount: 0, imageCount: 0, firstLabel: s.label };
    existing.imageCount++;
    imageSectionTitles[prefix] = s.label.replace(/-.*$/, '');
    prefixMap.set(prefix, existing);
  });

  // 按前缀生成模块
  let colorIndex = 0;
  prefixMap.forEach((info, prefix) => {
    // 从第一个字段标签推断模块标题
    let title = info.firstLabel.replace(/[-_]?(描述|说明|要求|参考|效果|图|img|image|\d+).*$/gi, '').trim();
    if (!title) title = prefix;

    modules.push({
      id: prefix,
      title,
      color: colors[colorIndex % colors.length]
    });
    colorIndex++;
  });

  // 如果没有提取到模块，返回默认框架
  if (modules.length === 0) {
    return defaultSkill;
  }

  return {
    id: `learned-${template.id}-${Date.now()}`,
    name: `学习框架 - ${template.name}`,
    description: `从模板「${template.name}」学习生成的框架`,
    modules,
    fieldLabels,
    imageSectionTitles,
    matchScore: () => 80
  };
}
