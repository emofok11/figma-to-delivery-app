// 击杀图标发包需求模版定义
// 源Figma链接: https://www.figma.com/design/aX96J7GfUEMKluX5SyXDrX/Untitled?node-id=26-41378
// 参考设计：击杀图标模版 V / 2025.10.09

import { TemplateDefinition } from '../types/template';
import { templateRegistry } from '../lib/templateRegistry';

export const killIconTemplate: TemplateDefinition = {
  id: 'template-kill-icon-001',
  name: '击杀图标模版',
  description: '击杀图标发包需求模版 - 按照枪皮元素、配色等特点设计',
  category: 'kill-icon',
  tags: ['击杀图标', '游戏UI', '图标设计'],
  status: 'published',
  figmaUrl: 'https://www.figma.com/design/aX96J7GfUEMKluX5SyXDrX/Untitled?node-id=26-41378',
  figmaNodeId: '26-41378',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-10-09T00:00:00.000Z',
  version: 'V / 2025.10.09',
  
  // 文字字段配置
  textFields: [
    // ========== 基础信息 ==========
    {
      id: 'theme-name',
      label: '主题名称',
      placeholder: '请输入主题名称',
      defaultValue: '',
      required: true,
      maxLength: 50,
      style: { fontSize: 16, fontWeight: '600', color: '#333333' }
    },
    {
      id: 'version-info',
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
      placeholder: '根据枪皮的元素、配色等特点，设计击杀图标',
      defaultValue: '根据枪皮的元素、配色等特点，设计击杀图标',
      required: true,
      maxLength: 100,
      style: { fontSize: 14, fontWeight: '400', color: '#333333' }
    },
    {
      id: 'overall-impression-2',
      label: '整体印象-要点2',
      placeholder: '扁平化、图形简洁',
      defaultValue: '扁平化、图形简洁',
      required: true,
      maxLength: 50,
      style: { fontSize: 14, fontWeight: '400', color: '#333333' }
    },
    {
      id: 'overall-impression-3',
      label: '整体印象-要点3',
      placeholder: '击杀炫彩颜色符合对应枪皮颜色',
      defaultValue: '击杀炫彩颜色符合对应枪皮颜色',
      required: true,
      maxLength: 50,
      style: { fontSize: 14, fontWeight: '400', color: '#333333' }
    },
    
    // ========== 徽章模块 ==========
    {
      id: 'badge-description',
      label: '徽章描述',
      placeholder: '根据生肖马主题元素设计',
      defaultValue: '根据生肖马主题元素设计',
      required: true,
      maxLength: 100,
      style: { fontSize: 14, fontWeight: '400', color: '#333333' }
    },
    {
      id: 'badge-keywords',
      label: '主题关键字',
      placeholder: '请输入主题关键字',
      defaultValue: '',
      required: false,
      maxLength: 50,
      style: { fontSize: 14, fontWeight: '400', color: '#333333' }
    },
    
    // ========== 边框模块 ==========
    {
      id: 'border-description',
      label: '边框描述',
      placeholder: '根据以下枪皮局部特征进行个性化设计',
      defaultValue: '根据以下枪皮局部特征进行个性化设计',
      required: true,
      maxLength: 100,
      style: { fontSize: 14, fontWeight: '400', color: '#333333' }
    },
    
    // ========== 击杀印记模块 ==========
    {
      id: 'kill-mark-description',
      label: '击杀印记描述',
      placeholder: '选取以下任意局部特征进行图形设计',
      defaultValue: '选取以下任意局部特征进行图形设计',
      required: true,
      maxLength: 100,
      style: { fontSize: 14, fontWeight: '400', color: '#333333' }
    },
    
    // ========== 炫彩模块 ==========
    {
      id: 'colorful-description',
      label: '炫彩描述',
      placeholder: '选取下面枪皮颜色进行配色',
      defaultValue: '选取下面枪皮颜色进行配色',
      required: true,
      maxLength: 100,
      style: { fontSize: 14, fontWeight: '400', color: '#333333' }
    }
  ],
  
  // 图片坑位配置 - 每个模块4个独立坑位
  imageSlots: [
    // ========== 徽章模块 - 4个图片坑位 ==========
    {
      id: 'badge-img-1',
      label: '徽章-参考图1',
      description: '徽章设计参考图1',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd']
    },
    {
      id: 'badge-img-2',
      label: '徽章-参考图2',
      description: '徽章设计参考图2',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd']
    },
    {
      id: 'badge-img-3',
      label: '徽章-参考图3',
      description: '徽章设计参考图3',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd']
    },
    {
      id: 'badge-img-4',
      label: '徽章-参考图4',
      description: '徽章设计参考图4',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd']
    },
    
    // ========== 边框模块 - 4个图片坑位 ==========
    {
      id: 'border-img-1',
      label: '边框-参考图1',
      description: '边框设计参考图1',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd']
    },
    {
      id: 'border-img-2',
      label: '边框-参考图2',
      description: '边框设计参考图2',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd']
    },
    {
      id: 'border-img-3',
      label: '边框-参考图3',
      description: '边框设计参考图3',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd']
    },
    {
      id: 'border-img-4',
      label: '边框-参考图4',
      description: '边框设计参考图4',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd']
    },
    
    // ========== 击杀印记模块 - 4个图片坑位 ==========
    {
      id: 'kill-mark-img-1',
      label: '击杀印记-参考图1',
      description: '击杀印记设计参考图1',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd']
    },
    {
      id: 'kill-mark-img-2',
      label: '击杀印记-参考图2',
      description: '击杀印记设计参考图2',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd']
    },
    {
      id: 'kill-mark-img-3',
      label: '击杀印记-参考图3',
      description: '击杀印记设计参考图3',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd']
    },
    {
      id: 'kill-mark-img-4',
      label: '击杀印记-参考图4',
      description: '击杀印记设计参考图4',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd']
    },
    
    // ========== 炫彩模块 - 4个图片坑位（默认、换色1、换色2、换色3）==========
    {
      id: 'colorful-default',
      label: '炫彩1',
      description: '默认配色方案',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd']
    },
    {
      id: 'colorful-change1',
      label: '炫彩2',
      description: '换色方案1',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd']
    },
    {
      id: 'colorful-change2',
      label: '炫彩3',
      description: '换色方案2',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd']
    },
    {
      id: 'colorful-change3',
      label: '炫彩4',
      description: '换色方案3',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd']
    },
    
    // ========== 已有击杀图标精度参考 - 4个图片坑位 ==========
    {
      id: 'reference-img-1',
      label: '精度参考-示例1',
      description: '已有击杀图标精度参考1',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd']
    },
    {
      id: 'reference-img-2',
      label: '精度参考-示例2',
      description: '已有击杀图标精度参考2',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd']
    },
    {
      id: 'reference-img-3',
      label: '精度参考-示例3',
      description: '已有击杀图标精度参考3',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd']
    },
    {
      id: 'reference-img-4',
      label: '精度参考-示例4',
      description: '已有击杀图标精度参考4',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      supportedFormats: ['png', 'jpg', 'psd']
    },
    
    // ========== 界面效果图 - 4个图片坑位 ==========
    {
      id: 'interface-img-1',
      label: '界面效果图1',
      description: '界面效果图1',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 1920,
      maxHeight: 1080,
      suggestedWidth: 1386,
      suggestedHeight: 640,
      supportedFormats: ['png', 'jpg', 'psd'],
      // 默认预填充：游戏界面截图（用户可替换或删除）
      defaultImage: '/images/interface-1.png'
    },
    {
      id: 'interface-img-2',
      label: '界面效果图2',
      description: '界面效果图2',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 1920,
      maxHeight: 1080,
      suggestedWidth: 1386,
      suggestedHeight: 640,
      supportedFormats: ['png', 'jpg', 'psd']
    },
    {
      id: 'interface-img-3',
      label: '界面效果图3',
      description: '界面效果图3',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 1920,
      maxHeight: 1080,
      suggestedWidth: 1386,
      suggestedHeight: 640,
      supportedFormats: ['png', 'jpg', 'psd']
    },
    {
      id: 'interface-img-4',
      label: '界面效果图4',
      description: '界面效果图4',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 1920,
      maxHeight: 1080,
      suggestedWidth: 1386,
      suggestedHeight: 640,
      supportedFormats: ['png', 'jpg', 'psd']
    },
    
    // ========== 图标效果图 - 6个图片坑位（一杀到六杀，默认预填充）==========
    {
      id: 'icon-img-1',
label: '（一杀）',
      description: '一杀击杀图标效果图',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 1024,
      maxHeight: 1024,
      suggestedWidth: 256,
      suggestedHeight: 256,
      supportedFormats: ['png', 'jpg', 'psd'],
      // 默认预填充：一杀图标（用户可替换或删除）
      defaultImage: '/images/icon-1.png'
    },
    {
      id: 'icon-img-2',
label: '（二杀）',
      description: '二杀击杀图标效果图',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 1024,
      maxHeight: 1024,
      suggestedWidth: 256,
      suggestedHeight: 256,
      supportedFormats: ['png', 'jpg', 'psd'],
      // 默认预填充：二杀图标（用户可替换或删除）
      defaultImage: '/images/icon-2.png'
    },
    {
      id: 'icon-img-3',
label: '（三杀）',
      description: '三杀击杀图标效果图',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 1024,
      maxHeight: 1024,
      suggestedWidth: 256,
      suggestedHeight: 256,
      supportedFormats: ['png', 'jpg', 'psd'],
      // 默认预填充：三杀图标（用户可替换或删除）
      defaultImage: '/images/icon-3.png'
    },
    {
      id: 'icon-img-4',
label: '（四杀）',
      description: '四杀击杀图标效果图',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 1024,
      maxHeight: 1024,
      suggestedWidth: 256,
      suggestedHeight: 256,
      supportedFormats: ['png', 'jpg', 'psd'],
      // 默认预填充：四杀图标（用户可替换或删除）
      defaultImage: '/images/icon-4.png'
    },
    {
      id: 'icon-img-5',
label: '（五杀）',
      description: '五杀击杀图标效果图',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 1024,
      maxHeight: 1024,
      suggestedWidth: 256,
      suggestedHeight: 256,
      supportedFormats: ['png', 'jpg', 'psd'],
      // 默认预填充：五杀图标（用户可替换或删除）
      defaultImage: '/images/icon-5.png'
    },
    {
      id: 'icon-img-6',
label: '（六杀·精准一击）',
      description: '六杀精准一击击杀图标效果图',
      required: false,
      minWidth: 100,
      minHeight: 100,
      maxWidth: 1024,
      maxHeight: 1024,
      suggestedWidth: 256,
      suggestedHeight: 256,
      supportedFormats: ['png', 'jpg', 'psd'],
      // 默认预填充：六杀精准一击图标（用户可替换或删除）
      defaultImage: '/images/icon-6.png'
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
templateRegistry.register(killIconTemplate);

export default killIconTemplate;