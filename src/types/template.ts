// 模版库核心类型定义

// ========== 智能解析框架类型 ==========

// 模块类型：标识页面中的不同结构单元
export type ModuleType = 
  | 'title'          // 标题模块（主标题、副标题）
  | 'description'    // 描述模块（整体印象、设计说明）
  | 'list'           // 列表模块（逐条需求，每条含标题+描述+图片）
  | 'image-group'    // 图片组模块（多张参考图排列）
  | 'table'          // 表格模块（规格参数等）
  | 'divider';       // 分隔线模块

// 容器零件：可复用的模板构建单元
export interface ContainerPart {
  id: string;
  type: ModuleType;
  label: string;             // 模块显示名称
  description?: string;      // 模块描述
  textFields: TextFieldConfig[];   // 包含的文字字段
  imageSlots: ImageSlotConfig[];   // 包含的图片坑位
  isRepeatable: boolean;     // 是否可重复添加（如列表条目）
  maxCount?: number;         // 最大重复次数（如列表最多20条）
  defaultValue?: string;     // 从图片解析出的默认值
}

// 智能解析结果
export interface SmartParseResult {
  modules: ContainerPart[];           // 识别出的模块列表
  suggestedName: string;              // 推荐的模板名称
  suggestedCategory: TemplateCategory;// 推荐的分类
  confidence: number;                 // 解析置信度 (0-1)
  rawText: string;                    // OCR识别的原始文本
  previewLayout: PreviewLayout;       // 预览布局配置
}

// 文字字段配置
export interface TextFieldConfig {
  id: string;
  label: string;
  placeholder: string;
  defaultValue: string;
  required: boolean;
  maxLength?: number;
  style?: {
    fontSize?: number;
    fontWeight?: string;
    color?: string;
    textAlign?: 'left' | 'center' | 'right';
  };
}

// 图片坑位配置
export interface ImageSlotConfig {
  id: string;
  label: string;
  description: string;
  required: boolean;
  aspectRatio?: number; // 宽高比
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  suggestedWidth?: number; // 建议宽度
  suggestedHeight?: number; // 建议高度
  supportedFormats?: string[]; // 支持的格式
  defaultImage?: string; // 默认预填充图片 URL（用户可替换或删除）
}

// 图片数据
export interface ImageData {
  id: string;
  slotId: string;
  file: File | null;
  preview: string; // base64预览
  cropData?: CropData;
  scale?: number;
  actualWidth?: number; // 实际宽度
  actualHeight?: number; // 实际高度
}

// 裁切数据
export interface CropData {
  x: number;
  y: number;
  width: number;
  height: number;
}

// 模版分类
export type TemplateCategory = 
  | 'kill-icon'      // 击杀图标
  | 'skill-icon'     // 技能图标
  | 'item-icon'      // 道具图标
  | 'social-icon'    // 社交互动图标
  | 'list-table'     // 列表表格（描述+参考图，逐行排列）
  | 'ui-panel'       // UI面板
  | 'banner'         // 横幅
  | 'button'         // 按钮
  | 'other';         // 其他

// 模版状态
export type TemplateStatus = 
  | 'draft'          // 草稿
  | 'published'      // 已发布
  | 'archived';      // 已归档

// 模版定义
export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  status: TemplateStatus;
  figmaUrl?: string; // Figma源链接
  figmaNodeId?: string; // Figma节点ID
  createdAt: string;
  updatedAt: string;
  version: string;
  thumbnail?: string; // 缩略图
  textFields: TextFieldConfig[];
  imageSlots: ImageSlotConfig[];
  previewLayout: PreviewLayout; // 预览布局配置
  containers?: ContainerPart[]; // 容器结构（用于自定义模板按模块渲染）
}

// 预览布局配置
export interface PreviewLayout {
  width: number;
  height: number;
  backgroundColor?: string;
  backgroundImage?: string;
  padding?: number;
}

// 填充后的模版数据（用于生成发包文档）
export interface FilledTemplateData {
  templateId: string;
  templateName: string;
  textValues: Record<string, string>;
  imageValues: Record<string, ImageData>;
  generatedAt: string;
}

// 发包需求文档
export interface DeliveryDocument {
  id: string;
  templateId: string;
  templateName: string;
  category: TemplateCategory;
  textValues: Record<string, string>;
  imageValues: Record<string, ImageData>;
  createdAt: string;
  status: 'pending' | 'reviewing' | 'approved' | 'rejected';
  notes?: string;
}

// 历史记录
export interface TemplateHistoryRecord {
  id: string;
  templateId: string;
  templateName: string;
  title: string;
  textValues: Record<string, string>;
  imageValues: Record<string, ImageData>;
  updatedAt: string;
}