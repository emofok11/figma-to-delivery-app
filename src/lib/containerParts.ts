// 容器零件库
// 定义可复用的模板构建单元，用于智能解析后拼接生成模板

import { ContainerPart, ModuleType } from '../types/template';

// ========== 容器零件工厂函数 ==========

/**
 * 创建标题容器
 * 用于页面顶部的主标题、副标题
 */
export function createTitlePart(overrides?: {
  id?: string;
  label?: string;
  defaultValue?: string;
}): ContainerPart {
  return {
    id: overrides?.id || 'title-main',
    type: 'title',
    label: overrides?.label || '主题名称',
    description: '页面主标题',
    isRepeatable: false,
    defaultValue: overrides?.defaultValue || '',
    textFields: [{
      id: 'theme-name',
      label: '主题名称',
      placeholder: '请输入主题名称',
      defaultValue: overrides?.defaultValue || '',
      required: true,
      maxLength: 50,
      style: { fontSize: 18, fontWeight: '700', color: '#1a1a2e' }
    }],
    imageSlots: []
  };
}

/**
 * 创建描述容器
 * 用于整体印象、设计说明等文字描述区域
 */
export function createDescriptionPart(overrides?: {
  id?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
}): ContainerPart {
  return {
    id: overrides?.id || 'description-main',
    type: 'description',
    label: overrides?.label || '整体印象',
    description: '设计整体描述或要点',
    isRepeatable: true,
    maxCount: 5,
    defaultValue: overrides?.defaultValue || '',
    textFields: [{
      id: overrides?.id?.replace('description', 'impression') || 'overall-impression-1',
      label: overrides?.label || '整体印象',
      placeholder: overrides?.placeholder || '请输入整体设计方向和要点',
      defaultValue: overrides?.defaultValue || '',
      required: false,
      maxLength: 500,
      style: { fontSize: 14, fontWeight: '400', color: '#333333' }
    }],
    imageSlots: []
  };
}

/**
 * 创建列表条目容器（核心）
 * 用于逐条需求，每个条目包含标题+描述+图片
 * 支持动态添加，默认只生成1个
 */
export function createListItemPart(index: number, overrides?: {
  defaultTitle?: string;
  defaultDesc?: string;
  idPrefix?: string; // 自定义字段 ID 前缀（用于多容器场景，避免字段 ID 冲突）
}): ContainerPart {
  // 字段 ID 前缀：自定义模板用容器 ID，旧模板用 'specific-item'
  const prefix = overrides?.idPrefix || 'specific-item';
  return {
    id: `list-item-${index}`,
    type: 'list',
    label: `需求条目${index}`,
    description: `第${index}条需求（标题+描述+参考图）`,
    isRepeatable: true,
    maxCount: 20,
    defaultValue: overrides?.defaultDesc || '',
    textFields: [
      {
        id: `${prefix}-title-${index}`,
        label: `需求条目${index}-标题`,
        placeholder: `请输入第${index}条需求的标题`,
        defaultValue: overrides?.defaultTitle || '',
        required: false,
        maxLength: 50,
        style: { fontSize: 14, fontWeight: '600', color: '#333333' }
      },
      {
        id: `${prefix}-desc-${index}`,
        label: `需求条目${index}-描述`,
        placeholder: `请输入第${index}条需求的描述`,
        defaultValue: overrides?.defaultDesc || '',
        required: false,
        maxLength: 500,
        style: { fontSize: 14, fontWeight: '400', color: '#333333' }
      }
    ],
    imageSlots: [{
      id: `${prefix}-img-${index}`,
      label: `需求条目${index}-参考图`,
      description: `第${index}条需求的参考图片`,
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd', 'gif']
    }]
  };
}

/**
 * 创建图片组容器
 * 用于多张参考图的排列展示
 * 只生成1个图片坑位 + 添加按钮
 */
export function createImageGroupPart(overrides?: {
  id?: string;
  label?: string;
  count?: number; // 初始图片数量，默认1
}): ContainerPart {
  const baseId = overrides?.id || 'reference-img';
  const label = overrides?.label || '参考图';
  const count = overrides?.count || 1;

  return {
    id: baseId,
    type: 'image-group',
    label: label,
    description: `${label}组，支持动态添加`,
    isRepeatable: true,
    maxCount: 10,
    defaultValue: '',
    textFields: [],
    imageSlots: Array.from({ length: count }, (_, i) => ({
      id: `${baseId}-${i + 1}`,
      label: `${label}${i + 1}`,
      description: `${label}${i + 1}`,
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd']
    }))
  };
}

/**
 * 创建表格容器
 * 用于规格参数、尺寸规范等表格数据
 */
export function createTablePart(overrides?: {
  id?: string;
  label?: string;
  rows?: number;
}): ContainerPart {
  const baseId = overrides?.id || 'spec-table';
  const label = overrides?.label || '规格参数';
  const rows = overrides?.rows || 1;

  return {
    id: baseId,
    type: 'table',
    label: label,
    description: `${label}表格`,
    isRepeatable: true,
    maxCount: 20,
    defaultValue: '',
    textFields: Array.from({ length: rows }, (_, i) => ({
      id: `${baseId}-row-${i + 1}`,
      label: `${label} 第${i + 1}行`,
      placeholder: `请输入第${i + 1}行内容`,
      defaultValue: '',
      required: false,
      maxLength: 200,
      style: { fontSize: 14, fontWeight: '400', color: '#333333' }
    })),
    // 表格容器支持添加参考图
    imageSlots: [{
      id: `${baseId}-img-1`,
      label: `${label}-参考图1`,
      description: `${label}的参考图片`,
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd', 'gif']
    }]
  };
}

// ========== 容器零件映射表 ==========
// 根据模块类型快速获取对应的容器零件

export const containerPartFactory: Record<ModuleType, (index?: number, overrides?: any) => ContainerPart> = {
  'title': () => createTitlePart(),
  'description': (_, overrides) => createDescriptionPart(overrides),
  'list': (index = 1, overrides) => createListItemPart(index, overrides),
  'image-group': (_, overrides) => createImageGroupPart(overrides),
  'table': (_, overrides) => createTablePart(overrides),
  'divider': () => ({
    id: 'divider',
    type: 'divider',
    label: '分隔线',
    description: '模块间的视觉分隔',
    isRepeatable: false,
    textFields: [],
    imageSlots: []
  })
};

export default containerPartFactory;
