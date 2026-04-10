import { supabase } from './supabase';
import { TemplateDefinition, TemplateHistoryRecord } from '../types/template';

// Supabase 数据服务
// 所需表结构：
// 1. templates (id, name, category, data, created_at, updated_at)
// 2. template_history (id, template_id, title, data, created_at)

export const supabaseService = {
  // 获取所有模版（表不存在或查询失败时返回空数组）
  async getTemplates() {
    try {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('查询 templates 表失败:', error.message);
        return [];
      }
      return data || [];
    } catch (e) {
      console.warn('获取模版数据异常:', e);
      return [];
    }
  },

  // 保存模版（静默失败，不影响主流程）
  async saveTemplate(template: TemplateDefinition) {
    try {
      const { data, error } = await supabase
        .from('templates')
        .upsert({
          id: template.id,
          name: template.name,
          category: template.category,
          data: template,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.warn('保存模版失败:', error.message);
      }
      return data;
    } catch (e) {
      console.warn('保存模版异常:', e);
      return null;
    }
  },

  // 获取历史记录（表不存在或查询失败时返回空数组）
  async getHistory() {
    try {
      const { data, error } = await supabase
        .from('template_history')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('查询 template_history 表失败:', error.message);
        return [];
      }
      return data || [];
    } catch (e) {
      console.warn('获取历史记录异常:', e);
      return [];
    }
  },

  // 保存历史记录（静默失败，不影响主流程）
  async saveHistory(record: TemplateHistoryRecord) {
    try {
      const { data, error } = await supabase
        .from('template_history')
        .upsert({
          id: record.id,
          template_id: record.templateId,
          title: record.title,
          data: record,
          created_at: record.updatedAt
        });

      if (error) {
        console.warn('保存历史记录失败:', error.message);
      }
      return data;
    } catch (e) {
      console.warn('保存历史记录异常:', e);
      return null;
    }
  }
};
