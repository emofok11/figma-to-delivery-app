// 图片智能解析工具
// 分析上传的设计稿图片，识别框架结构（标题、列表、图片等），生成灵活可扩展的模板

import { TextFieldConfig, ImageSlotConfig, TemplateCategory, SmartParseResult, ContainerPart } from '../types/template';
import { createTitlePart, createDescriptionPart, createListItemPart, createImageGroupPart } from './containerParts';
import { templateRegistry } from './templateRegistry';

// 图片解析结果（兼容旧版）
export interface ImageAnalysisResult {
  textFields: TextFieldConfig[];
  imageSlots: ImageSlotConfig[];
  suggestedCategory: TemplateCategory;
  suggestedName: string;
  previewLayout: {
    width: number;
    height: number;
    backgroundColor: string;
  };
  // 原始图片信息
  imageInfo: {
    width: number;
    height: number;
    dataUrl: string; // base64 预览
  };
  // 新增：智能解析结果
  smartResult?: SmartParseResult;
}

/**
 * 智能分析上传的图片文件
 * 识别框架结构（标题、列表、图片等），生成灵活可扩展的模板
 * 
 * 核心策略：
 * 1. 基于图片尺寸和宽高比推断模块结构
 * 2. 学习已有模板的框架（如list-table的标准结构）
 * 3. 每个模块只生成1个容器 + 添加按钮，支持动态扩展
 */
export async function analyzeImage(file: File, ocrResult?: string): Promise<ImageAnalysisResult> {
  // 读取图片并获取尺寸信息
  const imageInfo = await loadImageInfo(file);
  
  // 智能解析：识别模块结构
  const smartResult = parseImageStructure(imageInfo, ocrResult);
  
  // 将容器零件转换为字段和坑位
  const { textFields, imageSlots } = convertPartsToFields(smartResult.modules);
  
  return {
    textFields,
    imageSlots,
    suggestedCategory: smartResult.suggestedCategory,
    suggestedName: smartResult.suggestedName,
    previewLayout: {
      width: smartResult.previewLayout.width,
      height: smartResult.previewLayout.height,
      backgroundColor: smartResult.previewLayout.backgroundColor || '#1a1a2e'
    },
    imageInfo,
    smartResult
  };
}

/**
 * 智能解析图片结构
 * 根据图片特征和OCR结果识别模块
 */
function parseImageStructure(
  imageInfo: { width: number; height: number; dataUrl: string },
  ocrResult?: string
): SmartParseResult {
  const modules: ContainerPart[] = [];
  let suggestedName = '新建模板';
  
  // 根据宽高比推断分类和基本结构
  const ratio = imageInfo.width / imageInfo.height;
  const inferredCategory = inferCategory(imageInfo);
  
  // 尝试从已有模板学习结构
  const existingTemplate = findSimilarTemplate(inferredCategory);
  
  if (existingTemplate) {
    // 学习已有模板的结构框架
    suggestedName = `${existingTemplate.name}（副本）`;
    const learnedModules = learnFromTemplate(existingTemplate);
    modules.push(...learnedModules);
  } else {
    // 根据图片特征生成默认结构
    modules.push(...generateDefaultStructure(inferredCategory, imageInfo, ocrResult));
  }
  
  // 如果有OCR结果，尝试提取标题
  if (ocrResult) {
    const titleMatch = ocrResult.match(/^.{2,20}?$/m);
    if (titleMatch) {
      suggestedName = titleMatch[0].trim();
      // 更新标题模块的默认值
      const titleModule = modules.find(m => m.type === 'title');
      if (titleModule && titleModule.textFields[0]) {
        titleModule.textFields[0].defaultValue = suggestedName;
        titleModule.defaultValue = suggestedName;
      }
    }
  }
  
  return {
    modules,
    suggestedName,
    suggestedCategory: inferredCategory,
    confidence: 0.7,
    rawText: ocrResult || '',
    previewLayout: {
      width: Math.min(imageInfo.width, 1200),
      height: Math.min(imageInfo.height, 2000),
      backgroundColor: '#1a1a2e'
    }
  };
}

/**
 * 从已有模板学习结构
 * 学习框架而非具体内容：标题模块 → 整体印象模块 → 列表条目模块 → 参考图模块
 */
function learnFromTemplate(template: { 
  textFields: TextFieldConfig[]; 
  imageSlots: ImageSlotConfig[];
  category: TemplateCategory;
}): ContainerPart[] {
  const modules: ContainerPart[] = [];
  
  // 学习标题模块（取第一个字段作为标题）
  const titleField = template.textFields.find(f => f.id.includes('theme') || f.id.includes('name'));
  if (titleField) {
    modules.push(createTitlePart({ defaultValue: '' }));
  }
  
  // 学习描述模块（整体印象）
  const impressionFields = template.textFields.filter(f => f.id.includes('impression') || f.id.includes('overall'));
  if (impressionFields.length > 0) {
    // 只生成1个描述模块，支持动态添加
    modules.push(createDescriptionPart({ label: '整体印象' }));
  }
  
  // 学习列表条目模块（关键：只生成1个，支持动态添加）
  const listItemCount = template.textFields.filter(f => f.id.includes('specific-item-title')).length;
  if (listItemCount > 0 || template.category === 'list-table') {
    // 只生成1个列表条目容器
    modules.push(createListItemPart(1));
  }
  
  // 学习图片组模块（参考图）
  const refImages = template.imageSlots.filter(slot => slot.id.includes('reference'));
  if (refImages.length > 0) {
    // 只生成1个参考图坑位
    modules.push(createImageGroupPart({ label: '参考图', count: 1 }));
  }
  
  return modules;
}

/**
 * 根据分类生成默认结构
 * 每种分类都有标准的模块组合
 */
function generateDefaultStructure(
  category: TemplateCategory,
  imageInfo: { width: number; height: number },
  ocrResult?: string
): ContainerPart[] {
  const modules: ContainerPart[] = [];
  
  switch (category) {
    case 'list-table':
      // 列表表格标准结构：标题 + 整体印象 + 列表条目（1个） + 参考图（1个）
      modules.push(createTitlePart());
      modules.push(createDescriptionPart({ label: '整体印象' }));
      modules.push(createListItemPart(1)); // 只生成1个列表条目
      modules.push(createImageGroupPart({ label: '参考图', count: 1 }));
      break;
      
    case 'kill-icon':
    case 'skill-icon':
    case 'item-icon':
    case 'social-icon':
      // 图标类标准结构：标题 + 描述 + 主图标 + 参考图
      modules.push(createTitlePart());
      modules.push(createDescriptionPart({ label: '设计说明' }));
      modules.push({
        id: 'icon-main',
        type: 'image-group',
        label: '主图标',
        description: '主图标资源',
        isRepeatable: false,
        textFields: [],
        imageSlots: [{
          id: 'icon-main',
          label: '主图标',
          description: `主图标，建议尺寸 ${imageInfo.width}x${imageInfo.height}`,
          required: true,
          minWidth: 64,
          minHeight: 64,
          maxWidth: 512,
          maxHeight: 512,
          supportedFormats: ['png', 'psd', 'jpg']
        }]
      });
      modules.push(createImageGroupPart({ label: '参考图', count: 1 }));
      break;
      
    case 'banner':
      // 横幅标准结构：标题 + 横幅文案 + 主图
      modules.push(createTitlePart());
      modules.push(createDescriptionPart({ label: '横幅文案' }));
      modules.push(createImageGroupPart({ label: '横幅主图', count: 1 }));
      break;
      
    default:
      // 通用结构：标题 + 描述 + 图片组
      modules.push(createTitlePart());
      modules.push(createDescriptionPart());
      modules.push(createImageGroupPart({ count: 1 }));
  }
  
  return modules;
}

/**
 * 查找相似模板用于学习
 */
function findSimilarTemplate(category: TemplateCategory) {
  const allTemplates = templateRegistry.getAll();
  return allTemplates.find(t => t.category === category) || null;
}

/**
 * 将容器零件转换为字段和坑位配置
 */
function convertPartsToFields(modules: ContainerPart[]): {
  textFields: TextFieldConfig[];
  imageSlots: ImageSlotConfig[];
} {
  const textFields: TextFieldConfig[] = [];
  const imageSlots: ImageSlotConfig[] = [];
  
  modules.forEach(module => {
    textFields.push(...module.textFields);
    imageSlots.push(...module.imageSlots);
  });
  
  return { textFields, imageSlots };
}

/**
 * 加载图片并获取尺寸信息
 */
function loadImageInfo(file: File): Promise<{ width: number; height: number; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight,
          dataUrl
        });
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

/**
 * 根据图片特征推断模板分类
 * - 宽高比接近 1:1 → 图标类（kill-icon / skill-icon / item-icon）
 * - 宽 > 高 明显 → 横幅 banner
 * - 高 > 宽 明显 → 列表表格 list-table
 * - 其他 → other
 */
function inferCategory(imageInfo: { width: number; height: number }): TemplateCategory {
  const ratio = imageInfo.width / imageInfo.height;
  
  if (ratio >= 0.8 && ratio <= 1.2) {
    // 接近正方形 → 图标类
    if (imageInfo.width <= 256) return 'kill-icon';
    if (imageInfo.width <= 512) return 'skill-icon';
    return 'item-icon';
  }
  
  if (ratio > 2.0) {
    // 非常宽 → 横幅
    return 'banner';
  }
  
  if (ratio < 0.6) {
    // 非常高 → 列表表格
    return 'list-table';
  }
  
  // 默认
  return 'other';
}

export default { analyzeImage, parseImageStructure, convertPartsToFields };
