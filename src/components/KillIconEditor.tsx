import React, { useState, useCallback, useEffect } from 'react';
import { TextFieldConfig, ImageSlotConfig, ImageData, TemplateDefinition } from '../types/template';
import ImageUploader from './ImageUploader';
import DocumentPreview from './DocumentPreview';
import DeleteButton from './DeleteButton';
import './KillIconEditor.css';

interface KillIconEditorProps {
  template: TemplateDefinition;
  initialTextValues?: Record<string, string>;
  initialImageValues?: Record<string, ImageData>;
  onSave: (textValues: Record<string, string>, imageValues: Record<string, ImageData>) => void;
  onExport?: (textValues: Record<string, string>, imageValues: Record<string, ImageData>) => void;
  onBack?: () => void;
}

// 模块定义
const MODULES = [
  { id: 'overall', title: '整体印象', color: '#FF6B6B' },
  { id: 'badge', title: '徽章', color: '#4ECDC4' },
  { id: 'border', title: '边框', color: '#95E1D3' },
  { id: 'kill-mark', title: '击杀印记', color: '#DDA0DD' },
  { id: 'colorful', title: '炫彩', color: '#98D8C8' },
  { id: 'reference', title: '已有击杀图标精度参考', color: '#F7DC6F' },
  { id: 'interface', title: '界面效果图', color: '#85C1E9' },
  { id: 'icon', title: '图标效果图', color: '#A78BFA' }
];

export const KillIconEditor: React.FC<KillIconEditorProps> = ({
  template,
  initialTextValues = {},
  initialImageValues = {},
  onSave,
  onExport,
  onBack
}) => {
  // 文字值状态
  const [textValues, setTextValues] = useState<Record<string, string>>(() => {
    const values: Record<string, string> = {};
    template.textFields.forEach(field => {
      values[field.id] = initialTextValues[field.id] ?? field.defaultValue;
    });
    return values;
  });

  // 图片值状态：优先用传入值，其次用坑位的 defaultImage 自动预填充
  const [imageValues, setImageValues] = useState<Record<string, ImageData>>(() => {
    const values: Record<string, ImageData> = { ...initialImageValues };
    template.imageSlots.forEach(slot => {
      // 若该坑位没有传入值，且配置了默认图片，则自动预填充
      if (!values[slot.id] && slot.defaultImage) {
        values[slot.id] = {
          id: `default-${slot.id}`,
          slotId: slot.id,
          file: null,         // 默认图片无本地文件
          preview: slot.defaultImage,
          scale: 1
        };
      }
    });
    return values;
  });
  
  // 监听初始值变化（例如切换历史记录时）
  useEffect(() => {
    setTextValues(prev => {
      const values: Record<string, string> = {};
      template.textFields.forEach(field => {
        values[field.id] = initialTextValues[field.id] ?? field.defaultValue;
      });
      return values;
    });
  }, [initialTextValues, template.textFields]);

  useEffect(() => {
    setImageValues(prev => {
      const values: Record<string, ImageData> = { ...initialImageValues };
      template.imageSlots.forEach(slot => {
        if (!values[slot.id] && slot.defaultImage) {
          values[slot.id] = {
            id: `default-${slot.id}`,
            slotId: slot.id,
            file: null,
            preview: slot.defaultImage,
            scale: 1
          };
        }
      });
      return values;
    });
  }, [initialImageValues, template.imageSlots]);

  // 预览状态
  const [showPreview, setShowPreview] = useState(false);
  
  // 选中的图片坑位ID（用于粘贴功能）
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  // 整体印象额外条目（动态添加）
  const [extraImpressionItems, setExtraImpressionItems] = useState<number[]>([]);
  
  // 条目标题编辑状态：记录哪些字段正在编辑中
  const [editingFields, setEditingFields] = useState<Set<string>>(new Set());

  // 添加整体印象条目
  const addImpressionItem = useCallback(() => {
    setExtraImpressionItems(prev => [...prev, Date.now()]);
  }, []);

  // 删除整体印象条目
  const removeImpressionItem = useCallback((itemId: number) => {
    setExtraImpressionItems(prev => prev.filter(id => id !== itemId));
    // 清理对应的文字值
    setTextValues(prev => {
      const newValues = { ...prev };
      delete newValues[`extra-impression-${itemId}`];
      return newValues;
    });
  }, []);

  // 切换字段编辑状态
  const toggleFieldEdit = useCallback((fieldId: string) => {
    setEditingFields(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fieldId)) {
        newSet.delete(fieldId);
      } else {
        newSet.add(fieldId);
      }
      return newSet;
    });
  }, []);

  // 更新文字值
  const handleTextChange = useCallback((fieldId: string, value: string) => {
    setTextValues(prev => ({ ...prev, [fieldId]: value }));
  }, []);

  // 更新图片值
  const handleImageChange = useCallback((slotId: string, data: ImageData | null) => {
    setImageValues(prev => {
      const newValues = { ...prev };
      if (data) {
        newValues[slotId] = data;
      } else {
        delete newValues[slotId];
      }
      return newValues;
    });
  }, []);

  // 全局粘贴事件监听
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      console.log('粘贴事件触发，当前选中:', selectedSlotId);
      
      if (!selectedSlotId) {
        console.log('未选中任何图片坑位');
        return;
      }
      
      const items = e.clipboardData?.items;
      if (!items) {
        console.log('剪贴板无内容');
        return;
      }
      
      console.log('剪贴板项目数量:', items.length);
      
      for (const item of items) {
        console.log('检查剪贴板项目类型:', item.type);
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          console.log('找到图片文件:', file?.name, file?.type);
          
          if (file) {
            // 将剪贴板图片转换为ImageData
            const reader = new FileReader();
            reader.onload = (event) => {
              const result = event.target?.result as string;
              if (result) {
                console.log('图片读取成功，准备更新到坑位:', selectedSlotId);
                
                // 获取图片实际尺寸
                const img = new Image();
                img.src = result;
                img.onload = () => {
                  const imageData: ImageData = {
                    id: `img-${Date.now()}`,
                    slotId: selectedSlotId,
                    file: file,
                    preview: result,
                    scale: 1,
                    actualWidth: img.width,
                    actualHeight: img.height
                  };
                  handleImageChange(selectedSlotId, imageData);
                  console.log('图片已粘贴到坑位:', selectedSlotId, '尺寸:', img.width, 'x', img.height);
                };
              }
            };
            reader.onerror = () => {
              console.error('图片读取失败');
            };
            reader.readAsDataURL(file);
          }
          break;
        }
      }
    };

    console.log('注册全局粘贴事件监听器');
    document.addEventListener('paste', handlePaste);
    return () => {
      console.log('移除全局粘贴事件监听器');
      document.removeEventListener('paste', handlePaste);
    };
  }, [selectedSlotId, handleImageChange]);

  // 获取模块对应的字段
  const getFieldsForModule = (moduleId: string) => {
    return template.textFields.filter(f => f.id.startsWith(moduleId));
  };

  // 获取模块对应的图片坑位
  const getImageSlotsForModule = (moduleId: string) => {
    return template.imageSlots.filter(s => s.id.startsWith(moduleId));
  };

  // 渲染模块
  const renderModule = (module: typeof MODULES[0]) => {
    const fields = getFieldsForModule(module.id);
    const imageSlots = getImageSlotsForModule(module.id);

    return (
      <div key={module.id} id={module.id} className="module-section">
        <div className="module-header" style={{ borderLeftColor: module.color }}>
          <span className="module-icon">📋</span>
          <h3 className="module-title">{module.title}</h3>
        </div>
        
        <div className="module-content">
          {/* 文字字段 */}
          {fields.map(field => (
            <div key={field.id} className="text-field-wrapper">
              <label className="field-label">{field.label}</label>
              <input
                type="text"
                className="field-input"
                value={textValues[field.id] || ''}
                onChange={(e) => handleTextChange(field.id, e.target.value)}
                placeholder={field.placeholder}
              />
            </div>
          ))}
          
          {/* 整体印象模块：额外条目 */}
          {module.id === 'overall' && extraImpressionItems.map(itemId => (
            <div key={itemId} className="text-field-wrapper extra-item">
              <label className="field-label">整体印象-要点</label>
              <input
                type="text"
                className="field-input"
                value={textValues[`extra-impression-${itemId}`] || ''}
                onChange={(e) => handleTextChange(`extra-impression-${itemId}`, e.target.value)}
                placeholder="请输入要点内容"
              />
              <DeleteButton
                onClick={() => removeImpressionItem(itemId)}
                title="删除此条目"
                position="rightMiddle"
                size="small"
              />
            </div>
          ))}
          
          {/* 整体印象模块：添加按钮 */}
          {module.id === 'overall' && (
            <div className="list-table-add-entry-btn" onClick={addImpressionItem}>
              <span className="add-icon">+</span>
              <span className="add-text">添加条目</span>
            </div>
          )}
          
          {/* 图片坑位 - 4个一组 */}
          {imageSlots.length > 0 && (
            <div className="image-slots-grid">
              {imageSlots.map(slot => (
                <ImageUploader
                  key={slot.id}
                  slot={slot}
                  value={imageValues[slot.id] || null}
                  onChange={(data) => handleImageChange(slot.id, data)}
                  isSelected={selectedSlotId === slot.id}
                  onSelect={() => setSelectedSlotId(slot.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // 保存
  const handleSave = useCallback(() => {
    onSave(textValues, imageValues);
  }, [textValues, imageValues, onSave]);

  // 导出
  const handleExport = useCallback(() => {
    onExport?.(textValues, imageValues);
  }, [textValues, imageValues, onExport]);

  // 处理导航点击
  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="kill-icon-editor">
      {/* 头部 */}
      <div className="editor-header">
        <div className="header-left">
          {onBack && (
            <button className="btn-back-inline" onClick={onBack}>
              ← 返回
            </button>
          )}
          <div className="template-badge">
            <span className="badge-icon">🎯</span>
            <span className="badge-text">{template.name}</span>
          </div>
          {/* 实时显示用户输入的版本信息，fallback 到模板默认版本 */}
          <div className="version-tag">{textValues['version-info'] || template.version}</div>
          {selectedSlotId && (
            <div className="selected-slot-badge">
              📋 已选中: {template.imageSlots.find(s => s.id === selectedSlotId)?.label || selectedSlotId}
              <span className="paste-hint-inline">可粘贴图片</span>
            </div>
          )}
        </div>
        <div className="header-actions">
          <button className="btn-save" onClick={handleSave}>
            💾 保存草稿
          </button>
          <button className="btn-preview" onClick={() => setShowPreview(true)}>
            👁️ 预览文档
          </button>
          <button className="btn-export" onClick={handleExport}>
            📤 生成发包文档
          </button>
        </div>
      </div>

      {/* 主内容 */}
      <div className="editor-main">
        {/* 左侧导航 */}
        <div className="sidebar-nav">
          {MODULES.map(module => (
            <a
              key={module.id}
              href={`#${module.id}`}
              onClick={(e) => handleNavClick(e, module.id)}
              className="nav-item"
              style={{ borderLeftColor: module.color }}
            >
              {module.title}
            </a>
          ))}
        </div>

        {/* 编辑区域 */}
        <div className="editor-content">
          {/* 基础信息输入 */}
          <div className="basic-info-section">
            <div className="basic-info-row">
              <div className="basic-info-field">
                <label className="field-label">主题名称</label>
                <input
                  type="text"
                  className="field-input theme-name-input"
                  value={textValues['theme-name'] || ''}
                  onChange={(e) => handleTextChange('theme-name', e.target.value)}
                  placeholder="请输入主题名称"
                />
              </div>
              <div className="basic-info-field">
                <label className="field-label">版本信息</label>
                <input
                  type="text"
                  className="field-input version-input"
                  value={textValues['version-info'] || ''}
                  onChange={(e) => handleTextChange('version-info', e.target.value)}
                  placeholder="V / 2025.10.09"
                />
              </div>
            </div>
          </div>

          {/* 模块列表 */}
          {MODULES.map(renderModule)}

          {/* 附录 */}
          <div className="appendix-section">
            <div className="appendix-header">
              <span className="appendix-icon">⚠️</span>
              <h3>附录 - 合规性要求</h3>
            </div>
            <div className="appendix-content">
              <p>设计要求遵守合规性与底线，需要对有风险的元素内容进行排查。</p>
              <p>包括但不限于：地缘政治、敏感历史、不良导向、性别种族歧视、血腥暴力、恐怖、涉外、违禁、抄袭等内容。</p>
              <p className="warning-text">常见如下图涉及地图/宗教符号/空白元素/血腥暴力的元素规避使用</p>
            </div>
          </div>
        </div>
      </div>

      {/* 预览模态框 */}
      {showPreview && (
        <DocumentPreview
          template={template}
          textValues={textValues}
          imageValues={imageValues}
          onClose={() => setShowPreview(false)}
          isModal={true}
        />
      )}
    </div>
  );
};

export default KillIconEditor;