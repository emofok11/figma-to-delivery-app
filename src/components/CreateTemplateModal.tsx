import React, { useState, useCallback, useMemo, useRef } from 'react';
import { TemplateCategory, SmartParseResult, ContainerPart } from '../types/template';
import { templateRegistry, categoryLabels } from '../lib/templateRegistry';
import { analyzeImage } from '../lib/imageAnalyzer';
import { createDescriptionPart, createListItemPart, createImageGroupPart, createTablePart } from '../lib/containerParts';
import './CreateTemplateModal.css';

interface CreateTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    figmaUrl: string;
    figmaToken?: string;
    name: string;
    category: TemplateCategory;
    description: string;
    tags: string[];
    referenceTemplateId?: string; // 参考模板ID，用于克隆结构
    uploadedImage?: File; // 上传的设计稿图片（用于图片解析创建模板）
    customModules?: ContainerPart[]; // 自定义模块列表（自定义模板模式）
  }) => Promise<{ success: boolean; error?: string }>; // 返回结果，失败时携带原因
}

export const CreateTemplateModal: React.FC<CreateTemplateModalProps> = ({
  isOpen,
  onClose,
  onSubmit
}) => {
  const [figmaUrl, setFigmaUrl] = useState('');
  const [figmaToken, setFigmaToken] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('other');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState(1);
  const [referenceTemplateId, setReferenceTemplateId] = useState<string>(''); // 参考模板
  const [submitError, setSubmitError] = useState<string>(''); // 提交失败的错误信息
  const [showToken, setShowToken] = useState(false); // 控制 Token 明文/密文显示
  const [sourceMode, setSourceMode] = useState<'figma' | 'image'>('figma'); // 数据来源模式
  const [uploadedImage, setUploadedImage] = useState<File | null>(null); // 上传的图片文件
  const [imagePreview, setImagePreview] = useState<string>(''); // 图片预览 base64
  const [isDragging, setIsDragging] = useState(false); // 拖拽状态
  const fileInputRef = useRef<HTMLInputElement>(null); // 文件选择器引用
  
  // 智能解析相关状态
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [parseResult, setParseResult] = useState<SmartParseResult | null>(null);
  const [parseError, setParseError] = useState<string>('');
  
  // 自定义模块相关状态
  const [customModules, setCustomModules] = useState<ContainerPart[]>([]); // 自定义添加的模块
  const [draggedModuleId, setDraggedModuleId] = useState<string | null>(null); // 拖拽中的模块ID
  const [dragOverModuleId, setDragOverModuleId] = useState<string | null>(null); // 拖拽经过的模块ID
  const [customCategories, setCustomCategories] = useState<string[]>([]); // 自定义分类
  const [newCategoryName, setNewCategoryName] = useState(''); // 新分类名称输入
  const [showCategoryInput, setShowCategoryInput] = useState(false); // 显示新分类输入框
  const [isCustomMode, setIsCustomMode] = useState(false); // 是否为自定义模板模式

  // 获取所有可用模板作为参考选项
  const availableTemplates = useMemo(() => templateRegistry.getAll(), []);

  // 初始化时读取保存的Figma令牌
  React.useEffect(() => {
    if (isOpen) {
      const savedToken = localStorage.getItem('figma-token');
      if (savedToken) {
        setFigmaToken(savedToken);
      }
    }
  }, [isOpen]);

  // 解析Figma链接
  const parseFigmaUrl = useCallback((url: string): boolean => {
    try {
      const urlObj = new URL(url);
      if (!urlObj.hostname.includes('figma.com')) {
        return false;
      }
      const nodeId = urlObj.searchParams.get('node-id');
      return !!nodeId;
    } catch {
      return false;
    }
  }, []);

  const isFigmaUrlValid = parseFigmaUrl(figmaUrl);

  // 解析标签
  const parseTags = (input: string): string[] => {
    return input
      .split(/[,，]/)
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);
  };

  // 处理图片上传
  const handleImageUpload = useCallback(async (file: File) => {
    // 校验文件类型
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setSubmitError('不支持的图片格式，请上传 PNG、JPG、GIF 或 WebP 格式的图片');
      return;
    }
    // 校验文件大小（最大 20MB）
    if (file.size > 20 * 1024 * 1024) {
      setSubmitError('图片文件过大，请上传不超过 20MB 的图片');
      return;
    }
    setUploadedImage(file);
    setSubmitError('');
    setParseError('');
    setParseResult(null);
    
    // 生成预览
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
    
    // 自动触发智能解析
    setIsAnalyzing(true);
    try {
      const result = await analyzeImage(file);
      // analyzeImage 返回的结果直接包含 suggestedCategory，无需通过 smartResult
      setParseResult(null);
      // 自动填充建议的分类
      if (result.suggestedCategory) {
        setCategory(result.suggestedCategory);
      }
    } catch (error: any) {
      console.error('图片解析失败:', error);
      setParseError(error?.message || '图片解析失败，请重试');
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  // 拖拽事件处理
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleImageUpload(files[0]);
    }
  }, [handleImageUpload]);

  // 移除已上传的图片
  const handleRemoveImage = useCallback(() => {
    setUploadedImage(null);
    setImagePreview('');
    setParseResult(null);
    setParseError('');
    setSubmitError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // 粘贴上传：监听全局 paste 事件，从剪贴板读取图片
  const handlePaste = useCallback((e: ClipboardEvent) => {
    // 仅在图片上传模式 + 步骤1 时生效
    if (sourceMode !== 'image' || step !== 1) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault(); // 阻止默认粘贴行为
        const file = items[i].getAsFile();
        if (file) {
          // 剪贴板图片默认文件名为 image.png，加上时间戳区分
          const namedFile = new File(
            [file],
            `clipboard-${Date.now()}.${file.type.split('/')[1] || 'png'}`,
            { type: file.type }
          );
          handleImageUpload(namedFile);
        }
        break; // 只取第一张图片
      }
    }
  }, [sourceMode, step, handleImageUpload]);

  // 注册/注销全局粘贴事件监听
  React.useEffect(() => {
    if (isOpen) {
      document.addEventListener('paste', handlePaste);
    }
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [isOpen, handlePaste]);

  // 判断步骤1是否可以进入下一步
  const canProceedStep1 = sourceMode === 'figma' ? isFigmaUrlValid : !!uploadedImage;

  // 下一步
  const handleNextStep = useCallback(() => {
    if (step === 1 && canProceedStep1) {
      // Figma 模式下保存令牌
      if (sourceMode === 'figma' && figmaToken.trim()) {
        localStorage.setItem('figma-token', figmaToken.trim());
      } else if (sourceMode === 'figma') {
        localStorage.removeItem('figma-token');
      }
      setStep(2);
    }
  }, [step, canProceedStep1, sourceMode, figmaToken]);

  // 提交
  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      alert('请输入模版名称');
      return;
    }

    // 自定义模式下必须至少有一个模块
    if (isCustomMode && customModules.length === 0) {
      alert('请至少添加一个自定义模块');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(''); // 清除上次的错误
    
    try {
      // 提交前再次确保令牌已保存
      if (figmaToken.trim()) {
        localStorage.setItem('figma-token', figmaToken.trim());
      }
      
      // 调用 onSubmit 并等待结果
      const result = await onSubmit({
        figmaUrl: sourceMode === 'figma' ? figmaUrl : '',
        figmaToken: sourceMode === 'figma' ? figmaToken.trim() : undefined,
        name: name.trim(),
        category,
        description: description.trim(),
        tags: parseTags(tagsInput),
        referenceTemplateId: referenceTemplateId || undefined,
        uploadedImage: sourceMode === 'image' ? (uploadedImage || undefined) : undefined,
        customModules: isCustomMode ? customModules : undefined // 自定义模块
      });
      
      if (result.success) {
        // 成功：重置表单并关闭弹窗
        setFigmaUrl('');
        setName('');
        setCategory('other');
        setDescription('');
        setTagsInput('');
        setReferenceTemplateId('');
        setSubmitError('');
        setStep(1);
        setSourceMode('figma');
        setUploadedImage(null);
        setImagePreview('');
        setCustomModules([]); // 重置自定义模块
        setIsCustomMode(false); // 重置自定义模式
        onClose();
      } else {
        // 失败：不关闭弹窗，显示错误信息
        setSubmitError(result.error || '创建失败，请检查输入后重试');
      }
    } catch (error: any) {
      console.error('创建模版失败:', error);
      setSubmitError(error?.message || '创建模版失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  }, [figmaUrl, figmaToken, name, category, description, tagsInput, referenceTemplateId, onSubmit, onClose, sourceMode, uploadedImage, isCustomMode, customModules]);

  // 关闭并重置
  const handleClose = useCallback(() => {
    setFigmaUrl('');
    setName('');
    setCategory('other');
    setDescription('');
    setTagsInput('');
    setReferenceTemplateId('');
    setSubmitError('');
    setStep(1);
    setSourceMode('figma');
    setUploadedImage(null);
    setImagePreview('');
    setIsAnalyzing(false);
    setParseResult(null);
    setParseError('');
    setCustomModules([]); // 重置自定义模块
    setIsCustomMode(false); // 重置自定义模式
    setCustomCategories([]); // 重置自定义分类
    setShowCategoryInput(false);
    setNewCategoryName('');
    onClose();
  }, [onClose]);

  // ===== 自定义模块操作函数 =====
  
  /**
   * 添加描述模块
   */
  const handleAddDescriptionModule = useCallback(() => {
    const descModule = createDescriptionPart({ 
      id: `custom-desc-${Date.now()}`,
      label: '自定义描述'
    });
    setCustomModules(prev => [...prev, descModule]);
  }, []);

  /**
   * 添加列表条目模块
   */
  const handleAddListItemModule = useCallback(() => {
    const index = customModules.filter(m => m.type === 'list').length + 1;
    const containerId = `custom-list-${Date.now()}`;
    // 使用容器 ID 作为字段前缀，确保每个 list 容器的字段 ID 唯一
    const listModule = createListItemPart(1, { idPrefix: containerId });
    listModule.id = containerId;
    listModule.label = `自定义条目${index}`;
    setCustomModules(prev => [...prev, listModule]);
  }, [customModules]);

  /**
   * 添加图片组模块
   */
  const handleAddImageGroupModule = useCallback(() => {
    const imgModule = createImageGroupPart({ 
      id: `custom-img-${Date.now()}`,
      label: '自定义参考图',
      count: 1
    });
    setCustomModules(prev => [...prev, imgModule]);
  }, []);

  /**
   * 添加表格模块
   */
  const handleAddTableModule = useCallback(() => {
    const tableModule = createTablePart({ 
      id: `custom-table-${Date.now()}`,
      label: '自定义表格',
      rows: 1
    });
    setCustomModules(prev => [...prev, tableModule]);
  }, []);

  /**
   * 删除自定义模块
   */
  const handleRemoveModule = useCallback((moduleId: string) => {
    setCustomModules(prev => prev.filter(m => m.id !== moduleId));
  }, []);

  /**
   * 拖拽排序：开始拖拽
   */
  const handleDragStart = useCallback((moduleId: string) => {
    setDraggedModuleId(moduleId);
  }, []);

  /**
   * 拖拽排序：拖拽经过其他模块
   */
  const handleModuleDragOver = useCallback((e: React.DragEvent, moduleId: string) => {
    e.preventDefault(); // 允许放置
    if (draggedModuleId && draggedModuleId !== moduleId) {
      setDragOverModuleId(moduleId);
    }
  }, [draggedModuleId]);

  /**
   * 拖拽排序：离开模块区域
   */
  const handleModuleDragLeave = useCallback(() => {
    setDragOverModuleId(null);
  }, []);

  /**
   * 拖拽排序：放置完成，交换位置
   */
  const handleModuleDrop = useCallback((targetModuleId: string) => {
    if (!draggedModuleId || draggedModuleId === targetModuleId) {
      setDraggedModuleId(null);
      setDragOverModuleId(null);
      return;
    }
    
    setCustomModules(prev => {
      const modules = [...prev];
      const draggedIndex = modules.findIndex(m => m.id === draggedModuleId);
      const targetIndex = modules.findIndex(m => m.id === targetModuleId);
      
      if (draggedIndex !== -1 && targetIndex !== -1) {
        // 交换位置
        const [draggedModule] = modules.splice(draggedIndex, 1);
        modules.splice(targetIndex, 0, draggedModule);
      }
      return modules;
    });
    
    setDraggedModuleId(null);
    setDragOverModuleId(null);
  }, [draggedModuleId]);

  /**
   * 拖拽排序：拖拽结束（清理状态）
   */
  const handleModuleDragEnd = useCallback(() => {
    setDraggedModuleId(null);
    setDragOverModuleId(null);
  }, []);

  /**
   * 添加自定义分类
   */
  const handleAddCustomCategory = useCallback(() => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    if (customCategories.includes(trimmed)) {
      alert('该分类已存在');
      return;
    }
    // 检查是否与预设分类重复
    const presetCategories = Object.keys(categoryLabels);
    if (presetCategories.includes(trimmed)) {
      alert('该分类名称与系统预设分类重复，请使用其他名称');
      return;
    }
    setCustomCategories(prev => [...prev, trimmed]);
    setCategory(trimmed as TemplateCategory); // 自动选中新分类
    setNewCategoryName('');
    setShowCategoryInput(false);
  }, [newCategoryName, customCategories]);

  /**
   * 删除自定义分类
   */
  const handleRemoveCustomCategory = useCallback((catName: string) => {
    setCustomCategories(prev => prev.filter(c => c !== catName));
    // 如果当前选中的是被删除的分类，重置为other
    if (category === catName) {
      setCategory('other');
    }
  }, [category]);

  /**
   * 为图片组模块添加额外图片坑位
   */
  const handleAddImageSlot = useCallback((moduleId: string) => {
    setCustomModules(prev => prev.map(m => {
      if (m.id !== moduleId || m.type !== 'image-group') return m;
      const newIndex = m.imageSlots.length;
      return {
        ...m,
        imageSlots: [
          ...m.imageSlots,
          {
            id: `${moduleId}-img-${newIndex + 1}`,
            label: `${m.label}${newIndex + 1}`,
            description: `${m.label}${newIndex + 1}`,
            required: false,
            supportedFormats: ['png', 'jpg', 'psd']
          }
        ]
      };
    }));
  }, []);

  /**
   * 为表格模块添加行
   */
  const handleAddTableRow = useCallback((moduleId: string) => {
    setCustomModules(prev => prev.map(m => {
      if (m.id !== moduleId || m.type !== 'table') return m;
      const newIndex = m.textFields.length;
      return {
        ...m,
        textFields: [
          ...m.textFields,
          {
            id: `${moduleId}-row-${newIndex + 1}`,
            label: `${m.label} 第${newIndex + 1}行`,
            placeholder: `请输入第${newIndex + 1}行内容`,
            defaultValue: '',
            required: false,
            maxLength: 200
          }
        ]
      };
    }));
  }, []);

  // 合并所有分类选项（预设 + 自定义）
  const allCategories = useMemo(() => {
    const preset = Object.keys(categoryLabels) as TemplateCategory[];
    return [...preset, ...customCategories] as (TemplateCategory | string)[];
  }, [customCategories]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>创建新模版</h2>
          <button className="modal-close" onClick={handleClose}>×</button>
        </div>

        {/* 步骤指示器 */}
        <div className="step-indicator">
          <div className={`step ${step >= 1 ? 'active' : ''}`}>
            <span className="step-number">1</span>
            <span className="step-label">{sourceMode === 'figma' ? 'Figma链接' : '上传图片'}</span>
          </div>
          <div className="step-line" />
          <div className={`step ${step >= 2 ? 'active' : ''}`}>
            <span className="step-number">2</span>
            <span className="step-label">模版配置</span>
          </div>
        </div>

        <div className="modal-body">
          {/* 步骤1: Figma链接 */}
          {step === 1 && (
            <div className="form-section">
              {/* 数据来源模式切换 */}
              <div className="source-mode-switch">
                <button
                  className={`source-mode-btn ${sourceMode === 'figma' ? 'active' : ''}`}
                  onClick={() => { setSourceMode('figma'); setSubmitError(''); }}
                >
                  🔗 Figma链接导入
                </button>
                <button
                  className={`source-mode-btn ${sourceMode === 'image' ? 'active' : ''}`}
                  onClick={() => { setSourceMode('image'); setSubmitError(''); }}
                >
                  🖼️ 上传图片解析
                </button>
              </div>

              {/* Figma 模式 */}
              {sourceMode === 'figma' && (
              <>
              <div className="form-group">
                <label className="form-label">
                  Figma链接 <span className="required">*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="请输入Figma设计稿链接，需包含node-id参数"
                  value={figmaUrl}
                  onChange={(e) => setFigmaUrl(e.target.value)}
                />
                {figmaUrl && !isFigmaUrlValid && (
                  <p className="form-error">请输入有效的Figma链接，链接需包含node-id参数</p>
                )}
                {isFigmaUrlValid && (
                  <p className="form-success">✓ 链接格式正确</p>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">
                  Figma 个人访问令牌 (Personal Access Token)
                </label>
                <div className="token-input-wrapper">
                  <input
                    type={showToken ? 'text' : 'password'}
                    className={`form-input ${submitError ? 'input-error' : ''}`}
                    placeholder="请输入Figma Token (可选，用于获取真实数据)"
                    value={figmaToken}
                    onChange={(e) => { setFigmaToken(e.target.value); setSubmitError(''); }}
                  />
                  {/* 切换 Token 可见性按钮 */}
                  <button
                    type="button"
                    className="token-toggle-btn"
                    onClick={() => setShowToken(prev => !prev)}
                    title={showToken ? '隐藏令牌' : '显示令牌'}
                  >
                    {showToken ? '🙈' : '👁️'}
                  </button>
                </div>
                {/* Token 来源提示：显示当前 Token 是用户输入的还是从本地缓存读取的 */}
                {figmaToken && (
                  <p className="form-success" style={{ fontSize: '12px', marginTop: '4px' }}>
                    ✓ 已填入令牌（{figmaToken.length}位）
                  </p>
                )}
                <p className="form-hint" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                  令牌将保存在本地浏览器中。在 Figma 账号设置 - Personal access tokens 中生成。
                </p>
              </div>

              {/* 导入失败错误提示区域 */}
              {submitError && (
                <div className="error-banner">
                  <span className="error-icon">⚠️</span>
                  <div className="error-content">
                    <p className="error-title">导入失败</p>
                    <p className="error-message">{submitError}</p>
                    <p className="error-hint">请检查以上 Figma 链接和 Token 是否正确后重新提交。</p>
                  </div>
                </div>
              )}
              
              <div className="help-section">
                <h4>如何获取Figma链接？</h4>
                <ol>
                  <li>在Figma中打开设计稿</li>
                  <li>选中要导出的节点</li>
                  <li>右键菜单选择"复制链接"</li>
                  <li>粘贴到上方输入框</li>
                </ol>
              </div>
              </>
              )}

              {/* 图片上传模式 */}
              {sourceMode === 'image' && (
              <>
                <div className="form-group">
                  <label className="form-label">
                    上传设计稿图片 <span className="required">*</span>
                  </label>
                  {/* 拖拽上传区域 */}
                  <div
                    className={`image-upload-zone ${isDragging ? 'dragging' : ''} ${uploadedImage ? 'has-image' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => !uploadedImage && fileInputRef.current?.click()}
                  >
                    {uploadedImage && imagePreview ? (
                      <div className="upload-preview">
                        <img src={imagePreview} alt="预览" className="upload-preview-img" />
                        <div className="upload-preview-info">
                          <span className="upload-filename">{uploadedImage.name}</span>
                          <span className="upload-filesize">
                            {(uploadedImage.size / 1024).toFixed(1)} KB
                          </span>
                        </div>
                        <button
                          className="upload-remove-btn"
                          onClick={(e) => { e.stopPropagation(); handleRemoveImage(); }}
                          title="移除图片"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="upload-placeholder">
                        <span className="upload-icon">📤</span>
                        <p className="upload-text">点击、拖拽或粘贴图片到此处上传</p>
                        <p className="upload-hint">支持 PNG、JPG、GIF、WebP，最大 20MB</p>
                        <p className="upload-paste-hint">💡 可直接使用 Ctrl+V / ⌘+V 粘贴截图</p>
                      </div>
                    )}
                    {/* 隐藏的文件选择器 */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file);
                      }}
                    />
                  </div>
                  
                  {/* 解析状态提示 */}
                  {isAnalyzing && (
                    <div className="parse-status analyzing">
                      <span className="parse-icon">🔍</span>
                      <span className="parse-text">正在智能分析图片结构...</span>
                    </div>
                  )}
                  
                  {parseResult && !isAnalyzing && (
                    <div className="parse-status success">
                      <span className="parse-icon">✓</span>
                      <span className="parse-text">
                        已识别 {parseResult.modules.length} 个模块（{categoryLabels[parseResult.suggestedCategory]}）
                      </span>
                    </div>
                  )}
                  
                  {parseError && (
                    <div className="parse-status error">
                      <span className="parse-icon">⚠️</span>
                      <span className="parse-text">{parseError}</span>
                    </div>
                  )}
                </div>

                {/* 解析结果预览：显示识别出的模块结构 */}
                {parseResult && !isAnalyzing && (
                  <div className="parse-result-preview">
                    <h4 className="parse-result-title">📋 识别到的模板结构</h4>
                    <div className="module-list">
                      {parseResult.modules.map((module, index) => (
                        <div key={module.id || index} className="module-item">
                          <div className="module-header">
                            <span className="module-type-badge">{getModuleTypeLabel(module.type)}</span>
                            <span className="module-label">{module.label}</span>
                            {module.isRepeatable && (
                              <span className="module-repeatable" title="支持动态添加">➕</span>
                            )}
                          </div>
                          <div className="module-details">
                            {module.textFields.length > 0 && (
                              <span className="module-detail" title={`${module.textFields.length}个文字字段`}>
                                📝 {module.textFields.length}
                              </span>
                            )}
                            {module.imageSlots.length > 0 && (
                              <span className="module-detail" title={`${module.imageSlots.length}个图片坑位`}>
                                🖼️ {module.imageSlots.length}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="parse-hint">
                      💡 结构预览仅为框架示意，可在下一步调整名称和分类
                    </p>
                  </div>
                )}

                {/* 图片上传模式的错误提示 */}
                {submitError && (
                  <div className="error-banner">
                    <span className="error-icon">⚠️</span>
                    <div className="error-content">
                      <p className="error-title">解析失败</p>
                      <p className="error-message">{submitError}</p>
                    </div>
                  </div>
                )}

                <div className="help-section">
                  <h4>图片解析说明</h4>
                  <ol>
                    <li>上传设计稿截图或参考图片</li>
                    <li>系统会根据图片尺寸和特征自动推断模板类型</li>
                    <li>推断结果可在下一步手动调整分类和字段</li>
                    <li>建议上传清晰、完整的设计稿截图以获得最佳效果</li>
                  </ol>
                </div>
              </>
              )}
            </div>
          )}

          {/* 步骤2: 模版配置 */}
          {step === 2 && (
            <div className="form-section">
              {/* 自定义模式提示 */}
              {isCustomMode && (
                <div className="custom-mode-header">
                  <h3>🛠️ 自定义模板构建</h3>
                  <p className="custom-mode-hint">
                    手动添加所需的模块，构建完整的模板结构。完成后填写基本信息即可创建。
                  </p>
                </div>
              )}
              
              <div className="form-group">
                <label className="form-label">
                  模版名称 <span className="required">*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="请输入模版名称"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={50}
                />
              </div>

              <div className="form-group">
                <label className="form-label">分类</label>
                <select
                  className="form-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TemplateCategory)}
                >
                  {allCategories.map(cat => (
                    <option key={cat} value={cat}>
                      {categoryLabels[cat as TemplateCategory] || cat}
                    </option>
                  ))}
                </select>
                {showCategoryInput && (
                  <div className="new-category-input">
                    <input
                      type="text"
                      className="form-input"
                      placeholder="请输入新分类名称"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                    />
                    <button
                      className="btn-primary"
                      onClick={handleAddCustomCategory}
                      disabled={!newCategoryName.trim()}
                    >
                      添加
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => setShowCategoryInput(false)}
                    >
                      取消
                    </button>
                  </div>
                )}
                {/* 显示已添加的自定义分类 */}
                {customCategories.length > 0 && (
                  <div className="custom-category-list">
                    <span className="list-label">自定义分类：</span>
                    {customCategories.map(cat => (
                      <span key={cat} className="custom-category-tag">
                        {cat}
                        <button 
                          className="tag-remove-btn"
                          onClick={() => handleRemoveCustomCategory(cat)}
                          title="删除此分类"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {!showCategoryInput && (
                  <button
                    className="btn-secondary"
                    onClick={() => setShowCategoryInput(true)}
                  >
                    添加新分类
                  </button>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">描述</label>
                <textarea
                  className="form-textarea"
                  placeholder="请输入模版描述"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={200}
                />
              </div>

              <div className="form-group">
                <label className="form-label">标签</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="多个标签用逗号分隔，如：图标,游戏UI,红色"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                />
              </div>

              {/* 非自定义模式：显示参考模板选择 */}
              {!isCustomMode && (
                <>
                  {/* 参考模板选择 — 学习已有模板的框架结构 */}
                  <div className="form-group">
                    <label className="form-label">
                      参考模板 <span className="form-hint-inline">（可选，复用已有模板的字段和图片坑位结构）</span>
                    </label>
                    <select
                      className="form-select"
                      value={referenceTemplateId}
                      onChange={(e) => setReferenceTemplateId(e.target.value)}
                    >
                      <option value="">不使用参考模板（从Figma自动解析）</option>
                      {availableTemplates.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name}（{categoryLabels[t.category] || t.category}，{t.textFields.length}个文字字段，{t.imageSlots.length}个图片坑位）
                        </option>
                      ))}
                    </select>
                    {referenceTemplateId && (
                      <p className="form-success">
                        ✓ 将基于参考模板的框架结构创建新模板，包括所有字段和图片坑位定义
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* 自定义模块构建区域：自定义模式下始终显示，非自定义模式下作为补充选项 */}
              <div className="form-group custom-modules-section">
                <label className="form-label">
                  {isCustomMode ? (
                    <>自定义模块 <span className="required">*</span></>
                  ) : (
                    <>自定义模块 <span className="form-hint-inline">（可选，手动添加标题、描述、列表、图片等模块）</span></>
                  )}
                </label>
                
                {/* 模块添加按钮组 */}
                <div className="module-add-buttons">
                  <button 
                    className="module-add-btn"
                    onClick={handleAddDescriptionModule}
                    title="添加描述模块"
                  >
                    📝 描述
                  </button>
                  <button 
                    className="module-add-btn"
                    onClick={handleAddListItemModule}
                    title="添加列表条目（标题+描述+图片）"
                  >
                    📋 列表条目
                  </button>
                  <button 
                    className="module-add-btn"
                    onClick={handleAddImageGroupModule}
                    title="添加图片组（可动态添加多张图片）"
                  >
                    🖼️ 图片组
                  </button>
                  <button 
                    className="module-add-btn"
                    onClick={handleAddTableModule}
                    title="添加表格（可动态添加行）"
                  >
                    📊 表格
                  </button>
                </div>

                {/* 已添加的自定义模块列表 */}
                {customModules.length > 0 && (
                  <div className="custom-modules-list">
                    <h4 className="modules-list-title">已添加的模块 ({customModules.length})</h4>
                    {customModules.map((module) => (
                      <div 
                        key={module.id} 
                        className={`custom-module-item ${draggedModuleId === module.id ? 'dragging' : ''} ${dragOverModuleId === module.id ? 'drag-over' : ''}`}
                        draggable
                        onDragStart={() => handleDragStart(module.id)}
                        onDragOver={(e) => handleModuleDragOver(e, module.id)}
                        onDragLeave={handleModuleDragLeave}
                        onDrop={() => handleModuleDrop(module.id)}
                        onDragEnd={handleModuleDragEnd}
                      >
                        <div className="module-item-header">
                          <span className="drag-handle" title="拖拽排序">⋮⋮</span>
                          <span className="module-type-badge">{getModuleTypeLabel(module.type)}</span>
                          <span className="module-item-label">{module.label}</span>
                          <button 
                            className="module-remove-btn"
                            onClick={() => handleRemoveModule(module.id)}
                            title="删除此模块"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="module-item-details">
                          {module.textFields.length > 0 && (
                            <span className="detail-badge" title={`${module.textFields.length}个文字字段`}>
                              📝 {module.textFields.length}字段
                            </span>
                          )}
                          {module.imageSlots.length > 0 && (
                            <span className="detail-badge" title={`${module.imageSlots.length}个图片坑位`}>
                              🖼️ {module.imageSlots.length}图片
                            </span>
                          )}
                          {module.isRepeatable && (
                            <span className="detail-badge repeatable" title="支持动态添加">
                              ➕ 可重复
                            </span>
                          )}
                        </div>
                        {/* 图片组模块：显示添加图片坑位按钮 */}
                        {module.type === 'image-group' && (
                          <button 
                            className="module-action-btn"
                            onClick={() => handleAddImageSlot(module.id)}
                          >
                            ➕ 添加图片坑位
                          </button>
                        )}
                        {/* 表格模块：显示添加行按钮 */}
                        {module.type === 'table' && (
                          <button 
                            className="module-action-btn"
                            onClick={() => handleAddTableRow(module.id)}
                          >
                            ➕ 添加表格行
                          </button>
                        )}
                      </div>
                    ))}
                    <button 
                      className="clear-all-btn"
                      onClick={() => setCustomModules([])}
                    >
                      🗑️ 清空所有自定义模块
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {step === 1 && (
            <>
              <button className="btn-secondary" onClick={handleClose}>
                取消
              </button>
              <button
                className="btn-secondary custom-template-btn"
                onClick={() => {
                  // 进入自定义模板模式
                  setIsCustomMode(true);
                  setParseResult(null); // 清空解析结果
                  setStep(2); // 跳转到步骤2
                }}
              >
                🛠️ 自定义模板
              </button>
              <button
                className="btn-primary"
                onClick={handleNextStep}
                disabled={!canProceedStep1}
              >
                下一步
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <button 
                className="btn-secondary" 
                onClick={() => {
                  if (isCustomMode) {
                    // 自定义模式返回步骤1时重置状态
                    setIsCustomMode(false);
                    setCustomModules([]);
                  }
                  setStep(1);
                }}
              >
                上一步
              </button>
              <button
                className="btn-primary"
                onClick={handleSubmit}
                disabled={!name.trim() || isSubmitting || (isCustomMode && customModules.length === 0)}
                title={isCustomMode && customModules.length === 0 ? '请至少添加一个模块' : ''}
              >
                {isSubmitting ? '创建中...' : '创建模版'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateTemplateModal;

// 辅助函数：获取模块类型的显示标签
function getModuleTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    'title': '📌 标题',
    'description': '📝 描述',
    'list': '📋 列表条目',
    'image-group': '🖼️ 图片组',
    'table': '📊 表格',
    'divider': '➖ 分隔线'
  };
  return labels[type] || type;
}