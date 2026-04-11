// Figma模版导入工具
// 用于从Figma链接解析设计数据并生成模版定义

import { TemplateDefinition, TextFieldConfig, ImageSlotConfig, TemplateCategory } from '../types/template';
import { templateRegistry } from './templateRegistry';

// Figma节点数据接口（简化版）
interface FigmaNode {
  id: string;
  name: string;
  type: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  absoluteBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  children?: FigmaNode[];
  style?: {
    fontFamily?: string;
    fontWeight?: number;
    fontSize?: number;
    textAlignHorizontal?: string;
  };
  fills?: Array<{
    type: string;
    color?: { r: number; g: number; b: number; a: number };
  }>;
  characters?: string; // 文本内容
}

// 解析Figma URL
// 注意：Figma URL 中 node-id 格式为 "1-2"，但 API 需要 "1:2" 格式
export function parseFigmaUrl(url: string): { fileKey: string; nodeId: string } | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const fileKey = pathParts[2];
    const rawNodeId = urlObj.searchParams.get('node-id');
    
    if (!fileKey || !rawNodeId) {
      return null;
    }
    
    // 将 URL 中的连字符格式 "1-2" 转换为 Figma API 需要的冒号格式 "1:2"
    const nodeId = rawNodeId.replace(/-/g, ':');
    
    return { fileKey, nodeId };
  } catch {
    return null;
  }
}

// 从Figma节点推断模版字段
function inferTextFields(node: FigmaNode): TextFieldConfig[] {
  const fields: TextFieldConfig[] = [];
  
  function traverse(currentNode: FigmaNode, depth: number = 0) {
    // 检测文本节点
    if (currentNode.type === 'TEXT' && currentNode.characters) {
      // 过滤掉一些可能是占位符或无意义的文本
      const text = currentNode.characters.trim();
      if (text && text.length > 0 && !text.startsWith('V /') && text !== '请输入') {
        const fieldName = currentNode.name || `文本字段${fields.length + 1}`;
        
        // 尝试从文本内容或名称推断字段ID和标签
        let id = `text-${currentNode.id.replace(':', '-')}`;
        let label = fieldName;
        
        if (text.includes('整体印象')) {
          id = 'overall-impression-1';
          label = '整体印象';
        } else if (text.includes('具体需求')) {
          id = 'specific-requirements';
          label = '具体需求';
        } else if (text.includes('材质')) {
          id = 'material-description';
          label = '材质描述';
        } else if (text.includes('互动彩蛋')) {
          id = 'specific-easter-egg';
          label = '互动彩蛋';
        } else if (text.includes('列表') || text.includes('表格') || text.includes('条目')) {
          // 列表表格类型的条目描述
          id = `specific-item-desc-${fields.length + 1}`;
          label = `需求条目${fields.length + 1}-描述`;
        } else if (text.includes('描述')) {
          id = 'specific-description';
          label = '描述';
        } else if (text.includes('参考')) {
          id = 'specific-reference';
          label = '参考';
        }
        
        const field: TextFieldConfig = {
          id,
          label,
          placeholder: `请输入${label}`,
          defaultValue: text,
          required: false,
          maxLength: text.length > 50 ? 500 : 100,
          style: {
            fontSize: currentNode.style?.fontSize,
            fontWeight: currentNode.style?.fontWeight?.toString(),
            color: currentNode.fills?.[0]?.color 
              ? rgbToHex(currentNode.fills[0].color)
              : undefined,
            textAlign: currentNode.style?.textAlignHorizontal?.toLowerCase() as 'left' | 'center' | 'right'
          }
        };
        
        // 避免重复添加相同ID的字段
        if (!fields.some(f => f.id === field.id)) {
          fields.push(field);
        }
      }
    }
    
    // 递归遍历子节点
    if (currentNode.children) {
      currentNode.children.forEach(child => traverse(child, depth + 1));
    }
  }
  
  traverse(node);
  return fields;
}

// 从Figma节点推断图片坑位
function inferImageSlots(node: FigmaNode): ImageSlotConfig[] {
  const slots: ImageSlotConfig[] = [];
  
  function traverse(currentNode: FigmaNode) {
    // 检测图片或矩形节点（可能作为图片容器）
    if (currentNode.type === 'RECTANGLE' || currentNode.type === 'FRAME' || currentNode.type === 'IMAGE' || currentNode.type === 'COMPONENT' || currentNode.type === 'INSTANCE') {
      // 如果节点名称包含"图片"、"图标"、"logo"等关键词，或者它是一个图片节点，则认为是图片坑位
      const keywords = ['图片', '图标', 'icon', 'image', 'logo', 'bg', '背景', '参考', '效果', '图', '列表', '表格', '条目'];
      const isImageSlot = keywords.some(kw => 
        currentNode.name.toLowerCase().includes(kw)
      );
      
      // 排除一些明显不是图片坑位的节点（如整个页面的背景）
      const isTooLarge = (currentNode.absoluteBoundingBox?.width || 0) > 1500 && (currentNode.absoluteBoundingBox?.height || 0) > 1000;
      
      if ((isImageSlot || currentNode.type === 'IMAGE') && !isTooLarge) {
        const slotName = currentNode.name || `图片坑位${slots.length + 1}`;
        const width = currentNode.absoluteBoundingBox?.width || currentNode.width || 100;
        const height = currentNode.absoluteBoundingBox?.height || currentNode.height || 100;
        
        // 尝试从名称推断ID
        let id = `image-${currentNode.id.replace(':', '-')}`;
        if (slotName.includes('参考')) {
          id = `reference-${slots.length + 1}`;
        } else if (slotName.includes('效果')) {
          id = `interface-${slots.length + 1}`;
        } else if (slotName.includes('图标')) {
          id = `icon-${slots.length + 1}`;
        } else if (slotName.includes('聊天列表') || slotName.includes('房间状态')) {
          id = `other-${slots.length + 1}`;
        }
        
        const slot: ImageSlotConfig = {
          id,
          label: slotName,
          description: `${slotName}，建议尺寸 ${Math.round(width)}x${Math.round(height)}`,
          required: false,
          aspectRatio: width / height,
          minWidth: Math.round(width * 0.5),
          minHeight: Math.round(height * 0.5),
          maxWidth: Math.round(width * 2),
          maxHeight: Math.round(height * 2),
          suggestedWidth: Math.round(width),
          suggestedHeight: Math.round(height),
          supportedFormats: ['png', 'psd', 'jpg']
        };
        
        // 避免重复添加相同ID的坑位
        if (!slots.some(s => s.id === slot.id)) {
          slots.push(slot);
        }
      }
    }
    
    // 递归遍历子节点
    if (currentNode.children) {
      currentNode.children.forEach(child => traverse(child));
    }
  }
  
  traverse(node);
  
  // 如果没有找到图片坑位，添加默认的主图标坑位
  if (slots.length === 0) {
    slots.push({
      id: 'main-image',
      label: '主图片',
      description: '主要图片资源',
      required: true,
      supportedFormats: ['png', 'psd', 'jpg']
    });
  }
  
  return slots;
}

// RGB转十六进制
function rgbToHex(color: { r: number; g: number; b: number }): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// 从Figma数据创建模版定义
export async function createTemplateFromFigma(
  figmaUrl: string,
  figmaToken: string,
  name: string,
  category: TemplateCategory,
  options?: {
    description?: string;
    tags?: string[];
  }
): Promise<TemplateDefinition> {
  const parsed = parseFigmaUrl(figmaUrl);
  if (!parsed) {
    throw new Error('无效的Figma链接');
  }

  const { fileKey, nodeId } = parsed;

  // 调用Figma API获取节点数据
  // nodeId 已在 parseFigmaUrl 中转换为冒号格式，需要 URL 编码后传递
  const encodedNodeId = encodeURIComponent(nodeId);
  const apiUrl = `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodedNodeId}`;
  
  console.log('[Figma导入] 请求URL:', apiUrl);
  console.log('[Figma导入] Token长度:', figmaToken.length, '前4位:', figmaToken.substring(0, 4) + '...');
  
  // 带自动重试的请求函数（处理 429 速率限制）
  const MAX_RETRIES = 3; // 最大重试次数
  let response: Response | null = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      response = await fetch(apiUrl, {
        headers: {
          'X-Figma-Token': figmaToken
        }
      });
    } catch (networkError: any) {
      // 网络层错误（DNS解析失败、CORS、网络断开等）
      throw new Error(`网络请求失败，请检查网络连接: ${networkError?.message || '未知网络错误'}`);
    }

    // 如果遇到 429 速率限制，自动等待后重试
    if (response.status === 429) {
      // 从响应头获取建议等待时间，默认使用指数退避策略
      const retryAfter = response.headers.get('Retry-After');
      const waitSeconds = retryAfter ? parseInt(retryAfter, 10) : Math.pow(2, attempt) * 2; // 4s, 8s, 16s
      
      console.log(`[Figma导入] 触发速率限制(429)，第${attempt}/${MAX_RETRIES}次重试，等待${waitSeconds}秒...`);
      
      if (attempt < MAX_RETRIES) {
        // 等待指定时间后重试
        await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
        continue; // 继续下一次重试
      }
      // 最后一次重试仍然 429，跳出循环走错误处理
    } else {
      // 非 429 状态码，跳出重试循环
      break;
    }
  }

  // 确保 response 存在
  if (!response) {
    throw new Error('Figma API 请求异常：未获得响应');
  }

  if (!response.ok) {
    // 尝试读取响应体中的错误详情
    let errorDetail = '';
    try {
      const errorBody = await response.json();
      errorDetail = errorBody?.err || errorBody?.message || JSON.stringify(errorBody);
    } catch {
      errorDetail = response.statusText || '无详细信息';
    }
    
    if (response.status === 429) {
      // 重试耗尽后仍然 429，给出明确提示
      throw new Error(`Figma API 请求频率过高，已重试${MAX_RETRIES}次仍被限制。请等待1-2分钟后再试。`);
    } else if (response.status === 403) {
      throw new Error(`Figma Token 无效或没有权限访问该文件 (HTTP ${response.status}: ${errorDetail})`);
    } else if (response.status === 404) {
      throw new Error(`找不到该Figma文件或节点 (HTTP ${response.status}: ${errorDetail})`);
    }
    throw new Error(`Figma API 请求失败 (HTTP ${response.status}): ${errorDetail}`);
  }

  const data = await response.json();
  // nodeId 已经是冒号格式，直接用于查找节点数据
  const figmaData = data.nodes[nodeId]?.document;

  if (!figmaData) {
    throw new Error('无法解析Figma节点数据');
  }

  const now = new Date().toISOString();
  
  // 推断文字字段
  const textFields = inferTextFields(figmaData);
  
  // 推断图片坑位
  const imageSlots = inferImageSlots(figmaData);
  
  // 尝试从Figma数据中提取预览布局信息
  const previewLayout = {
    width: Math.min(figmaData.absoluteBoundingBox?.width || figmaData.width || 800, 1200),
    height: Math.min(figmaData.absoluteBoundingBox?.height || figmaData.height || 600, 2000),
    backgroundColor: figmaData.fills?.[0]?.color ? rgbToHex(figmaData.fills[0].color) : '#1a1a2e'
  };
  
  const template: TemplateDefinition = {
    id: `${Date.now()}`,
    name,
    description: options?.description || `从Figma导入的模版 - ${figmaData.name}`,
    category,
    tags: options?.tags || [],
    status: 'draft',
    figmaUrl,
    figmaNodeId: nodeId,
    createdAt: now,
    updatedAt: now,
    version: '1.0.0',
    textFields,
    imageSlots,
    previewLayout
  };
  
  return template;
}

// 模版创建向导
export interface TemplateCreationWizard {
  step: 'url' | 'preview' | 'configure' | 'complete';
  figmaUrl: string;
  nodeId: string;
  figmaData: FigmaNode | null;
  templateName: string;
  category: TemplateCategory;
  description: string;
  tags: string[];
  generatedTemplate: TemplateDefinition | null;
}

// 初始化创建向导
export function initCreationWizard(figmaUrl: string): TemplateCreationWizard {
  const parsed = parseFigmaUrl(figmaUrl);
  
  return {
    step: parsed ? 'preview' : 'url',
    figmaUrl,
    nodeId: parsed?.nodeId || '',
    figmaData: null,
    templateName: '',
    category: 'other',
    description: '',
    tags: [],
    generatedTemplate: null
  };
}

// 更新向导状态
export function updateWizardStep(
  wizard: TemplateCreationWizard, 
  updates: Partial<TemplateCreationWizard>
): TemplateCreationWizard {
  return { ...wizard, ...updates };
}

// 完成向导并创建模版
export async function completeWizard(wizard: TemplateCreationWizard, figmaToken: string): Promise<TemplateDefinition | null> {
  if (!wizard.figmaData) {
    return null;
  }
  
  return createTemplateFromFigma(
    wizard.figmaUrl,
    figmaToken,
    wizard.templateName,
    wizard.category,
    {
      description: wizard.description,
      tags: wizard.tags
    }
  );
}

export default {
  parseFigmaUrl,
  createTemplateFromFigma,
  initCreationWizard,
  updateWizardStep,
  completeWizard
};