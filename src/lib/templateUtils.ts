// 模板公共工具函数
// 统一管理字段过滤逻辑，避免多处重复实现

import { TextFieldConfig } from '../types/template';

// ========== 字段排除规则配置 ==========
// 在此集中维护需要排除的字段ID，修改时只需改这一处

// 需要在编辑器/预览中排除显示的字段（已在通用模块中固定显示）
export const EXCLUDED_FIELD_IDS = [
  'overall-theme-name',    // 主题名称 - 已在顶部固定显示
  'overall-version-info',  // 版本信息 - 已在顶部固定显示
] as const;

// ========== 公共过滤函数 ==========

/**
 * 过滤掉不需要在编辑列表中显示的字段
 * 用于 TemplateEditor 和 DocumentPreview 组件
 * @param fields 字段列表
 * @returns 过滤后的字段列表
 */
export function filterVisibleFields(fields: TextFieldConfig[]): TextFieldConfig[] {
  return fields.filter(field => !EXCLUDED_FIELD_IDS.includes(field.id as any));
}

/**
 * 检查字段是否应该显示在编辑列表中
 * @param fieldId 字段ID
 * @returns 是否应该显示
 */
export function isFieldVisible(fieldId: string): boolean {
  return !EXCLUDED_FIELD_IDS.includes(fieldId as any);
}

/**
 * 获取排除字段ID列表（用于调试或日志）
 * @returns 排除的字段ID数组
 */
export function getExcludedFieldIds(): readonly string[] {
  return EXCLUDED_FIELD_IDS;
}
