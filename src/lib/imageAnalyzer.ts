/**
 * 图片分析器
 * 从上传的设计稿图片智能推断模版结构
 */

import { TemplateCategory, TextFieldConfig, ImageSlotConfig } from '../types/template';

interface ImageAnalysisResult {
  suggestedCategory: TemplateCategory;
  textFields: TextFieldConfig[];
  imageSlots: ImageSlotConfig[];
  previewLayout: {
    width: number;
    height: number;
    backgroundColor?: string;
  };
}

/**
 * 分析上传的图片，推断模版结构
 */
export async function analyzeImage(file: File): Promise<ImageAnalysisResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      const ratio = width / height;

      // 根据宽高比推断分类
      let suggestedCategory: TemplateCategory;
      if (height > width * 1.5) {
        // 高远大于宽 -> 列表表格
        suggestedCategory = 'list-table';
      } else if (ratio > 2) {
        // 非常宽 -> 宣传图
        suggestedCategory = 'banner';
      } else if (ratio > 0.9 && ratio < 1.1) {
        // 接近正方形 -> 图标类
        suggestedCategory = 'kill-icon';
      } else if (width > height) {
        // 宽大于高 -> UI面板
        suggestedCategory = 'ui-panel';
      } else {
        suggestedCategory = 'other';
      }

      // 根据分类生成默认字段和图片槽位
      const result = generateDefaultStructure(suggestedCategory, width, height);
      resolve(result);
    };

    img.onerror = () => {
      reject(new Error('图片加载失败'));
    };

    reader.onerror = () => {
      reject(new Error('文件读取失败'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * 根据分类生成默认模版结构
 */
function generateDefaultStructure(
  category: TemplateCategory,
  width: number,
  height: number
): ImageAnalysisResult {
  const commonTextFields: TextFieldConfig[] = [
    {
      id: 'name',
      label: '名称',
      placeholder: '请输入名称',
      defaultValue: '',
      required: true
    },
    {
      id: 'description',
      label: '描述',
      placeholder: '请输入描述',
      defaultValue: '',
      required: false,
      maxLength: 500
    }
  ];

  const commonImageSlots: ImageSlotConfig[] = [
    {
      id: 'main-image',
      label: '主图片',
      description: '主要图片资源',
      required: true,
      supportedFormats: ['png', 'jpg', 'psd']
    }
  ];

  // 根据不同分类定制结构
  switch (category) {
    case 'list-table':
      return {
        suggestedCategory: category,
        textFields: [
          ...commonTextFields,
          {
            id: 'item-1-title',
            label: '条目1标题',
            placeholder: '请输入条目标题',
            defaultValue: '',
            required: false
          },
          {
            id: 'item-1-desc',
            label: '条目1描述',
            placeholder: '请输入条目描述',
            defaultValue: '',
            required: false
          }
        ],
        imageSlots: [
          {
            id: 'item-1-img',
            label: '条目1参考图',
            description: '条目1的参考图片',
            required: false,
            supportedFormats: ['png', 'jpg', 'psd']
          }
        ],
        previewLayout: { width: 900, height: 800, backgroundColor: '#1a1a2e' }
      };

    case 'kill-icon':
    case 'skill-icon':
    case 'item-icon':
      return {
        suggestedCategory: category,
        textFields: [
          {
            id: 'icon-name',
            label: '图标名称',
            placeholder: '请输入图标名称',
            defaultValue: '',
            required: true
          },
          {
            id: 'icon-style',
            label: '设计风格',
            placeholder: '请描述设计风格',
            defaultValue: '',
            required: false
          },
          {
            id: 'icon-desc',
            label: '设计说明',
            placeholder: '请输入设计说明',
            defaultValue: '',
            required: false
          }
        ],
        imageSlots: [
          {
            id: 'icon-main',
            label: '图标主图',
            description: '图标主体图片',
            required: true,
            supportedFormats: ['png', 'jpg', 'psd']
          },
          {
            id: 'icon-reference',
            label: '参考图',
            description: '参考图片',
            required: false,
            supportedFormats: ['png', 'jpg', 'psd']
          }
        ],
        previewLayout: { width: 800, height: 600, backgroundColor: '#1a1a2e' }
      };

    case 'banner':
      return {
        suggestedCategory: category,
        textFields: [
          {
            id: 'banner-title',
            label: '标题',
            placeholder: '请输入Banner标题',
            defaultValue: '',
            required: true
          },
          {
            id: 'banner-subtitle',
            label: '副标题',
            placeholder: '请输入副标题',
            defaultValue: '',
            required: false
          },
          {
            id: 'banner-desc',
            label: '设计说明',
            placeholder: '请输入设计说明',
            defaultValue: '',
            required: false
          }
        ],
        imageSlots: [
          {
            id: 'banner-main',
            label: 'Banner主图',
            description: 'Banner主体图片',
            required: true,
            supportedFormats: ['png', 'jpg', 'psd']
          }
        ],
        previewLayout: { width: 1200, height: 400, backgroundColor: '#1a1a2e' }
      };

    case 'ui-panel':
      return {
        suggestedCategory: category,
        textFields: [
          {
            id: 'panel-name',
            label: '面板名称',
            placeholder: '请输入面板名称',
            defaultValue: '',
            required: true
          },
          {
            id: 'panel-function',
            label: '功能说明',
            placeholder: '请描述面板功能',
            defaultValue: '',
            required: false
          }
        ],
        imageSlots: [
          {
            id: 'panel-main',
            label: '面板主图',
            description: '面板主体图片',
            required: true,
            supportedFormats: ['png', 'jpg', 'psd']
          },
          {
            id: 'panel-interaction',
            label: '交互说明图',
            description: '交互说明参考图',
            required: false,
            supportedFormats: ['png', 'jpg', 'psd']
          }
        ],
        previewLayout: { width: 1000, height: 600, backgroundColor: '#1a1a2e' }
      };

    default:
      return {
        suggestedCategory: category,
        textFields: commonTextFields,
        imageSlots: commonImageSlots,
        previewLayout: { width, height, backgroundColor: '#1a1a2e' }
      };
  }
}
