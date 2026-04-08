// 列表表格发包需求模版定义
// 适用于逐条列出需求的设计稿，每条包含描述文字和参考图片
// 预览时以表格形式从上往下排列（左描述、右参考图）
// 支持动态添加条目：默认显示1条，有内容自动新增，也可手动点击"+"按钮添加

import { TemplateDefinition } from '../types/template';
import { templateRegistry } from '../lib/templateRegistry';

export const listTableTemplate: TemplateDefinition = {
  id: 'template-list-table-001',
  name: '列表表格模版',
  description: '列表表格发包需求模版 - 逐条列出需求描述和参考图片，以表格形式排列',
  category: 'list-table',
  tags: ['列表', '表格', '互动彩蛋', '逐条需求'],
  status: 'published',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-10-09T00:00:00.000Z',
  version: 'V / 2025.10.09',

  // 文字字段配置
  textFields: [
    // ========== 基础信息（归类到整体印象模块）==========
    {
      id: 'overall-theme-name',
      label: '主题名称',
      placeholder: '请输入主题名称',
      defaultValue: '',
      required: true,
      maxLength: 50,
      style: { fontSize: 16, fontWeight: '600', color: '#333333' }
    },
    {
      id: 'overall-version-info',
      label: '版本信息',
      placeholder: 'V / 2025.10.09',
      defaultValue: 'V / 2025.10.09',
      required: false,
      maxLength: 30,
      style: { fontSize: 14, fontWeight: '400', color: '#666666' }
    },

    // ========== 整体印象 ==========
    {
      id: 'overall-impression-1',
      label: '整体印象-要点1',
      placeholder: '请输入整体设计方向',
      defaultValue: '',
      required: false,
      maxLength: 200,
      style: { fontSize: 14, fontWeight: '400', color: '#333333' }
    },

    // ========== 具体需求（列表条目标题+描述） ==========
    // 默认只定义1个条目，后续条目由编辑器动态生成
    {
      id: 'specific-item-title-1',
      label: '需求条目1-标题',
      placeholder: '请输入第1条需求的标题',
      defaultValue: '',
      required: false,
      maxLength: 50,
      style: { fontSize: 14, fontWeight: '600', color: '#333333' }
    },
    {
      id: 'specific-item-desc-1',
      label: '需求条目1-描述',
      placeholder: '请输入第1条需求的描述',
      defaultValue: '',
      required: false,
      maxLength: 500,
      style: { fontSize: 14, fontWeight: '400', color: '#333333' }
    }
  ],

  // 图片坑位配置 — 默认只定义1个参考图坑位，后续由编辑器动态生成
  imageSlots: [
    // ========== 具体需求条目 - 默认1个参考图 ==========
    {
      id: 'specific-item-img-1',
      label: '需求条目1-参考图',
      description: '第1条需求的参考图片',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd', 'gif']
    },

    // ========== 其他参考图 ==========
    {
      id: 'reference-img-1',
      label: '补充参考图1',
      description: '补充参考图片1',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd']
    },
    {
      id: 'reference-img-2',
      label: '补充参考图2',
      description: '补充参考图片2',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd']
    }
  ],

  // 预览布局
  previewLayout: {
    width: 800,
    height: 1200,
    backgroundColor: '#ffffff',
    padding: 40
  }
};

// 注册模版
templateRegistry.register(listTableTemplate);

export default listTableTemplate;
