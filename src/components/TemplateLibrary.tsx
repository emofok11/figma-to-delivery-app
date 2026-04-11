import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import * as htmlToImage from 'html-to-image';
import { TemplateDefinition, TemplateCategory, ImageData, TemplateHistoryRecord, ContainerPart, TextFieldConfig, ImageSlotConfig } from '../types/template';
import { templateRegistry, categoryLabels } from '../lib/templateRegistry';
import { createTemplateFromFigma } from '../lib/figmaImporter';
import { getTodayVersion } from '../lib/templateUtils';
import { analyzeImage } from '../lib/imageAnalyzer';
import { supabaseService } from '../lib/supabaseService';
import TemplateEditor from './TemplateEditor';
import KillIconEditor from './KillIconEditor';
import CreateTemplateModal from './CreateTemplateModal';
import { DocumentPreview } from './DocumentPreview';
import './TemplateLibrary.css';

// 固定模版ID列表（内置模版不可删除）
const BUILT_IN_TEMPLATE_IDS = ['template-kill-icon-001', 'template-list-table-001'];

interface TemplateLibraryProps {
  onSelectTemplate?: (template: TemplateDefinition) => void;
  onBackToDashboard?: () => void;
}

export const TemplateLibrary: React.FC<TemplateLibraryProps> = ({
  onSelectTemplate,
  onBackToDashboard
}) => {
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | 'all' | 'history' | 'built-in' | 'custom'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDefinition | null>(null);
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<TemplateHistoryRecord | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<TemplateHistoryRecord[]>([]);
  const [exportData, setExportData] = useState<{
    textValues: Record<string, string>;
    imageValues: Record<string, ImageData>;
  } | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // 刷新触发器，用于模板列表刷新
  const previewRef = useRef<HTMLDivElement>(null);

  // 加载历史记录和自定义模板
  useEffect(() => {
    const loadData = async () => {
      try {
        // 加载历史记录
        const historyData = await supabaseService.getHistory();
        if (historyData && historyData.length > 0) {
          // 过滤掉无效数据（data 为空或缺少 id 的记录）
          const validHistory = historyData.filter(item => item?.data && item.data.id);
          setHistoryRecords(validHistory.map(item => item.data));
        }
        
        // 加载自定义模板
        const templatesData = await supabaseService.getTemplates();
        if (templatesData && templatesData.length > 0) {
          templatesData.forEach(item => {
            // 校验数据有效性，跳过无效或内置模版
            if (item?.id && item?.data && !BUILT_IN_TEMPLATE_IDS.includes(item.id)) {
              templateRegistry.register(item.data);
            }
          });
          setRefreshTrigger(prev => prev + 1);
        }
      } catch (e) {
        console.warn('Supabase 加载失败，使用 localStorage 兜底', e);
        const savedHistory = localStorage.getItem('template-history');
        if (savedHistory) {
          try {
            setHistoryRecords(JSON.parse(savedHistory));
          } catch (parseError) {
            console.error('Failed to parse history records from localStorage', parseError);
          }
        }
      }
    };
    loadData();
  }, []);

  // 保存到历史记录
  const saveToHistory = useCallback(async (
    template: TemplateDefinition,
    textValues: Record<string, string>,
    imageValues: Record<string, ImageData>,
    existingRecordId?: string
  ) => {
    const now = new Date();
    const recordId = existingRecordId || `history-${now.getTime()}`;
    
    const newRecord: TemplateHistoryRecord = {
      id: recordId,
      templateId: template.id,
      templateName: template.name,
      title: textValues['name'] || `${template.name} - ${now.toLocaleString('zh-CN')}`,
      textValues,
      imageValues,
      updatedAt: now.toISOString()
    };

    try {
      await supabaseService.saveHistory(newRecord);
    } catch (e) {
      console.error('Failed to save history to Supabase', e);
    }

    setHistoryRecords(prev => {
      let updated;
      if (existingRecordId) {
        // 更新现有记录并移到最前面
        const filtered = prev.filter(r => r.id !== existingRecordId);
        updated = [newRecord, ...filtered];
      } else {
        // 添加新记录
        updated = [newRecord, ...prev];
      }
      
      try {
        localStorage.setItem('template-history', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save history to localStorage, might be quota exceeded', e);
        // 如果保存失败，不更新状态，避免状态和存储不一致
        return prev;
      }
      
      return updated;
    });
    
    // 如果是新建记录，更新当前选中的历史记录状态
    if (!existingRecordId) {
      setSelectedHistoryRecord(newRecord);
    }
  }, []);

  // 获取模版列表（refreshTrigger变化时刷新）
  const templates = useMemo(() => {
    let result = templateRegistry.getAll();
    
    // 分类过滤
    if (selectedCategory === 'built-in') {
      result = result.filter(t => BUILT_IN_TEMPLATE_IDS.includes(t.id));
    } else if (selectedCategory === 'custom') {
      result = result.filter(t => !BUILT_IN_TEMPLATE_IDS.includes(t.id));
    } else if (selectedCategory !== 'all' && selectedCategory !== 'history') {
      result = result.filter(t => t.category === selectedCategory);
    }
    
    // 搜索过滤
    if (searchQuery) {
      result = templateRegistry.search(searchQuery);
    }
    
    return result;
  }, [selectedCategory, searchQuery, refreshTrigger]); // 添加refreshTrigger依赖

  // 选择模版（始终从 registry 获取最新版本，避免 useMemo 缓存导致 containers 等字段过时）
  const handleSelectTemplate = useCallback((template: TemplateDefinition) => {
    const latestTemplate = templateRegistry.get(template.id) || template;
    setSelectedTemplate(latestTemplate);
    setSelectedHistoryRecord(null);
    setIsEditing(true);
    onSelectTemplate?.(latestTemplate);
  }, [onSelectTemplate]);

  // 选择历史记录
  const handleSelectHistory = useCallback((record: TemplateHistoryRecord) => {
    const template = templateRegistry.get(record.templateId);
    if (template) {
      setSelectedTemplate(template);
      setSelectedHistoryRecord(record);
      setIsEditing(true);
      onSelectTemplate?.(template);
    } else {
      alert('该历史记录对应的模版已不存在');
    }
  }, [onSelectTemplate]);

  // 返回列表（触发刷新，确保模板列表显示最新数据）
  const handleBack = useCallback(() => {
    setSelectedTemplate(null);
    setSelectedHistoryRecord(null);
    setIsEditing(false);
    setRefreshTrigger(prev => prev + 1); // 刷新模板列表，获取 registry 中最新的模板定义
  }, []);

  // 保存草稿
  const handleSave = useCallback((
    textValues: Record<string, string>,
    imageValues: Record<string, ImageData>
  ) => {
    if (!selectedTemplate) return;
    
    // 保存草稿到本地存储
    const draftData = {
      templateId: selectedTemplate.id,
      textValues,
      imageValues,
      savedAt: new Date().toISOString()
    };
    
    try {
      localStorage.setItem(`draft-${selectedTemplate.id}`, JSON.stringify(draftData));
    } catch (e) {
      console.error('Failed to save draft to localStorage', e);
      alert('保存草稿失败：本地存储空间不足。');
    }
    
    // 同时保存到历史记录
    saveToHistory(selectedTemplate, textValues, imageValues, selectedHistoryRecord?.id);
    
    // 【关键】保存后从 registry 获取最新的模板定义（TemplateEditor 可能已更新了 containers）
    // 同步更新 selectedTemplate 状态，确保后续操作使用最新数据
    const latestTemplate = templateRegistry.get(selectedTemplate.id);
    if (latestTemplate && latestTemplate !== selectedTemplate) {
      setSelectedTemplate(latestTemplate);
    }
    
    alert('草稿已保存，并已更新到历史记录！');
  }, [selectedTemplate, selectedHistoryRecord, saveToHistory]);

  // 导出发包文档
  const handleExport = useCallback((
    textValues: Record<string, string>,
    imageValues: Record<string, ImageData>
  ) => {
    // 设置导出数据，显示预览
    setExportData({ textValues, imageValues });
  }, []);

  // 导出为PNG图片
  const handleExportPNG = useCallback(async () => {
    if (!previewRef.current || !selectedTemplate) return;

    try {
      // 临时移除高度限制，确保完整捕获内容
      const modalContent = previewRef.current.closest('.export-modal-content');
      const modalBody = previewRef.current.closest('.export-modal-body');
      
      if (modalContent) {
        (modalContent as HTMLElement).style.maxHeight = 'none';
        (modalContent as HTMLElement).style.overflow = 'visible';
      }
      if (modalBody) {
        (modalBody as HTMLElement).style.overflow = 'visible';
        (modalBody as HTMLElement).style.maxHeight = 'none';
      }

      // 等待DOM更新和图片加载
      await new Promise(resolve => setTimeout(resolve, 500));

      // 确保所有图片都已加载
      const images = Array.from(previewRef.current.querySelectorAll('img'));
      await Promise.all(images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      }));

      // 强制设置图片的显式宽高，解决 html-to-image 无法读取 auto 宽度的问题
      // 记录原始 style 以便恢复
      const originalStyles = images.map(img => ({
        width: img.style.width,
        height: img.style.height
      }));

      images.forEach(img => {
        const rect = img.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          img.style.width = `${rect.width}px`;
          img.style.height = `${rect.height}px`;
        }
      });

      // 临时固定容器宽度，避免 max-content 导致 html-to-image 计算错误
      const originalContainerWidth = previewRef.current.style.width;
      previewRef.current.style.width = `${previewRef.current.scrollWidth}px`;

      const dataUrl = await htmlToImage.toPng(previewRef.current, {
        backgroundColor: '#1a1a2e',
        pixelRatio: 2, // 高清导出
        imagePlaceholder: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', // 1x1 transparent pixel
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left'
        }
      });

      // 恢复图片的原始 style
      images.forEach((img, index) => {
        img.style.width = originalStyles[index].width;
        img.style.height = originalStyles[index].height;
      });

      // 恢复容器宽度
      previewRef.current.style.width = originalContainerWidth;

      // 恢复高度限制
      if (modalContent) {
        (modalContent as HTMLElement).style.maxHeight = '90vh';
        (modalContent as HTMLElement).style.overflow = 'hidden';
      }
      if (modalBody) {
        // 保持当前布局：纵向可滚动，横向由内容自然铺开
        (modalBody as HTMLElement).style.overflowY = 'auto';
        (modalBody as HTMLElement).style.overflowX = 'auto';
        (modalBody as HTMLElement).style.maxHeight = '';
      }

      // 下载PNG
      const a = window.document.createElement('a');
      a.href = dataUrl;
      a.download = `发包需求-${selectedTemplate.name}-${new Date().toISOString().split('T')[0]}.png`;
      window.document.body?.appendChild(a);
      a.click();
      window.document.body?.removeChild(a);

      // 导出成功后保存到历史记录
      if (exportData) {
        saveToHistory(selectedTemplate, exportData.textValues, exportData.imageValues, selectedHistoryRecord?.id);
      }
    } catch (error: any) {
      console.error('导出PNG失败:', error);
      alert(`导出PNG失败，请重试: ${error?.message || error}`);
    }
  }, [selectedTemplate]);

  // 导出为JSON数据文件（用于数据存档，非Figma格式）
  const handleExportJSON = useCallback(() => {
    if (!selectedTemplate || !exportData) return;

    const jsonData = {
      version: '1.0',
      description: '发包需求数据文件（非Figma格式，仅供数据存档使用）',
      template: {
        id: selectedTemplate.id,
        name: selectedTemplate.name,
        category: selectedTemplate.category,
        version: selectedTemplate.version,
        figmaUrl: selectedTemplate.figmaUrl,
      },
      textValues: exportData.textValues,
      imageValues: exportData.imageValues,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `发包需求数据-${selectedTemplate.name}-${new Date().toISOString().split('T')[0]}.json`;
    window.document.body?.appendChild(a);
    a.click();
    window.document.body?.removeChild(a);
    URL.revokeObjectURL(url);

    // 导出成功后保存到历史记录
    saveToHistory(selectedTemplate, exportData.textValues, exportData.imageValues, selectedHistoryRecord?.id);
  }, [selectedTemplate, exportData, selectedHistoryRecord, saveToHistory]);

  // 创建新模版
  const handleCreateTemplate = useCallback(async (data: {
    figmaUrl: string;
    figmaToken?: string;
    name: string;
    category: TemplateCategory;
    description: string;
    tags: string[];
    referenceTemplateId?: string;
    uploadedImage?: File; // 新增：上传的设计稿图片
    customModules?: ContainerPart[]; // 自定义模块列表
  }): Promise<{ success: boolean; error?: string }> => {
    // 从Figma URL解析nodeId（图片上传模式下可能为空）
    let nodeId = '';
    if (data.figmaUrl) {
      try {
        const urlObj = new URL(data.figmaUrl);
        nodeId = urlObj.searchParams.get('node-id') || '';
      } catch {
        // 图片上传模式下 figmaUrl 可能为空，忽略解析错误
      }
    }
    
    // 获取有效的 Figma Token：优先使用传入的，其次从 localStorage 读取
    const effectiveToken = data.figmaToken?.trim() || localStorage.getItem('figma-token')?.trim() || '';
    
    let newTemplate: TemplateDefinition;

    // 优先级：自定义模块 > 参考模板 > 图片解析 > Figma Token > 报错提示
    if (data.customModules && data.customModules.length > 0) {
      // 使用自定义模块创建模板
      const now = new Date().toISOString();
      // 从模块中提取字段和图片槽位
        const textFields: TextFieldConfig[] = [];
        const imageSlots: ImageSlotConfig[] = [];
      
      data.customModules.forEach(module => {
        // 添加文字字段
        module.textFields.forEach(field => {
          textFields.push({
            id: field.id,
            label: field.label,
            placeholder: field.placeholder || '',
            defaultValue: field.defaultValue || '',
            required: field.required,
            maxLength: field.maxLength
          });
        });
        // 添加图片槽位
        module.imageSlots.forEach(slot => {
          imageSlots.push({
            id: slot.id,
            label: slot.label,
            description: slot.description || '',
            required: slot.required,
            supportedFormats: slot.supportedFormats || ['png', 'jpg', 'psd']
          });
        });
      });

      // 在 textFields 开头插入主题名称和版本信息（与内置模板结构一致）
      const todayVersion = getTodayVersion();
      textFields.unshift(
        {
          id: 'overall-version-info',
          label: '版本信息',
          placeholder: todayVersion,
          defaultValue: todayVersion,
          required: false,
          maxLength: 30
        },
        {
          id: 'overall-theme-name',
          label: '主题名称',
          placeholder: '请输入主题名称',
          defaultValue: data.name,
          required: true,
          maxLength: 50
        }
      );
      
      newTemplate = {
        id: `template-custom-${Date.now()}`,
        name: data.name,
        description: data.description || '自定义模板',
        category: data.category,
        tags: data.tags.length > 0 ? data.tags : ['自定义'],
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        version: todayVersion,
        textFields,
        imageSlots,
        previewLayout: {
          width: 800,
          height: 600
        },
        containers: data.customModules // 保存容器结构，用于按模块渲染
      };
    } else if (data.referenceTemplateId) {
      // 基于参考模板克隆结构
      newTemplate = createTemplateFromReference(data, nodeId, data.referenceTemplateId);
    } else if (data.uploadedImage) {
      // 通过上传图片解析创建模板
      try {
        const analysisResult = await analyzeImage(data.uploadedImage);
        const now = new Date().toISOString();
        // 用户选择的分类优先，否则用推断结果
        const finalCategory = data.category !== 'other' ? data.category : analysisResult.suggestedCategory;
        newTemplate = {
          id: `template-img-${Date.now()}`,
          name: data.name,
          description: data.description || `从图片解析创建的模板（推断分类：${finalCategory}）`,
          category: finalCategory,
          tags: data.tags.length > 0 ? data.tags : ['图片解析'],
          status: 'draft',
          createdAt: now,
          updatedAt: now,
          version: getTodayVersion(),
          textFields: [
            {
              id: 'overall-version-info',
              label: '版本信息',
              placeholder: getTodayVersion(),
              defaultValue: getTodayVersion(),
              required: false,
              maxLength: 30
            },
            {
              id: 'overall-theme-name',
              label: '主题名称',
              placeholder: '请输入主题名称',
              defaultValue: data.name,
              required: true,
              maxLength: 50
            },
            ...analysisResult.textFields
          ],
          imageSlots: analysisResult.imageSlots,
          previewLayout: analysisResult.previewLayout
        };
      } catch (error: any) {
        console.error('图片解析失败:', error);
        return {
          success: false,
          error: `图片解析失败：${error?.message || '未知错误'}`
        };
      }
    } else if (effectiveToken) {
      try {
        // 使用有效的 Token 从 Figma 获取真实数据
        newTemplate = await createTemplateFromFigma(
          data.figmaUrl,
          effectiveToken,
          data.name,
          data.category,
          {
            description: data.description,
            tags: data.tags
          }
        );
      } catch (error: any) {
        // 导入失败：返回错误信息，不生成默认模板，不关闭弹窗
        console.error('从Figma导入失败:', error);
        const errorMsg = error?.message || '未知错误';
        return {
          success: false,
          error: `Figma 导入失败：${errorMsg}`
        };
      }
    } else {
      // 未提供Token也未选参考模板也未上传图片：提示用户必须选择一种方式
      return {
        success: false,
        error: '请提供 Figma Token 以导入设计稿，或上传设计稿图片进行解析，或选择一个参考模板来复用已有框架结构。'
      };
    }
    
    // 注册模版
    templateRegistry.register(newTemplate);
    
    // 保存到 Supabase
    try {
      await supabaseService.saveTemplate(newTemplate);
    } catch (e) {
      console.error('Failed to save template to Supabase', e);
    }
    
    // 触发模板列表刷新
    setRefreshTrigger(prev => prev + 1);
    
    // 切换到新模版
    setSelectedTemplate(newTemplate);
    setIsEditing(true);
    setShowCreateModal(false);

    return { success: true };
  }, []);

  // 辅助函数：基于参考模板克隆结构（学习模板能力的核心）
  const createTemplateFromReference = (
    data: any,
    nodeId: string,
    referenceTemplateId: string
  ): TemplateDefinition => {
    const refTemplate = templateRegistry.get(referenceTemplateId);
    const now = new Date().toISOString();

    if (!refTemplate) {
      // 找不到参考模板，回退到基础结构
      return createBasicTemplate(data, nodeId);
    }

    // 克隆参考模板的所有字段和图片坑位，清空默认值
    const clonedTextFields = refTemplate.textFields.map(field => ({
      ...field,
      defaultValue: field.id === 'overall-theme-name' ? data.name
        : field.id === 'overall-version-info' ? getTodayVersion()
        : '' // 清空默认值，让用户填写新内容
    }));

    const clonedImageSlots = refTemplate.imageSlots.map(slot => ({
      ...slot,
      defaultImage: undefined // 清空默认图片
    }));

    // 克隆参考模板的容器结构（如果有）
    const clonedContainers = refTemplate.containers ? refTemplate.containers.map(container => ({
      ...container,
      textFields: container.textFields.map(f => ({ ...f, defaultValue: '' })),
      imageSlots: container.imageSlots.map(s => ({ ...s, defaultImage: undefined }))
    })) : undefined;

    return {
      id: `template-${Date.now()}`,
      name: data.name,
      description: data.description || `从参考模板「${refTemplate.name}」克隆的框架结构`,
      category: data.category,
      tags: data.tags,
      status: 'draft',
      figmaUrl: data.figmaUrl,
      figmaNodeId: nodeId,
      createdAt: now,
      updatedAt: now,
      version: getTodayVersion(),
      textFields: clonedTextFields,
      imageSlots: clonedImageSlots,
      previewLayout: { ...refTemplate.previewLayout },
      ...(clonedContainers ? { containers: clonedContainers } : {}) // 保留容器结构
    };
  };

  // 辅助函数：创建基础模版结构（无参考模板时的兜底）
  const createBasicTemplate = (data: any, nodeId: string): TemplateDefinition => {
    const now = new Date().toISOString();
    return {
      id: `template-${Date.now()}`,
      name: data.name,
      description: data.description,
      category: data.category,
      tags: data.tags,
      status: 'draft',
      figmaUrl: data.figmaUrl,
      figmaNodeId: nodeId,
      createdAt: now,
      updatedAt: now,
      version: getTodayVersion(),
      textFields: [
        {
          id: 'overall-version-info',
          label: '版本信息',
          placeholder: getTodayVersion(),
          defaultValue: getTodayVersion(),
          required: false,
          maxLength: 30
        },
        {
          id: 'overall-theme-name',
          label: '主题名称',
          placeholder: '请输入主题名称',
          defaultValue: data.name,
          required: true,
          maxLength: 50
        },
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
          required: false
        }
      ],
      imageSlots: [
        {
          id: 'main-image',
          label: '主图片',
          description: '主要图片资源',
          required: true,
          supportedFormats: ['png', 'psd', 'jpg']
        }
      ],
      previewLayout: {
        width: 800,
        height: 600,
        backgroundColor: '#1a1a2e'
      }
    };
  };

  // 渲染模块内顶栏（替代原来的 library-header）
  const renderModuleHeader = () => (
    <div className="module-topbar">
      <div className="module-topbar-left">
        {onBackToDashboard && (
          <button className="btn-back-dashboard" onClick={onBackToDashboard}>
            ← 返回
          </button>
        )}
        <h1 className="module-page-title">发包模版</h1>
      </div>
      <div className="module-topbar-right">
        <div className="search-box">
          <span className="search-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </span>
          <input
            type="text"
            placeholder="搜索模版..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
    </div>
  );

  // 渲染分类标签
  const renderCategoryTabs = () => (
    <div className="category-tabs">
      <button
        className={`tab-btn ${selectedCategory === 'all' ? 'active' : ''}`}
        onClick={() => setSelectedCategory('all')}
      >
        全部模版
      </button>
      <button
        className={`tab-btn ${selectedCategory === 'built-in' ? 'active' : ''}`}
        onClick={() => setSelectedCategory('built-in')}
      >
        固定模版
      </button>
      <button
        className={`tab-btn ${selectedCategory === 'custom' ? 'active' : ''}`}
        onClick={() => setSelectedCategory('custom')}
      >
        自定义模版
      </button>
      <button
        className={`tab-btn ${selectedCategory === 'history' ? 'active' : ''}`}
        onClick={() => setSelectedCategory('history')}
      >
☰ 历史记录
      </button>
    </div>
  );

  // 删除模版（固定模版不可删除）
  const handleDeleteTemplate = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (BUILT_IN_TEMPLATE_IDS.includes(id)) return;
    if (window.confirm('确定要删除这个模版吗？')) {
      templateRegistry.unregister(id);
      // 强制重新渲染列表
      setSearchQuery(prev => prev + ' ');
      setTimeout(() => setSearchQuery(prev => prev.trim()), 0);
    }
  }, []);

  // 渲染模版卡片
  const renderTemplateCard = (template: TemplateDefinition) => (
    <div
      key={template.id}
      className="template-card"
      onClick={() => handleSelectTemplate(template)}
    >
      <div className="card-thumbnail">
        {template.thumbnail ? (
          <img src={template.thumbnail} alt={template.name} />
        ) : (
          <div className="thumbnail-placeholder">
<span className="placeholder-icon">◆</span>
          </div>
        )}
      </div>
      <div className="card-content">
        <h3 className="card-title">{template.name}</h3>
        <p className="card-description">{template.description}</p>
        <div className="card-meta">
          <span className="card-category">{categoryLabels[template.category]}</span>
        </div>
      </div>
      <div className="card-footer">
        {/* 实时显示当前日期，反映最新状态 */}
        <span className="card-date">
          更新于 {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' })}
        </span>
        <div className="card-actions">
          {!BUILT_IN_TEMPLATE_IDS.includes(template.id) && (
            <button 
              className="btn-delete-history" 
              onClick={(e) => handleDeleteTemplate(e, template.id)}
              title="删除模版"
            >
              🗑️
            </button>
          )}
          <button className="btn-use">使用模版</button>
        </div>
      </div>
    </div>
  );

  // 删除历史记录
  const handleDeleteHistory = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('确定要删除这条历史记录吗？')) {
      setHistoryRecords(prev => {
        const updated = prev.filter(record => record.id !== id);
        localStorage.setItem('template-history', JSON.stringify(updated));
        return updated;
      });
    }
  }, []);

  // 渲染历史记录卡片
  const renderHistoryCard = (record: TemplateHistoryRecord) => (
    <div
      key={record.id}
      className="template-card history-card"
      onClick={() => handleSelectHistory(record)}
    >
      <div className="card-thumbnail">
        <div className="thumbnail-placeholder">
          <span className="placeholder-icon">🕒</span>
        </div>
      </div>
      <div className="card-content">
        <h3 className="card-title">{record.title}</h3>
        <p className="card-description">基于模版: {record.templateName}</p>
        <div className="card-meta">
          <span className="card-category">历史记录</span>
        </div>
      </div>
      <div className="card-footer">
        <span className="card-date">
          {new Date(record.updatedAt).toLocaleString('zh-CN')}
        </span>
        <div className="card-actions">
          <button 
            className="btn-delete-history" 
            onClick={(e) => handleDeleteHistory(e, record.id)}
            title="删除记录"
          >
            🗑️
          </button>
          <button className="btn-use">继续编辑</button>
        </div>
      </div>
    </div>
  );

  // 渲染模版列表（重构入口布局）
  const renderTemplateList = () => (
    <div className="template-library">
      {renderModuleHeader()}
      {renderCategoryTabs()}

      {selectedCategory === 'history' ? (
        <div className="templates-grid">
          {historyRecords.length > 0 ? (
            historyRecords.map(renderHistoryCard)
          ) : (
            <div className="empty-state">
              <span className="empty-icon">🕒</span>
              <p>暂无历史记录</p>
            </div>
          )}
        </div>
      ) : selectedCategory === 'built-in' ? (
        /* 固定模版Tab：只显示固定模版 */
        <div className="template-section">
          <div className="template-section-header">
            <h3 className="template-section-title">固定模版</h3>
          </div>
          <div className="templates-grid">
            {templates.map(renderTemplateCard)}
            {templates.length === 0 && (
              <div className="empty-state">
                <span className="empty-icon">📭</span>
                <p>暂无固定模版</p>
              </div>
            )}
          </div>
        </div>
      ) : selectedCategory === 'custom' ? (
        /* 自定义模版Tab：只显示自定义模版 + 新建卡片 */
        <div className="template-section">
          <div className="template-section-header">
            <h3 className="template-section-title">自定义模版</h3>
          </div>
          <div className="templates-grid">
            {templates.map(renderTemplateCard)}
            <div
              className="template-card create-card"
              onClick={() => setShowCreateModal(true)}
            >
              <div className="card-thumbnail create-thumbnail">
                <span className="create-icon">＋</span>
              </div>
              <div className="card-content">
                <h3 className="card-title">新建模版</h3>
                <p className="card-description">从 Figma 导入或上传设计稿创建新模版</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* 全部模版Tab：分区展示 */
        <>
          {/* 固定模版分区 */}
          {templates.filter(t => BUILT_IN_TEMPLATE_IDS.includes(t.id)).length > 0 && (
            <div className="template-section">
              <div className="template-section-header">
                <h3 className="template-section-title">固定模版</h3>
              </div>
              <div className="templates-grid">
                {templates.filter(t => BUILT_IN_TEMPLATE_IDS.includes(t.id)).map(renderTemplateCard)}
              </div>
            </div>
          )}

          {/* 自定义模版分区 */}
          <div className="template-section">
            <div className="template-section-header">
              <h3 className="template-section-title">自定义模版</h3>
            </div>
            <div className="templates-grid">
              {templates.filter(t => !BUILT_IN_TEMPLATE_IDS.includes(t.id)).map(renderTemplateCard)}
              {/* 新建模版卡片 - 始终显示在最后 */}
              <div
                className="template-card create-card"
                onClick={() => setShowCreateModal(true)}
              >
                <div className="card-thumbnail create-thumbnail">
                  <span className="create-icon">＋</span>
                </div>
                <div className="card-content">
                  <h3 className="card-title">新建模版</h3>
                  <p className="card-description">从 Figma 导入或上传设计稿创建新模版</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );

  // 获取初始值 - 确保始终返回完整结构，避免 undefined 导致 useEffect 重置
  const initialValues = useMemo(() => {
    if (!selectedTemplate) return { textValues: {}, imageValues: {} };
    
    if (selectedHistoryRecord) {
      return {
        textValues: selectedHistoryRecord.textValues || {},
        imageValues: selectedHistoryRecord.imageValues || {}
      };
    } else {
      const savedDraft = localStorage.getItem(`draft-${selectedTemplate.id}`);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        return {
          textValues: parsed.textValues || {},
          imageValues: parsed.imageValues || {}
        };
      }
      // 无草稿时返回空对象结构，确保稳定引用
      return { textValues: {}, imageValues: {} };
    }
  }, [selectedTemplate, selectedHistoryRecord]);

  // 渲染编辑视图
  const renderEditorView = () => {
    if (!selectedTemplate) return null;

    // 根据模版类型选择编辑器
    const isKillIconTemplate = selectedTemplate.category === 'kill-icon';

    return (
      <div className="editor-view">
        {isKillIconTemplate ? (
          <KillIconEditor
            template={selectedTemplate}
            initialTextValues={initialValues.textValues}
            initialImageValues={initialValues.imageValues}
            onSave={handleSave}
            onExport={handleExport}
            onBack={handleBack}
          />
        ) : (
          <TemplateEditor
            template={selectedTemplate}
            initialTextValues={initialValues.textValues}
            initialImageValues={initialValues.imageValues}
            onSave={handleSave}
            onExport={handleExport}
            onBack={handleBack}
          />
        )}
      </div>
    );
  };

  return (
    <div className="template-library-container">
      {isEditing ? renderEditorView() : renderTemplateList()}
      
      {/* 创建模版弹窗 */}
      <CreateTemplateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateTemplate}
      />
      
      {/* 导出预览弹窗 */}
      {exportData && selectedTemplate && (
        <div className="export-modal-overlay" onClick={() => setExportData(null)}>
          <div className="export-modal-content" onClick={e => e.stopPropagation()}>
            <div className="export-modal-header">
              <h2>导出发包文档</h2>
              <button className="export-close-btn" onClick={() => setExportData(null)}>✕</button>
            </div>
            <div className="export-modal-body">
              <div ref={previewRef} className="export-preview-container">
                <DocumentPreview
                  template={selectedTemplate}
                  textValues={exportData.textValues}
                  imageValues={exportData.imageValues}
                />
              </div>
            </div>
            <div className="export-modal-footer">
              <button className="btn-export-png" onClick={handleExportPNG}>
⎙ 导出PNG图片
              </button>
              <button className="btn-export-json" onClick={handleExportJSON}>
                ↗ 导出JSON数据
              </button>
              <button className="btn-cancel" onClick={() => setExportData(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// 字段ID转标签
function getFieldLabel(fieldId: string): string {
  const labels: Record<string, string> = {
    'overall-impression-1': '要点1',
    'overall-impression-2': '要点2',
    'overall-impression-3': '要点3',
    'badge-description': '徽章描述',
    'badge-keywords': '主题关键字',
    'border-description': '边框描述',
    'kill-mark-description': '击杀印记描述',
    'colorful-description': '炫彩描述'
  };
  return labels[fieldId] || fieldId;
}

export default TemplateLibrary;