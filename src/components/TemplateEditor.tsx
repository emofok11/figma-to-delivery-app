import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { TemplateDefinition, ImageData, ContainerPart } from '../types/template';
import { generateDynamicSkill } from '../lib/templateSkills';
import { isFieldVisible } from '../lib/templateUtils'; // 引入公共过滤函数
import { templateRegistry } from '../lib/templateRegistry'; // 用于同步容器变更到注册中心
import { createDescriptionPart, createListItemPart, createImageGroupPart, createTablePart } from '../lib/containerParts';
import ImageUploader from './ImageUploader';
import DocumentPreview from './DocumentPreview';
import DeleteButton from './DeleteButton';
import './TemplateEditor.css';

interface TemplateEditorProps {
  template: TemplateDefinition;
  initialTextValues?: Record<string, string>;
  initialImageValues?: Record<string, ImageData>;
  onSave: (textValues: Record<string, string>, imageValues: Record<string, ImageData>) => void;
  onExport?: (textValues: Record<string, string>, imageValues: Record<string, ImageData>) => void;
  onBack?: () => void;
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({
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
    // 恢复动态添加的条目（extra-impression-* 和 extra-desc-*）
    Object.keys(initialTextValues).forEach(key => {
      if (key.startsWith('extra-impression-') || key.startsWith('extra-desc-')) {
        values[key] = initialTextValues[key];
      }
    });
    // 恢复自定义 list 容器的动态条目字段（如 custom-list-xxx-title-2、custom-list-xxx-desc-2）
    const listContainerIds = (template.containers || []).filter(c => c.type === 'list').map(c => c.id);
    Object.keys(initialTextValues).forEach(key => {
      if (values[key] !== undefined) return; // 已恢复的跳过
      const isListEntryField = listContainerIds.some(cid => {
        const prefix = cid === 'specific' ? 'specific-item' : cid;
        return key.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(title|desc)-\\d+$`));
      });
      if (isListEntryField) {
        values[key] = initialTextValues[key];
      }
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
          file: null,           // 默认图片无本地文件
          preview: slot.defaultImage,
          scale: 1
        };
      }
    });
    return values;
  });

  // 监听初始值变化（例如切换历史记录时）
  // 只有当 initialTextValues 有实际内容时才重置，避免空对象触发重置
  useEffect(() => {
    // 检查是否有实际内容
    const hasInitialValues = Object.keys(initialTextValues).length > 0;
    if (!hasInitialValues) return;
    
    setTextValues(_prev => {
      const values: Record<string, string> = {};
      template.textFields.forEach(field => {
        values[field.id] = initialTextValues[field.id] ?? field.defaultValue;
      });
      // 恢复动态添加的条目
      Object.keys(initialTextValues).forEach(key => {
        if (key.startsWith('extra-impression-') || key.startsWith('extra-desc-')) {
          values[key] = initialTextValues[key];
        }
      });
      // 恢复自定义 list 容器的动态条目字段
      const listContainerIds = (template.containers || []).filter(c => c.type === 'list').map(c => c.id);
      Object.keys(initialTextValues).forEach(key => {
        if (values[key] !== undefined) return;
        const isListEntryField = listContainerIds.some(cid => {
          const prefix = cid === 'specific' ? 'specific-item' : cid;
          return key.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(title|desc)-\\d+$`));
        });
        if (isListEntryField) {
          values[key] = initialTextValues[key];
        }
      });
      return values;
    });

    // 同步恢复 extraDescItems 状态（只要 key 存在就恢复，不要求内容非空）
    const restored: Record<string, number[]> = {};
    Object.keys(initialTextValues).forEach(key => {
      const impressionMatch = key.match(/^extra-impression-(\d+)$/);
      if (impressionMatch && initialTextValues[key] !== undefined) {
        if (!restored['overall']) restored['overall'] = [];
        restored['overall'].push(parseInt(impressionMatch[1], 10));
      }
      const descMatch = key.match(/^extra-desc-(.+)-(\d+)$/);
      if (descMatch && initialTextValues[key] !== undefined) {
        const moduleId = descMatch[1];
        if (!restored[moduleId]) restored[moduleId] = [];
        restored[moduleId].push(parseInt(descMatch[2], 10));
      }
    });
    setExtraDescItems(restored);
  }, [initialTextValues, template.textFields]);

  useEffect(() => {
    // 检查是否有实际内容
    const hasInitialValues = Object.keys(initialImageValues).length > 0;
    if (!hasInitialValues) return;
    
    setImageValues(_prev => {
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

  // ===== 容器拖动排序状态 =====
  // 本地容器顺序（仅当模板有 containers 时生效）
  const [localContainers, setLocalContainers] = useState<ContainerPart[]>(() => template.containers || []);
  const [draggedModuleId, setDraggedModuleId] = useState<string | null>(null);
  const [dragOverModuleId, setDragOverModuleId] = useState<string | null>(null);
const [showAddMenu, setShowAddMenu] = useState(false); // 添加容器下拉菜单
  const [editingNavId, setEditingNavId] = useState<string | null>(null); // 当前正在编辑标题的导航页签ID
  const [editingHeaderField, setEditingHeaderField] = useState<'name' | 'version' | null>(null); // 当前正在编辑的头部字段（模板名称/版本号）
  const [localTemplateName, setLocalTemplateName] = useState(template.name); // 本地模板名称
  const [localTemplateVersion, setLocalTemplateVersion] = useState(template.version); // 本地模板版本号
  const [localFieldLabels, setLocalFieldLabels] = useState<Record<string, string>>(() => {
    // 从 containers 中恢复 table/image-group 容器的图片坑位自定义标题
    const labels: Record<string, string> = {};
    if (template.containers) {
      template.containers.forEach(container => {
        if (container.type === 'table' || container.type === 'image-group') {
          container.imageSlots.forEach(slot => {
            // 检查 label 是否为默认格式，若不是则视为自定义标题
            // 匹配：'xxx-参考图N'（table）、'xxx参考图N'（image-group，无分隔符）、'需求条目N-参考图'（list）
            const defaultPattern = /^.+[-]?参考图\s*\d*(\s*\(\d+\))?$/;
            if (slot.label && !defaultPattern.test(slot.label)) {
              labels[slot.id] = slot.label;
            }
          });
        }
      });
    }
    return labels;
  }); // 字段小标题覆盖映射（含图片坑位自定义标题）
  const navClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // 单击/双击检测定时器
  const addContainerRef = useRef<HTMLDivElement>(null); // 添加容器区域ref

  // 点击空白区域关闭添加容器菜单
  useEffect(() => {
    if (!showAddMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (addContainerRef.current && !addContainerRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAddMenu]);

  // 同步模板的 containers 到本地状态
  useEffect(() => {
    if (template.containers) {
      setLocalContainers(template.containers);
    }
  }, [template.containers]);

  // 是否支持容器编辑（仅自定义模板且有 containers 字段）
  const canEditContainers = template.containers !== undefined;

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
    e.preventDefault();
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

    setLocalContainers(prev => {
      const newModules = [...prev];
      const draggedIndex = newModules.findIndex(m => m.id === draggedModuleId);
      const targetIndex = newModules.findIndex(m => m.id === targetModuleId);

      if (draggedIndex !== -1 && targetIndex !== -1) {
        const [draggedModule] = newModules.splice(draggedIndex, 1);
        newModules.splice(targetIndex, 0, draggedModule);
      }
      return newModules;
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
   * 添加描述模块
   */
  const handleAddDescriptionModule = useCallback(() => {
    const descModule = createDescriptionPart({
      id: `custom-desc-${Date.now()}`,
      label: '自定义描述'
    });
    // 同步更新 textValues 默认值
    descModule.textFields.forEach(f => {
      setTextValues(prev => ({ ...prev, [f.id]: f.defaultValue || '' }));
    });
    setLocalContainers(prev => [...prev, descModule]);
    setShowAddMenu(false);
  }, []);

  /**
   * 添加列表条目模块
   */
  const handleAddListItemModule = useCallback(() => {
    const index = localContainers.filter(m => m.type === 'list').length + 1;
    const containerId = `custom-list-${Date.now()}`;
    // 使用容器 ID 作为字段前缀，确保每个 list 容器的字段 ID 唯一
    const listModule = createListItemPart(1, { idPrefix: containerId });
    listModule.id = containerId;
    listModule.label = `自定义条目${index}`;
    // 同步更新 textValues 默认值
    listModule.textFields.forEach(f => {
      setTextValues(prev => ({ ...prev, [f.id]: f.defaultValue || '' }));
    });
    // 初始化该容器的条目计数
    setListEntryCounts(prev => ({ ...prev, [containerId]: 1 }));
    setLocalContainers(prev => [...prev, listModule]);
    setShowAddMenu(false);
  }, [localContainers]);

  /**
   * 添加图片组模块
   */
  const handleAddImageGroupModule = useCallback(() => {
    const imgModule = createImageGroupPart({
      id: `custom-img-${Date.now()}`,
      label: '自定义参考图',
      count: 1
    });
    // 同步更新 imageSlots 默认值
    imgModule.imageSlots.forEach(s => {
      setImageValues(prev => ({ ...prev, [s.id]: null as any }));
    });
    setLocalContainers(prev => [...prev, imgModule]);
    setShowAddMenu(false);
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
    // 同步更新 textValues 默认值
    tableModule.textFields.forEach(f => {
      setTextValues(prev => ({ ...prev, [f.id]: f.defaultValue || '' }));
    });
    setLocalContainers(prev => [...prev, tableModule]);
    setShowAddMenu(false);
  }, []);

  /**
   * 删除自定义模块
   */
  const handleRemoveModule = useCallback((moduleId: string) => {
    // 清理该模块的字段值
    const module = localContainers.find(m => m.id === moduleId);
    if (module) {
      module.textFields.forEach(f => {
        setTextValues(prev => {
          const newValues = { ...prev };
          delete newValues[f.id];
          return newValues;
        });
      });
      module.imageSlots.forEach(s => {
        setImageValues(prev => {
          const newValues = { ...prev };
          delete newValues[s.id];
          return newValues;
        });
      });
    }
    setLocalContainers(prev => prev.filter(m => m.id !== moduleId));
  }, [localContainers]);

  /**
   * 修改自定义容器的标题（label）
   */
  const handleContainerLabelChange = useCallback((moduleId: string, newLabel: string) => {
    setLocalContainers(prev => prev.map(c =>
      c.id === moduleId ? { ...c, label: newLabel } : c
    ));
  }, []);

  /**
   * 修改字段小标题（仅自定义容器内的字段）
   */
  const handleFieldLabelChange = useCallback((fieldId: string, newLabel: string) => {
    setLocalFieldLabels(prev => ({ ...prev, [fieldId]: newLabel }));
  }, []);

  // 更新文字值
  const handleTextChange = useCallback((fieldId: string, value: string) => {
    setTextValues(prev => ({
      ...prev,
      [fieldId]: value
    }));
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

  // ===== 列表表格动态条目管理 =====
  
  /**
   * 获取 list 容器的字段 ID 前缀
   * - 旧模板的 'specific' 模块 → 'specific-item'
   * - 自定义模板的 list 容器 → 容器 ID 本身（如 'custom-list-1234567890'）
   */
  const getListFieldPrefix = useCallback((moduleId: string): string => {
    return moduleId === 'specific' ? 'specific-item' : moduleId;
  }, []);

  // 条目数量状态：每个 list 容器独立计数（key 为容器 ID）
  const [listEntryCounts, setListEntryCounts] = useState<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    
    // 旧模板（list-table 类型）：从初始值中检测已有条目数
    if (template.category === 'list-table') {
      let maxIndex = 0;
      Object.keys(initialTextValues).forEach(key => {
        if (key.startsWith('specific-item-title-') || key.startsWith('specific-item-desc-')) {
          const match = key.match(/-(\d+)$/);
          // 只要 key 存在就计入（即使值为空），确保空条目也能恢复
          if (match) {
            maxIndex = Math.max(maxIndex, parseInt(match[1], 10));
          }
        }
      });
      Object.keys(initialImageValues).forEach(key => {
        if (key.startsWith('specific-item-img-')) {
          const match = key.match(/-(\d+)$/);
          if (match && initialImageValues[key]?.preview) {
            maxIndex = Math.max(maxIndex, parseInt(match[1], 10));
          }
        }
      });
      counts['specific'] = maxIndex === 0 ? 1 : maxIndex;
    }
    
    // 自定义模板：从 containers 中初始化每个 list 容器的条目计数
    const containers = template.containers || [];
    containers.forEach(c => {
      if (c.type === 'list' && c.id !== 'specific') {
        const prefix = c.id;
        let maxIndex = 0;
        Object.keys(initialTextValues).forEach(key => {
          if (key.startsWith(`${prefix}-title-`) || key.startsWith(`${prefix}-desc-`)) {
            const match = key.match(/-(\d+)$/);
            // 只要 key 存在就计入（即使值为空），确保空条目也能恢复
            if (match) {
              maxIndex = Math.max(maxIndex, parseInt(match[1], 10));
            }
          }
        });
        Object.keys(initialImageValues).forEach(key => {
          if (key.startsWith(`${prefix}-img-`)) {
            const match = key.match(/-(\d+)$/);
            if (match && initialImageValues[key]?.preview) {
              maxIndex = Math.max(maxIndex, parseInt(match[1], 10));
            }
          }
        });
        counts[c.id] = maxIndex === 0 ? 1 : maxIndex;
      }
    });
    
    return counts;
  });

  // extraImages: 每条需求条目的额外图片列表（key 为原始 slot.id，value 为额外图片数组）
  const [extraImages, setExtraImages] = useState<Record<string, ImageData[]>>({});

  // 监听初始值变化，重新恢复 listEntryCounts（切换历史记录时触发）
  useEffect(() => {
    const hasInitialValues = Object.keys(initialTextValues).length > 0 || Object.keys(initialImageValues).length > 0;
    if (!hasInitialValues) return;

    const counts: Record<string, number> = {};

    // 旧模板（list-table 类型）
    if (template.category === 'list-table') {
      let maxIndex = 0;
      Object.keys(initialTextValues).forEach(key => {
        if (key.startsWith('specific-item-title-') || key.startsWith('specific-item-desc-')) {
          const match = key.match(/-(\d+)$/);
          // 只要 key 存在就计入（即使值为空），确保空条目也能恢复
          if (match) {
            maxIndex = Math.max(maxIndex, parseInt(match[1], 10));
          }
        }
      });
      Object.keys(initialImageValues).forEach(key => {
        if (key.startsWith('specific-item-img-')) {
          const match = key.match(/-(\d+)$/);
          if (match && initialImageValues[key]?.preview) {
            maxIndex = Math.max(maxIndex, parseInt(match[1], 10));
          }
        }
      });
      counts['specific'] = maxIndex === 0 ? 1 : maxIndex;
    }

    // 自定义模板：从 containers 中恢复每个 list 容器的条目计数
    const containers = template.containers || [];
    containers.forEach(c => {
      if (c.type === 'list' && c.id !== 'specific') {
        const prefix = c.id;
        let maxIndex = 0;
        Object.keys(initialTextValues).forEach(key => {
          if (key.startsWith(`${prefix}-title-`) || key.startsWith(`${prefix}-desc-`)) {
            const match = key.match(/-(\d+)$/);
            // 只要 key 存在就计入（即使值为空），确保空条目也能恢复
            if (match) {
              maxIndex = Math.max(maxIndex, parseInt(match[1], 10));
            }
          }
        });
        Object.keys(initialImageValues).forEach(key => {
          if (key.startsWith(`${prefix}-img-`)) {
            const match = key.match(/-(\d+)$/);
            if (match && initialImageValues[key]?.preview) {
              maxIndex = Math.max(maxIndex, parseInt(match[1], 10));
            }
          }
        });
        counts[c.id] = maxIndex === 0 ? 1 : maxIndex;
      }
    });

    setListEntryCounts(counts);
  }, [initialTextValues, initialImageValues, template.category, template.containers]);

  // 检查某个条目是否有任意内容（标题、描述或图片）
  const hasEntryContent = useCallback((moduleId: string, entryIndex: number): boolean => {
    const prefix = moduleId === 'specific' ? 'specific-item' : moduleId;
    const titleId = `${prefix}-title-${entryIndex}`;
    const descId = `${prefix}-desc-${entryIndex}`;
    const imgId = `${prefix}-img-${entryIndex}`;
    
    const hasTitle = textValues[titleId]?.trim();
    const hasDesc = textValues[descId]?.trim();
    const hasImg = imageValues[imgId]?.preview;
    
    return !!(hasTitle || hasDesc || hasImg);
  }, [textValues, imageValues]);

  // 监听内容变化，自动新增条目（对所有 list 容器生效）
  useEffect(() => {
    // 收集所有 list 容器的 moduleId
    const listModuleIds: string[] = [];
    if (template.category === 'list-table') {
      listModuleIds.push('specific');
    }
    // 自定义模板的 list 容器
    localContainers.forEach(c => {
      if (c.type === 'list' && c.id !== 'specific') {
        listModuleIds.push(c.id);
      }
    });
    
    if (listModuleIds.length === 0) return;
    
    setListEntryCounts(prev => {
      const newCounts = { ...prev };
      let changed = false;
      
      listModuleIds.forEach(moduleId => {
        const count = newCounts[moduleId] || 1;
        let allHaveContent = true;
        for (let i = 0; i < count; i++) {
          if (!hasEntryContent(moduleId, i)) {
            allHaveContent = false;
            break;
          }
        }
        if (allHaveContent && count < 20) {
          newCounts[moduleId] = count + 1;
          changed = true;
        }
      });
      
      return changed ? newCounts : prev;
    });
  }, [template.category, textValues, imageValues, hasEntryContent, localContainers]);

  // 手动添加新条目（指定容器）
  const handleAddListEntry = useCallback((moduleId: string) => {
    const count = listEntryCounts[moduleId] || 1;
    if (count < 20) {
      const newCount = count + 1;
      setListEntryCounts(prev => ({ ...prev, [moduleId]: newCount }));
      // 在 textValues 中为新条目创建空 key，确保保存时能持久化条目数量
      const prefix = moduleId === 'specific' ? 'specific-item' : moduleId;
      setTextValues(prev => ({
        ...prev,
        [`${prefix}-title-${newCount}`]: prev[`${prefix}-title-${newCount}`] ?? '',
        [`${prefix}-desc-${newCount}`]: prev[`${prefix}-desc-${newCount}`] ?? ''
      }));
    }
  }, [listEntryCounts]);

  // 删除指定条目（重新排列后续条目，指定容器）
  const handleDeleteListEntry = useCallback((moduleId: string, entryIndex: number) => {
    const count = listEntryCounts[moduleId] || 1;
    // 至少保留一条（由 UI 层控制按钮显示/隐藏，此处做兜底保护）
    if (count <= 1) return;
    
    const prefix = moduleId === 'specific' ? 'specific-item' : moduleId;
    
    // 删除该条目的所有数据
    const titleId = `${prefix}-title-${entryIndex}`;
    const descId = `${prefix}-desc-${entryIndex}`;
    const imgId = `${prefix}-img-${entryIndex}`;
    
    // 清理文字值和图片值
    setTextValues(prev => {
      const newValues = { ...prev };
      delete newValues[titleId];
      delete newValues[descId];
      return newValues;
    });
    
    setImageValues(prev => {
      const newValues = { ...prev };
      delete newValues[imgId];
      // 删除额外图片
      Object.keys(newValues).forEach(key => {
        if (key.startsWith(`${imgId}-extra-`)) {
          delete newValues[key];
        }
      });
      return newValues;
    });
    
    // 清理额外图片状态
    setExtraImages(prev => {
      const newExtras = { ...prev };
      delete newExtras[imgId];
      return newExtras;
    });
    
    // 将后续条目的数据向前移动
    for (let i = entryIndex + 1; i <= count; i++) {
      const oldTitleId = `${prefix}-title-${i}`;
      const oldDescId = `${prefix}-desc-${i}`;
      const oldImgId = `${prefix}-img-${i}`;
      const newTitleId = `${prefix}-title-${i - 1}`;
      const newDescId = `${prefix}-desc-${i - 1}`;
      const newImgId = `${prefix}-img-${i - 1}`;
      
      // 移动文字值
      setTextValues(prev => {
        const newValues = { ...prev };
        if (prev[oldTitleId] !== undefined) {
          newValues[newTitleId] = prev[oldTitleId];
          delete newValues[oldTitleId];
        }
        if (prev[oldDescId] !== undefined) {
          newValues[newDescId] = prev[oldDescId];
          delete newValues[oldDescId];
        }
        return newValues;
      });
      
      // 移动图片值
      setImageValues(prev => {
        const newValues = { ...prev };
        if (prev[oldImgId] !== undefined) {
          newValues[newImgId] = prev[oldImgId];
          delete newValues[oldImgId];
        }
        // 移动额外图片
        const oldExtraKeys = Object.keys(prev).filter(k => k.startsWith(`${oldImgId}-extra-`));
        oldExtraKeys.forEach(oldKey => {
          const extraIdx = oldKey.split('-extra-')[1];
          const newKey = `${newImgId}-extra-${extraIdx}`;
          newValues[newKey] = prev[oldKey];
          delete newValues[oldKey];
        });
        return newValues;
      });
      
      // 移动额外图片状态
      setExtraImages(prev => {
        const newExtras = { ...prev };
        if (prev[oldImgId]) {
          newExtras[newImgId] = prev[oldImgId];
          delete newExtras[oldImgId];
        }
        return newExtras;
      });
    }
    
    // 减少条目数量
    setListEntryCounts(prev => ({ ...prev, [moduleId]: Math.max(1, (prev[moduleId] || 1) - 1) }));
  }, [listEntryCounts]);

  // 处理列表表格中某条需求的某个图片变更（含自动追加逻辑）
  // 使用函数式更新，避免依赖 extraImages 状态
  const handleListImageChange = useCallback((slotId: string, extraIndex: number | null, data: ImageData | null) => {
    console.log('handleListImageChange 被调用', { slotId, extraIndex, hasData: !!data });
    
    if (extraIndex === null) {
      // 修改的是原始坑位（第一张图）
      handleImageChange(slotId, data);
      // 如果是新上传图片且当前没有额外图片容器，自动追加一个空容器
      if (data) {
        setExtraImages(prev => {
          if (!prev[slotId] || prev[slotId].length === 0) {
            return {
              ...prev,
              [slotId]: [{ id: '', slotId: `${slotId}-extra-0`, file: null, preview: '', scale: 1 }]
            };
          }
          return prev;
        });
      }
    } else {
      // 修改的是额外图片容器
      setExtraImages(prev => {
        const list = [...(prev[slotId] || [])];
        if (data) {
          list[extraIndex] = data;
          // 如果填充的是最后一个容器，自动追加新的空容器
          if (extraIndex === list.length - 1) {
            list.push({ id: '', slotId: `${slotId}-extra-${list.length}`, file: null, preview: '', scale: 1 });
          }
        } else {
          // 删除该图片，移除该容器
          list.splice(extraIndex, 1);
        }
        return { ...prev, [slotId]: list };
      });
    }
  }, [handleImageChange]);

  // 手动添加一个空图片容器（点击"+"按钮）
  const handleAddImageSlot = useCallback((slotId: string) => {
    setExtraImages(prev => {
      const list = [...(prev[slotId] || [])];
      list.push({ id: '', slotId: `${slotId}-extra-${list.length}`, file: null, preview: '', scale: 1 });
      return { ...prev, [slotId]: list };
    });
  }, []);

  // 删除主图片坑位（将第一个额外图片提升为主图片）
  const handleDeletePrimaryImageSlot = useCallback((slotId: string) => {
    setExtraImages(prev => {
      const list = [...(prev[slotId] || [])];
      if (list.length === 0) return prev; // 没有额外图片时不允许删除主图片
      const firstExtra = list.shift()!; // 取出第一个额外图片
      // 将第一个额外图片的数据提升为主图片
      setImageValues(prevVals => {
        const newVals = { ...prevVals };
        if (firstExtra.preview) {
          newVals[slotId] = firstExtra;
        } else {
          delete newVals[slotId]; // 额外图片为空则清除主图片
        }
        return newVals;
      });
      // 重新编号剩余额外图片
      const renumberedList = list.map((img, idx) => ({
        ...img,
        slotId: `${slotId}-extra-${idx}`
      }));
      return { ...prev, [slotId]: renumberedList };
    });
  }, []);

  // 删除额外图片容器
  const handleDeleteImageSlot = useCallback((slotId: string, extraIndex: number) => {
    setExtraImages(prev => {
      const list = [...(prev[slotId] || [])];
      // 移除指定索引的容器
      list.splice(extraIndex, 1);
      // 重新编号剩余容器的slotId
      const renumberedList = list.map((img, idx) => ({
        ...img,
        slotId: `${slotId}-extra-${idx}`
      }));
      return { ...prev, [slotId]: renumberedList };
    });
  }, []);

  // 删除自定义参考图模块的图片坑位
  const handleDeleteImageSlotFromModule = useCallback((moduleId: string, slotId: string) => {
    // 从localContainers中移除该图片坑位（至少保留1个，由 UI 层控制按钮显示，此处兜底保护）
    setLocalContainers(prev => prev.map(container => {
      if (container.id !== moduleId) return container;
      if (container.imageSlots.length <= 1) return container; // 兜底：至少保留1个
      return {
        ...container,
        imageSlots: container.imageSlots.filter(s => s.id !== slotId)
      };
    }));
    // 清理该图片的值
    setImageValues(prev => {
      const newValues = { ...prev };
      delete newValues[slotId];
      return newValues;
    });
  }, []);

  // 添加图片坑位到模块（支持 image-group 和 table 类型容器）
  const handleAddImageSlotToModule = useCallback((moduleId: string) => {
    setLocalContainers(prev => prev.map(container => {
      if (container.id !== moduleId || (container.type !== 'image-group' && container.type !== 'table')) return container;
      const newIndex = container.imageSlots.length;
      return {
        ...container,
        imageSlots: [
          ...container.imageSlots,
          {
            id: `${moduleId}-img-${newIndex + 1}`,
            label: `${container.label}-参考图${newIndex + 1}`,
            description: `${container.label}-参考图${newIndex + 1}`,
            required: false,
            minWidth: 100,
            minHeight: 100,
            maxWidth: 800,
            maxHeight: 800,
            supportedFormats: ['png', 'jpg', 'psd', 'gif']
          }
        ]
      };
    }));
  }, []);

  // ===== 粘贴功能：选中坑位 + 全局粘贴监听（参考 KillIconEditor） =====
  // 当前选中的图片坑位ID（用于粘贴功能）
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  // 描述模块额外条目（动态添加）- 支持多个描述模块，key为模块ID
  // 从 initialTextValues 中恢复已保存的动态条目
  const [extraDescItems, setExtraDescItems] = useState<Record<string, number[]>>(() => {
    const restored: Record<string, number[]> = {};
    Object.keys(initialTextValues).forEach(key => {
      // 匹配 extra-impression-{itemId}（只要 key 存在就恢复，不要求内容非空）
      const impressionMatch = key.match(/^extra-impression-(\d+)$/);
      if (impressionMatch && initialTextValues[key] !== undefined) {
        if (!restored['overall']) restored['overall'] = [];
        restored['overall'].push(parseInt(impressionMatch[1], 10));
      }
      // 匹配 extra-desc-{moduleId}-{itemId}（只要 key 存在就恢复）
      const descMatch = key.match(/^extra-desc-(.+)-(\d+)$/);
      if (descMatch && initialTextValues[key] !== undefined) {
        const moduleId = descMatch[1];
        if (!restored[moduleId]) restored[moduleId] = [];
        restored[moduleId].push(parseInt(descMatch[2], 10));
      }
    });
    return restored;
  });

  // 添加描述条目（支持任意描述模块）
  const addDescItem = useCallback((moduleId: string) => {
    const itemId = Date.now();
    setExtraDescItems(prev => ({
      ...prev,
      [moduleId]: [...(prev[moduleId] || []), itemId]
    }));
    // 在 textValues 中为新条目创建空 key，确保保存时能持久化条目数量
    const keyPrefix = moduleId === 'overall' ? 'extra-impression' : `extra-desc-${moduleId}`;
    setTextValues(prev => ({
      ...prev,
      [`${keyPrefix}-${itemId}`]: prev[`${keyPrefix}-${itemId}`] ?? ''
    }));
  }, []);

  // 删除描述条目
  const removeDescItem = useCallback((moduleId: string, itemId: number) => {
    setExtraDescItems(prev => ({
      ...prev,
      [moduleId]: (prev[moduleId] || []).filter(id => id !== itemId)
    }));
    // 清理对应的文字值
    setTextValues(prev => {
      const newValues = { ...prev };
      delete newValues[`extra-desc-${moduleId}-${itemId}`];
      return newValues;
    });
  }, []);

  // 兼容旧的整体印象接口
  const extraImpressionItems = extraDescItems['overall'] || [];
  const addImpressionItem = useCallback(() => addDescItem('overall'), [addDescItem]);
  const removeImpressionItem = useCallback((itemId: number) => removeDescItem('overall', itemId), [removeDescItem]);

  // 监听选中状态变化（调试用）
  useEffect(() => {
    console.log('选中状态变化:', selectedSlotId);
  }, [selectedSlotId]);

  // 全局粘贴事件监听：将剪贴板图片粘贴到当前选中的坑位
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // 调试日志：检查剪贴板内容
      const items = e.clipboardData?.items;
      console.log('粘贴事件触发', { selectedSlotId, hasItems: !!items, itemCount: items?.length });

      if (!selectedSlotId) {
        console.log('未选中任何图片坑位，跳过粘贴');
        return;
      }

      // 如果焦点在文本输入框中（textarea/input），不拦截粘贴，让用户正常粘贴文本
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT')) {
        console.log('焦点在输入框中，跳过图片粘贴', activeEl.tagName);
        return;
      }

      if (!items) {
        console.log('无剪贴板数据');
        return;
      }

      console.log('剪贴板内容类型:', Array.from(items).map(i => i.type));

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          console.log('检测到图片，开始粘贴到:', selectedSlotId);
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const result = event.target?.result as string;
              if (result) {
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

                  console.log('图片数据准备完成，准备写入坑位:', selectedSlotId);

                  // 判断是原始坑位还是额外坑位
                  const extraMatch = selectedSlotId.match(/^(.+)-extra-(\d+)$/);
                  if (extraMatch) {
                    // 额外图片坑位：提取原始 slotId 和索引
                    const originalSlotId = extraMatch[1];
                    const extraIndex = parseInt(extraMatch[2], 10);
                    console.log('写入额外坑位:', { originalSlotId, extraIndex });
                    handleListImageChange(originalSlotId, extraIndex, imageData);
                  } else {
                    // 原始坑位
                    console.log('写入原始坑位:', selectedSlotId);
                    handleListImageChange(selectedSlotId, null, imageData);
                  }
                };
              }
            };
            reader.readAsDataURL(file);
          }
          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    console.log('粘贴事件监听器已注册');
    return () => {
      document.removeEventListener('paste', handlePaste);
      console.log('粘贴事件监听器已移除');
    };
  }, [selectedSlotId, handleListImageChange]);

  // 验证必填字段
  const validation = useMemo(() => {
    const errors: string[] = [];
    
    template.textFields.forEach(field => {
      if (field.required && !textValues[field.id]?.trim()) {
        errors.push(`${field.label} 为必填项`);
      }
    });

    template.imageSlots.forEach(slot => {
      if (slot.required && !imageValues[slot.id]) {
        errors.push(`${slot.label} 为必填项`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }, [template, textValues, imageValues]);

  // 保存（合并主图片和额外图片）
  const handleSave = useCallback(() => {
    if (!validation.isValid) {
      alert('请填写所有必填项:\n' + validation.errors.join('\n'));
      return;
    }
    
    // 合并 imageValues 和 extraImages
    const allImageValues = { ...imageValues };
    Object.entries(extraImages).forEach(([slotId, extras]) => {
      extras.forEach((img, index) => {
        if (img && img.preview) {
          const extraSlotId = `${slotId}-extra-${index}`;
          allImageValues[extraSlotId] = { ...img, slotId: extraSlotId };
        }
      });
    });
    
    // 【关键】如果是自定义模板且容器有变更，同步更新到 templateRegistry
    // 这样下次再进入编辑器时，新增的容器不会丢失
    if (canEditContainers && localContainers.length > 0) {
      // 从 localContainers 中收集所有字段和图片坑位
      const allTextFields: typeof template.textFields = [];
      const allImageSlots: typeof template.imageSlots = [];
      // 同时更新 containers 中 list 容器的 textFields/imageSlots，包含动态添加的条目
      const updatedContainers = localContainers.map(container => {
        if (container.type === 'list') {
          // list 容器：根据 listEntryCounts 动态补充所有条目的字段和图片坑位
          const prefix = container.id === 'specific' ? 'specific-item' : container.id;
          const count = listEntryCounts[container.id] || 1;
          const dynamicTextFields: typeof container.textFields = [];
          const dynamicImageSlots: typeof container.imageSlots = [];
          for (let i = 1; i <= count; i++) {
            // 标题字段
            dynamicTextFields.push({
              id: `${prefix}-title-${i}`,
              label: `需求条目${i}-标题`,
              placeholder: `请输入第${i}条需求的标题`,
              defaultValue: '',
              required: false,
              maxLength: 50,
              style: { fontSize: 14, fontWeight: '600', color: '#333333' }
            });
            // 描述字段
            dynamicTextFields.push({
              id: `${prefix}-desc-${i}`,
              label: `需求条目${i}-描述`,
              placeholder: `请输入第${i}条需求的描述`,
              defaultValue: '',
              required: false,
              maxLength: 500,
              style: { fontSize: 14, fontWeight: '400', color: '#333333' }
            });
            // 图片坑位（同步自定义标题）
            const listImgId = `${prefix}-img-${i}`;
            const listCustomLabel = localFieldLabels[listImgId];
            dynamicImageSlots.push({
              id: listImgId,
              label: listCustomLabel || `需求条目${i}-参考图`,
              description: `第${i}条需求的参考图片`,
              required: false,
              supportedFormats: ['png', 'jpg', 'psd', 'gif']
            });
          }
          // 保留容器中非 title/desc/img 模式的原有字段（如自定义附加字段）
          container.textFields.forEach(f => {
            if (!f.id.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(title|desc)-\\d+$`))) {
              dynamicTextFields.push(f);
            }
          });
          container.imageSlots.forEach(s => {
            if (!s.id.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-img-\\d+$`))) {
              dynamicImageSlots.push(s);
            }
          });
          const updatedContainer = { ...container, textFields: dynamicTextFields, imageSlots: dynamicImageSlots };
          dynamicTextFields.forEach(f => {
            const existing = template.textFields.find(tf => tf.id === f.id);
            allTextFields.push(existing || f);
          });
          dynamicImageSlots.forEach(s => {
            const existing = template.imageSlots.find(ts => ts.id === s.id);
            allImageSlots.push(existing || s);
          });
          return updatedContainer;
        } else {
          // 非 list 容器：保持原有逻辑
          container.textFields.forEach(f => {
            const existing = template.textFields.find(tf => tf.id === f.id);
            allTextFields.push(existing || f);
          });
          container.imageSlots.forEach(s => {
            const existing = template.imageSlots.find(ts => ts.id === s.id);
            // 如果用户自定义了图片坑位标题，同步到 label
            const customLabel = localFieldLabels[s.id];
            const slot = existing || s;
            allImageSlots.push(customLabel ? { ...slot, label: customLabel } : slot);
          });
          // 同步自定义标题到容器的 imageSlots
          const updatedSlots = container.imageSlots.map(s => {
            const customLabel = localFieldLabels[s.id];
            return customLabel ? { ...s, label: customLabel } : s;
          });
          return { ...container, imageSlots: updatedSlots };
        }
      });
      
      // 更新模板定义并重新注册（会自动保存到 localStorage）
      const updatedTemplate: TemplateDefinition = {
        ...template,
        name: localTemplateName,
        version: localTemplateVersion,
        containers: updatedContainers,
        textFields: allTextFields,
        imageSlots: allImageSlots,
        updatedAt: new Date().toISOString()
      };
      templateRegistry.register(updatedTemplate);
    } else {
      // 非自定义模板也需要同步名称和版本号的修改
      if (localTemplateName !== template.name || localTemplateVersion !== template.version) {
        const updatedTemplate: TemplateDefinition = {
          ...template,
          name: localTemplateName,
          version: localTemplateVersion,
          updatedAt: new Date().toISOString()
        };
        templateRegistry.register(updatedTemplate);
      }
    }
    
    onSave(textValues, allImageValues);
  }, [validation, textValues, imageValues, extraImages, onSave, canEditContainers, localContainers, template, localTemplateName, localTemplateVersion]);

  // 导出（合并主图片和额外图片）
  const handleExport = useCallback(() => {
    if (!validation.isValid) {
      alert('请填写所有必填项:\n' + validation.errors.join('\n'));
      return;
    }
    
    // 合并 imageValues 和 extraImages
    const allImageValues = { ...imageValues };
    Object.entries(extraImages).forEach(([slotId, extras]) => {
      extras.forEach((img, index) => {
        if (img && img.preview) {
          const extraSlotId = `${slotId}-extra-${index}`;
          allImageValues[extraSlotId] = { ...img, slotId: extraSlotId };
        }
      });
    });
    
    // 【关键】导出前也同步容器变更，确保预览能正确显示新增容器
    if (canEditContainers && localContainers.length > 0) {
      const allTextFields: typeof template.textFields = [];
      const allImageSlots: typeof template.imageSlots = [];
      // 同 handleSave：对 list 容器动态补充所有条目的字段和图片坑位
      const updatedContainers = localContainers.map(container => {
        if (container.type === 'list') {
          const prefix = container.id === 'specific' ? 'specific-item' : container.id;
          const count = listEntryCounts[container.id] || 1;
          const dynamicTextFields: typeof container.textFields = [];
          const dynamicImageSlots: typeof container.imageSlots = [];
          for (let i = 1; i <= count; i++) {
            dynamicTextFields.push({
              id: `${prefix}-title-${i}`,
              label: `需求条目${i}-标题`,
              placeholder: `请输入第${i}条需求的标题`,
              defaultValue: '',
              required: false,
              maxLength: 50,
              style: { fontSize: 14, fontWeight: '600', color: '#333333' }
            });
            dynamicTextFields.push({
              id: `${prefix}-desc-${i}`,
              label: `需求条目${i}-描述`,
              placeholder: `请输入第${i}条需求的描述`,
              defaultValue: '',
              required: false,
              maxLength: 500,
              style: { fontSize: 14, fontWeight: '400', color: '#333333' }
            });
            // 图片坑位（同步自定义标题）
            const exportImgId = `${prefix}-img-${i}`;
            const exportCustomLabel = localFieldLabels[exportImgId];
            dynamicImageSlots.push({
              id: exportImgId,
              label: exportCustomLabel || `需求条目${i}-参考图`,
              description: `第${i}条需求的参考图片`,
              required: false,
              supportedFormats: ['png', 'jpg', 'psd', 'gif']
            });
          }
          // 保留非动态条目的原有字段
          container.textFields.forEach(f => {
            if (!f.id.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(title|desc)-\\d+$`))) {
              dynamicTextFields.push(f);
            }
          });
          container.imageSlots.forEach(s => {
            if (!s.id.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-img-\\d+$`))) {
              dynamicImageSlots.push(s);
            }
          });
          const updatedContainer = { ...container, textFields: dynamicTextFields, imageSlots: dynamicImageSlots };
          dynamicTextFields.forEach(f => {
            const existing = template.textFields.find(tf => tf.id === f.id);
            allTextFields.push(existing || f);
          });
          dynamicImageSlots.forEach(s => {
            const existing = template.imageSlots.find(ts => ts.id === s.id);
            allImageSlots.push(existing || s);
          });
          return updatedContainer;
        } else {
          container.textFields.forEach(f => {
            const existing = template.textFields.find(tf => tf.id === f.id);
            allTextFields.push(existing || f);
          });
          container.imageSlots.forEach(s => {
            const existing = template.imageSlots.find(ts => ts.id === s.id);
            // 如果用户自定义了图片坑位标题，同步到 label
            const customLabel = localFieldLabels[s.id];
            const slot = existing || s;
            allImageSlots.push(customLabel ? { ...slot, label: customLabel } : slot);
          });
          // 同步自定义标题到容器的 imageSlots
          const updatedSlots = container.imageSlots.map(s => {
            const customLabel = localFieldLabels[s.id];
            return customLabel ? { ...s, label: customLabel } : s;
          });
          return { ...container, imageSlots: updatedSlots };
        }
      });
      
      const updatedTemplate: TemplateDefinition = {
        ...template,
        name: localTemplateName,
        version: localTemplateVersion,
        containers: updatedContainers,
        textFields: allTextFields,
        imageSlots: allImageSlots,
        updatedAt: new Date().toISOString()
      };
      templateRegistry.register(updatedTemplate);
    }
    
    onExport?.(textValues, allImageValues);
  }, [validation, textValues, imageValues, extraImages, onExport, canEditContainers, localContainers, template, localTemplateName, localTemplateVersion]);

  // 获取当前模版最匹配的技能框架（或动态生成）
// 动态生成 skill，支持容器排序后更新
  const skill = useMemo(() => {
    // 如果有本地容器顺序，创建临时模板来生成 skill
    if (canEditContainers && localContainers.length > 0) {
      const templateWithLocalContainers: TemplateDefinition = {
        ...template,
        containers: localContainers
      };
      return generateDynamicSkill(templateWithLocalContainers);
    }
    return generateDynamicSkill(template);
  }, [template, canEditContainers, localContainers]);

  /**
   * 获取字段显示标签：优先用本地覆盖值，其次 skill.fieldLabels，最后 field.label
   */
  const getFieldLabel = useCallback((fieldId: string, fallbackLabel: string) => {
    return localFieldLabels[fieldId] ?? skill?.fieldLabels[fieldId] ?? fallbackLabel;
  }, [localFieldLabels, skill]);

  // 构建预览用的 template：将 localContainers 中动态添加的 textFields/imageSlots 同步到 template
  // 这样 DocumentPreview 能正确渲染动态添加的图片坑位
  const previewTemplate = useMemo<TemplateDefinition>(() => {
    if (!canEditContainers || localContainers.length === 0) return template;
    const allTextFields: typeof template.textFields = [];
    const allImageSlots: typeof template.imageSlots = [];
    localContainers.forEach(container => {
      if (container.type === 'list') {
        // list 容器：根据 listEntryCounts 动态补充所有条目
        const prefix = container.id === 'specific' ? 'specific-item' : container.id;
        const count = listEntryCounts[container.id] || 1;
        for (let i = 1; i <= count; i++) {
          allTextFields.push({
            id: `${prefix}-title-${i}`, label: `需求条目${i}-标题`,
            placeholder: `请输入第${i}条需求的标题`, defaultValue: '', required: false, maxLength: 50,
            style: { fontSize: 14, fontWeight: '600', color: '#333333' }
          });
          allTextFields.push({
            id: `${prefix}-desc-${i}`, label: `需求条目${i}-描述`,
            placeholder: `请输入第${i}条需求的描述`, defaultValue: '', required: false, maxLength: 500,
            style: { fontSize: 14, fontWeight: '400', color: '#333333' }
          });
          // 同步自定义标题到 list 容器的图片坑位
          const listImgId = `${prefix}-img-${i}`;
          const listCustomLabel = localFieldLabels[listImgId];
          allImageSlots.push({
            id: listImgId, label: listCustomLabel || `需求条目${i}-参考图`,
            description: `第${i}条需求的参考图片`, required: false,
            supportedFormats: ['png', 'jpg', 'psd', 'gif']
          });
        }
      } else {
        // 非 list 容器（table、image-group 等）：直接使用 localContainers 中的最新字段
        // 同步自定义标题到 imageSlots 的 label
        container.textFields.forEach(f => allTextFields.push(f));
        container.imageSlots.forEach(s => {
          const customLabel = localFieldLabels[s.id];
          allImageSlots.push(customLabel ? { ...s, label: customLabel } : s);
        });
      }
    });
    return { ...template, containers: localContainers, textFields: allTextFields, imageSlots: allImageSlots };
  }, [template, canEditContainers, localContainers, listEntryCounts, localFieldLabels]);

  // 预览弹窗状态
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // ===== 统一图片网格渲染函数 =====
  // 将 list / image-group / table 三种容器的图片渲染逻辑统一为一个函数
  interface ImageSlotItem {
    slotId: string;           // 图片坑位 ID
    slot: {                   // 坑位配置
      id: string;
      label: string;
      description: string;
      required: boolean;
      supportedFormats?: string[];
    };
    value: any;               // 图片数据
    onChange: (data: any) => void; // 图片变更回调
    onDelete?: () => void;    // 删除回调（无则不显示删除按钮）
  }

  /**
   * 渲染统一的图片网格容器
   * @param items - 标准化的图片坑位列表
   * @param onAdd - 添加按钮回调
   * @param addButtonText - 添加按钮文字（默认"添加参考图"）
   */
  const renderImageSlotsGrid = (
    items: ImageSlotItem[],
    onAdd: () => void,
    addButtonText: string = '添加参考图'
  ) => (
    <div className="image-slots-grid">
      {items.map(item => (
        <div key={item.slotId} className="image-slot-wrapper">
          {/* 删除按钮：有 onDelete 回调时显示 */}
          {item.onDelete && (
            <DeleteButton
              onClick={item.onDelete}
              title="删除此参考图容器"
              position="corner"
              size="small"
            />
          )}
          <ImageUploader
            slot={item.slot}
            value={item.value}
            onChange={item.onChange}
            isSelected={selectedSlotId === item.slotId}
            onSelect={() => setSelectedSlotId(item.slotId)}
            /* 自定义容器：参考图标题可编辑，未编辑时不显示默认标题 */
            customLabel={localFieldLabels[item.slotId] || ''}
            onLabelChange={(newLabel: string) => setLocalFieldLabels(prev => ({ ...prev, [item.slotId]: newLabel }))}
          />
        </div>
      ))}
      {/* 添加图片按钮 */}
      <button
        className="btn-add-image"
        onClick={onAdd}
        title={addButtonText}
      >
        <span className="add-icon">+</span>
        <span>{addButtonText}</span>
      </button>
    </div>
  );

  return (
    <div className="template-editor">
      {/* 头部 — 参照击杀图标编辑器的 header-left + header-actions 结构 */}
      <div className="editor-header">
        <div className="header-left">
          {onBack && (
            <button className="btn-back-inline" onClick={onBack}>
              ← 返回
            </button>
          )}
          <div className="template-badge">
            <span className="badge-icon">📋</span>
            {/* 模板名称：双击进入编辑 */}
            {editingHeaderField === 'name' ? (
              <input
                type="text"
                className="header-inline-input header-name-input"
                value={localTemplateName}
                onChange={(e) => setLocalTemplateName(e.target.value)}
                placeholder="输入模板名称"
                autoFocus
                onBlur={() => setEditingHeaderField(null)}
                onKeyDown={(e) => { if (e.key === 'Enter') setEditingHeaderField(null); }}
                onMouseDown={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                className="badge-text badge-text-editable"
                onDoubleClick={() => setEditingHeaderField('name')}
                title="双击编辑模板名称"
              >{localTemplateName}</span>
            )}
          </div>
          {/* 版本号：双击进入编辑 */}
          {editingHeaderField === 'version' ? (
            <input
              type="text"
              className="header-inline-input header-version-input"
              value={localTemplateVersion}
              onChange={(e) => setLocalTemplateVersion(e.target.value)}
              placeholder="版本号"
              autoFocus
              onBlur={() => setEditingHeaderField(null)}
              onKeyDown={(e) => { if (e.key === 'Enter') setEditingHeaderField(null); }}
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (
            <div
              className="version-tag version-tag-editable"
              onDoubleClick={() => setEditingHeaderField('version')}
              title="双击编辑版本号"
            >{localTemplateVersion}</div>
          )}
          {/* 显示当前选中的图片坑位提示 */}
          {selectedSlotId && (
            <div className="selected-slot-badge">
              📋 已选中: {selectedSlotId}
              <span className="paste-hint-inline">可粘贴图片</span>
            </div>
          )}
        </div>
        <div className="header-actions">
          <button className="btn-save" onClick={handleSave}>
            💾 保存草稿
          </button>
          <button className="btn-preview" onClick={() => setShowPreviewModal(true)}>
            👁️ 预览文档
          </button>
          <button className="btn-export" onClick={handleExport}>
            📤 生成发包文档
          </button>
        </div>
      </div>

      {/* 主内容 — 参照击杀图标编辑器的 sidebar-nav + editor-content 结构 */}
      <div className="editor-main">
        {/* 左侧导航栏 */}
        <div className="sidebar-nav">
          {/* 模块列表：支持拖动排序 */}
          <div className="nav-list">
          {skill.modules.map(module => {
            // 【优先】使用本地容器顺序
            let moduleTextFields: typeof template.textFields = [];
            let moduleImageSlots: typeof template.imageSlots = [];
            
            if (localContainers.length > 0) {
              const container = localContainers.find(c => c.id === module.id);
              if (container) {
                moduleTextFields = container.textFields.map(f => 
                  template.textFields.find(tf => tf.id === f.id) || f
                );
                moduleImageSlots = container.imageSlots.map(s => 
                  template.imageSlots.find(ts => ts.id === s.id) || s
                );
              }
            } else if (template.containers) {
              const container = template.containers.find(c => c.id === module.id);
              if (container) {
                moduleTextFields = container.textFields.map(f => 
                  template.textFields.find(tf => tf.id === f.id) || f
                );
                moduleImageSlots = container.imageSlots.map(s => 
                  template.imageSlots.find(ts => ts.id === s.id) || s
                );
              }
            } else {
              moduleTextFields = template.textFields.filter(f => f.id.startsWith(module.id));
              moduleImageSlots = template.imageSlots.filter(s => s.id.startsWith(module.id));
            }
            
            if (moduleTextFields.length === 0 && moduleImageSlots.length === 0) {
              return null;
            }

            // 是否正在被拖拽
            const isDragging = draggedModuleId === module.id;
            // 是否被拖拽悬停
            const isDragOver = dragOverModuleId === module.id;

            return (
              <div
                key={`nav-${module.id}`}
                className={`nav-item-wrapper ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
                onDragOver={(e) => handleModuleDragOver(e, module.id)}
                onDragLeave={handleModuleDragLeave}
                onDrop={() => handleModuleDrop(module.id)}
                onDragEnd={handleModuleDragEnd}
              >
                {/* 拖动手柄 - 只有这里可以拖动 */}
                {canEditContainers && (
                  <span
                    className="drag-handle"
                    draggable={true}
                    onContextMenu={(e) => e.preventDefault()} // 禁用右键菜单
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      handleDragStart(module.id);
                    }}
                  />
                )}
                {/* 自定义容器：单击定位，双击编辑标题；非自定义容器：单击定位 */}
                {canEditContainers && localContainers.some(c => c.id === module.id) ? (
                  editingNavId === module.id ? (
                    // 编辑态：显示输入框
                    <div className="nav-item nav-item-editable" style={{ borderLeftColor: module.color }}>
                      <input
                        type="text"
                        className="nav-title-input"
                        value={module.title}
                        onChange={(e) => handleContainerLabelChange(module.id, e.target.value)}
                        placeholder="输入标题"
                        autoFocus
                        onBlur={() => setEditingNavId(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') setEditingNavId(null);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        draggable={false}
                      />
                    </div>
                  ) : (
                    // 非编辑态：单击延迟定位，双击取消定位并进入编辑
                    <a
                      href={`#section-${module.id}`}
                      className="nav-item"
                      style={{ borderLeftColor: module.color }}
                      onClick={(e) => {
                        e.preventDefault();
                        // 延迟执行单击，给双击留出检测窗口
                        if (navClickTimerRef.current) clearTimeout(navClickTimerRef.current);
                        navClickTimerRef.current = setTimeout(() => {
                          navClickTimerRef.current = null;
                          const element = document.getElementById(`section-${module.id}`);
                          if (element) {
                            element.scrollIntoView({ behavior: 'smooth' });
                          }
                        }, 200);
                      }}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        // 双击时取消单击的延迟定位
                        if (navClickTimerRef.current) {
                          clearTimeout(navClickTimerRef.current);
                          navClickTimerRef.current = null;
                        }
                        setEditingNavId(module.id);
                      }}
                    >
                      {module.title}
                    </a>
                  )
                ) : (
                  <a
                    href={`#section-${module.id}`}
                    className="nav-item"
                    style={{ borderLeftColor: module.color }}
                    onClick={(e) => {
                      e.preventDefault();
                      const element = document.getElementById(`section-${module.id}`);
                      if (element) {
                        element.scrollIntoView({ behavior: 'smooth' });
                      }
                    }}
                  >
                    {module.title}
                  </a>
                )}
                {/* 删除按钮 */}
                {canEditContainers && (
                  <button
                    className="nav-item-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveModule(module.id);
                    }}
                    title="删除模块"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
          </div>
          
          {/* 添加容器按钮（仅自定义模板） */}
          {canEditContainers && (
            <div className="add-container-wrapper" ref={addContainerRef}>
              <button
                className="add-container-btn"
                onClick={() => setShowAddMenu(!showAddMenu)}
              >
                + 添加容器
              </button>
              {showAddMenu && (
                <div className="add-container-menu">
                  <button onClick={handleAddDescriptionModule}>📝 描述模块</button>
                  <button onClick={handleAddListItemModule}>📋 列表条目</button>
                  <button onClick={handleAddImageGroupModule}>🖼️ 图片组</button>
                  <button onClick={handleAddTableModule}>📊 表格</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 右侧编辑区域 — 内容纵向排列 */}
        <div className="editor-content">
          {/* 基础信息区域 - 所有模板固定显示 */}
          <div className="basic-info-section">
            <div className="basic-info-row">
              <div className="basic-info-field">
                <label className="field-label">主题名称</label>
                <input
                  type="text"
                  className="field-input theme-name-input"
                  value={textValues['overall-theme-name'] ?? textValues['theme-name'] ?? ''}
                  onChange={(e) => {
                    // 智能写入：优先写入模板定义的字段ID
                    const fieldId = template.textFields.some(f => f.id === 'overall-theme-name') 
                      ? 'overall-theme-name' 
                      : 'theme-name';
                    handleTextChange(fieldId, e.target.value);
                  }}
                  placeholder="请输入主题名称"
                />
              </div>
              <div className="basic-info-field">
                <label className="field-label">版本信息</label>
                <input
                  type="text"
                  className="field-input version-input"
                  value={textValues['overall-version-info'] ?? textValues['version-info'] ?? ''}
                  onChange={(e) => {
                    // 智能写入：优先写入模板定义的字段ID
                    const fieldId = template.textFields.some(f => f.id === 'overall-version-info') 
                      ? 'overall-version-info' 
                      : 'version-info';
                    handleTextChange(fieldId, e.target.value);
                  }}
                  placeholder="V / 2025.10.09"
                />
              </div>
            </div>
          </div>

          {/* 按模块分组渲染字段和图片坑位 */}
          {skill.modules.map(module => {
            // 【优先】使用本地容器顺序
            let moduleTextFields: typeof template.textFields = [];
            let moduleImageSlots: typeof template.imageSlots = [];
            let moduleType = 'default'; // 模块类型，用于特殊渲染
            
            if (localContainers.length > 0) {
              // 从本地容器中找到对应模块的字段
              const container = localContainers.find(c => c.id === module.id);
              if (container) {
                // 直接使用容器内的字段（通过 ID 精确匹配）
                moduleTextFields = container.textFields.map(f => 
                  template.textFields.find(tf => tf.id === f.id) || f
                );
                moduleImageSlots = container.imageSlots.map(s => 
                  template.imageSlots.find(ts => ts.id === s.id) || s
                );
                moduleType = container.type;
              }
            } else if (template.containers) {
              // 从 containers 中找到对应模块的字段
              const container = template.containers.find(c => c.id === module.id);
              if (container) {
                moduleTextFields = container.textFields.map(f => 
                  template.textFields.find(tf => tf.id === f.id) || f
                );
                moduleImageSlots = container.imageSlots.map(s => 
                  template.imageSlots.find(ts => ts.id === s.id) || s
                );
                moduleType = container.type;
              }
            } else {
              // 原有逻辑：字段匹配逻辑支持精确前缀匹配和特定 ID 模式匹配
              moduleTextFields = template.textFields.filter(f => {
                // 精确前缀匹配（如 'overall-impression-1' 匹配 'overall'）
                if (f.id.startsWith(module.id + '-') || f.id === module.id) return true;
                // 对于 specific 模块，额外匹配 'specific-item-' 前缀
                if (module.id === 'specific' && f.id.startsWith('specific-item-')) return true;
                return false;
              });
              moduleImageSlots = template.imageSlots.filter(s => {
                // 精确前缀匹配
                if (s.id.startsWith(module.id + '-') || s.id === module.id) return true;
                // 对于 specific 模块，额外匹配 'specific-item-' 前缀
                if (module.id === 'specific' && s.id.startsWith('specific-item-')) return true;
                return false;
              });
            }
            
            if (moduleTextFields.length === 0 && moduleImageSlots.length === 0) {
              return null;
            }

            return (
              <div
                id={`section-${module.id}`}
                key={module.id}
                className={`module-section ${draggedModuleId === module.id ? 'section-dragging' : ''} ${dragOverModuleId === module.id && draggedModuleId !== module.id ? 'section-drag-over' : ''}`}
                onDragOver={(e) => handleModuleDragOver(e, module.id)}
                onDragLeave={handleModuleDragLeave}
                onDrop={() => handleModuleDrop(module.id)}
                onDragEnd={handleModuleDragEnd}
              >
                <div
                  className={`module-header ${canEditContainers ? 'module-header-draggable' : ''}`}
                  style={{ borderLeftColor: module.color }}
                >
                  {/* 拖动手柄图标 - 仅编辑模式显示，拖拽仅从手柄发起 */}
                  {canEditContainers && (
                    <span
                      className="drag-handle module-drag-handle"
                      title="拖动排序"
                      draggable={true}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        handleDragStart(module.id);
                      }}
                    />
                  )}
                  <span className="module-icon">📋</span>
                  {/* 自定义容器：标题可编辑；非自定义容器：静态显示 */}
                  {canEditContainers && localContainers.some(c => c.id === module.id) ? (
                    <input
                      type="text"
                      className="module-title-input"
                      value={module.title}
                      onChange={(e) => handleContainerLabelChange(module.id, e.target.value)}
                      placeholder="请输入条目标题"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      draggable={false}
                    />
                  ) : (
                    <h3 className="module-title">{module.title}</h3>
                  )}
                </div>
                
                <div className="module-content">
                  {/* 列表表格类型模块：动态条目管理 */}
                  {/* 条件：1. moduleType === 'list'（自定义模板容器类型） */}
                  {/*       2. 或 category === 'list-table' 且 module.id === 'specific' */}
                  {/*       3. 或模块内包含 specific-item-* 模式的字段（兼容旧模板） */}
                  {(moduleType === 'list' || 
                    (template.category === 'list-table' && module.id === 'specific') || 
                    moduleTextFields.some(f => f.id.startsWith('specific-item-')) || 
                    moduleImageSlots.some(s => s.id.startsWith('specific-item-img-'))) ? (
                    <div className="list-table-pairs">
                      {/* 动态生成条目，基于每个容器独立的 listEntryCounts */}
                      {Array.from({ length: listEntryCounts[module.id] || 1 }, (_, index) => {
                        const entryNum = index + 1;
                        // 动态生成字段ID（使用容器 ID 前缀，确保多容器不冲突）
                        const fieldPrefix = getListFieldPrefix(module.id);
                        const titleFieldId = `${fieldPrefix}-title-${entryNum}`;
                        const descFieldId = `${fieldPrefix}-desc-${entryNum}`;
                        const imgSlotId = `${fieldPrefix}-img-${entryNum}`;
                        // 获取该条需求的额外图片列表
                        const extras = extraImages[imgSlotId] || [];
                        
                        return (
                          <div key={`entry-${module.id}-${entryNum}`} className="list-table-pair-row vertical" style={{ position: 'relative' }}>
                            {/* 删除条目按钮 - 仅当条目数 > 1 时显示，允许删除任意条目（包括第1条） */}
                            {(listEntryCounts[module.id] || 1) > 1 && (
                              <DeleteButton
                                onClick={() => handleDeleteListEntry(module.id, entryNum)}
                                title="删除此条目"
                                position="corner"
                              />
                            )}
                            {/* 顶部：序号 + 标题输入框 + 描述输入框 */}
                            <div className="list-table-pair-top">
                              <div className="list-table-pair-index">{entryNum}</div>
                              <div className="list-table-pair-content">
                                {/* 标题输入框 */}
                                <input
                                  type="text"
                                  className="field-input list-table-title-input"
                                  value={textValues[titleFieldId] || ''}
                                  onChange={(e) => handleTextChange(titleFieldId, e.target.value)}
                                  placeholder={`请输入第${entryNum}条需求的标题`}
                                  style={{ fontWeight: '600', marginBottom: '8px' }}
                                />
                                {/* 描述输入框 */}
                                <div className="list-table-pair-desc">
                                  <textarea
                                    className="field-input list-table-textarea"
                                    value={textValues[descFieldId] || ''}
                                    onChange={(e) => handleTextChange(descFieldId, e.target.value)}
                                    placeholder={`请输入第${entryNum}条需求的描述`}
                                    rows={3}
                                  />
                                </div>
                              </div>
                            </div>
                            {/* 底部：图片容器网格（调用统一的图片网格渲染函数） */}
                            {renderImageSlotsGrid(
                              // 构建统一的图片坑位列表：主图片 + 额外图片
                              [
                                // 主图片坑位
                                {
                                  slotId: imgSlotId,
                                  slot: {
                                    id: imgSlotId,
                                    label: `需求条目${entryNum}-参考图`,
                                    description: `第${entryNum}条需求的参考图片`,
                                    required: false,
                                    supportedFormats: ['png', 'jpg', 'psd', 'gif']
                                  },
                                  value: imageValues[imgSlotId] || null,
                                  onChange: (data) => handleListImageChange(imgSlotId, null, data),
                                  // 存在额外图片时才可删除主图片
                                  onDelete: extras.length > 0 ? () => handleDeletePrimaryImageSlot(imgSlotId) : undefined
                                },
                                // 额外图片坑位
                                ...extras.map((extraImg, ei) => ({
                                  slotId: `${imgSlotId}-extra-${ei}`,
                                  slot: {
                                    id: `${imgSlotId}-extra-${ei}`,
                                    label: `需求条目${entryNum}-参考图 (${ei + 2})`,
                                    description: `第${entryNum}条需求的额外参考图`,
                                    required: false,
                                    supportedFormats: ['png', 'jpg', 'psd', 'gif'] as string[]
                                  },
                                  value: extraImg.preview ? extraImg : null,
                                  onChange: (data: any) => handleListImageChange(imgSlotId, ei, data),
                                  onDelete: () => handleDeleteImageSlot(imgSlotId, ei)
                                }))
                              ],
                              () => handleAddImageSlot(imgSlotId),
                              '添加图片'
                            )}
                          </div>
                        );
                      })}
                      {/* 添加新条目按钮 */}
                      <div className="list-table-add-entry-btn" onClick={() => handleAddListEntry(module.id)}>
                        <span className="add-icon">+</span>
                        <span className="add-text">添加条目</span>
                      </div>
                      {/* 渲染未配对的描述字段（没有对应图片坑位的） */}
                      {moduleTextFields
                        .filter(f => {
                          // 过滤掉已配对的标题和描述字段
                          const isTitle = moduleImageSlots.some(s => s.id.replace('-img-', '-title-') === f.id);
                          const isDesc = moduleImageSlots.some(s => s.id.replace('-img-', '-desc-') === f.id);
                          return !isTitle && !isDesc;
                        })
                        .map(field => (
                          <div key={field.id} className="text-field-wrapper">
                            {/* 自定义容器：小标题可编辑；非自定义容器：静态显示 */}
                            {canEditContainers && localContainers.some(c => c.id === module.id) ? (
                              <input
                                type="text"
                                className="field-label-input"
                                value={getFieldLabel(field.id, field.label)}
                                onChange={(e) => handleFieldLabelChange(field.id, e.target.value)}
                                placeholder="输入小标题"
                              />
                            ) : (
                              <label className="field-label">{getFieldLabel(field.id, field.label)}</label>
                            )}
                            <input
                              type="text"
                              className="field-input"
                              value={textValues[field.id] || ''}
                              onChange={(e) => handleTextChange(field.id, e.target.value)}
                              placeholder={field.placeholder}
                            />
                          </div>
                        ))
                      }
                    </div>
                  ) : (
                    <>
                  {/* 文字字段 */}
                  {moduleTextFields
                    .filter(field => isFieldVisible(field.id))
                    .map(field => (
                      <div key={field.id} className="text-field-wrapper">
                        {/* 自定义容器：小标题可编辑；非自定义容器：静态显示 */}
                        {canEditContainers && localContainers.some(c => c.id === module.id) ? (
                          <input
                            type="text"
                            className="field-label-input"
                            value={getFieldLabel(field.id, field.label)}
                            onChange={(e) => handleFieldLabelChange(field.id, e.target.value)}
                            placeholder="输入小标题"
                          />
                        ) : (
                          <label className="field-label">{getFieldLabel(field.id, field.label)}</label>
                        )}
                        <input
                          type="text"
                          className="field-input"
                          value={textValues[field.id] || ''}
                          onChange={(e) => handleTextChange(field.id, e.target.value)}
                          placeholder={field.placeholder}
                        />
                      </div>
                    ))}

                  {/* 整体印象模块：额外条目（通用功能） */}
                  {module.id === 'overall' && extraImpressionItems.map(itemId => (
                    <div key={itemId} className="text-field-wrapper extra-item">
                      {/* 自定义容器：小标题可编辑；非自定义容器：静态显示 */}
                      {canEditContainers && localContainers.some(c => c.id === module.id) ? (
                        <input
                          type="text"
                          className="field-label-input"
                          value={getFieldLabel(`extra-impression-${itemId}`, '整体印象-要点')}
                          onChange={(e) => handleFieldLabelChange(`extra-impression-${itemId}`, e.target.value)}
                          placeholder="输入小标题"
                        />
                      ) : (
                        <label className="field-label">{getFieldLabel(`extra-impression-${itemId}`, '整体印象-要点')}</label>
                      )}
                      <input
                        type="text"
                        className="field-input"
                        value={textValues[`extra-impression-${itemId}`] || ''}
                        onChange={(e) => handleTextChange(`extra-impression-${itemId}`, e.target.value)}
                        placeholder="请输入要点内容"
                      />
                      <button 
                        className="btn-remove-item"
                        onClick={() => removeImpressionItem(itemId)}
                        title="删除此条目"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  
                  {/* 整体印象模块：添加条目按钮 */}
                  {module.id === 'overall' && (
                    <div className="list-table-add-entry-btn" onClick={addImpressionItem}>
                      <span className="add-icon">+</span>
                      <span className="add-text">添加条目</span>
                    </div>
                  )}

                  {/* 自定义描述模块：额外条目 */}
                  {moduleType === 'description' && module.id !== 'overall' && (extraDescItems[module.id] || []).map(itemId => (
                    <div key={itemId} className="text-field-wrapper extra-item">
                      {/* 自定义容器：小标题可编辑；非自定义容器：静态显示 */}
                      {canEditContainers && localContainers.some(c => c.id === module.id) ? (
                        <input
                          type="text"
                          className="field-label-input"
                          value={getFieldLabel(`extra-desc-${module.id}-${itemId}`, `${module.title}-要点`)}
                          onChange={(e) => handleFieldLabelChange(`extra-desc-${module.id}-${itemId}`, e.target.value)}
                          placeholder="输入小标题"
                        />
                      ) : (
                        <label className="field-label">{getFieldLabel(`extra-desc-${module.id}-${itemId}`, `${module.title}-要点`)}</label>
                      )}
                      <input
                        type="text"
                        className="field-input"
                        value={textValues[`extra-desc-${module.id}-${itemId}`] || ''}
                        onChange={(e) => handleTextChange(`extra-desc-${module.id}-${itemId}`, e.target.value)}
                        placeholder="请输入要点内容"
                      />
                      <button 
                        className="btn-remove-item"
                        onClick={() => removeDescItem(module.id, itemId)}
                        title="删除此条目"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  
                  {/* 自定义描述模块：添加条目按钮 */}
                  {moduleType === 'description' && module.id !== 'overall' && (
                    <div className="list-table-add-entry-btn" onClick={() => addDescItem(module.id)}>
                      <span className="add-icon">+</span>
                      <span className="add-text">添加条目</span>
                    </div>
                  )}

                  {/* 图片坑位（非列表表格模块也支持选中 + 粘贴，调用统一图片网格渲染函数） */}
                  {(moduleImageSlots.length > 0 || moduleType === 'table') && (
                    (moduleType === 'image-group' || moduleType === 'table') ? (
                      // image-group / table 容器：使用统一渲染函数
                      renderImageSlotsGrid(
                        moduleImageSlots.map(slot => ({
                          slotId: slot.id,
                          slot,
                          value: imageValues[slot.id] || null,
                          onChange: (data: any) => handleImageChange(slot.id, data),
                          // 多于1个坑位时才可删除
                          onDelete: moduleImageSlots.length > 1
                            ? () => handleDeleteImageSlotFromModule(module.id, slot.id)
                            : undefined
                        })),
                        () => handleAddImageSlotToModule(module.id),
                        '添加参考图'
                      )
                    ) : (
                      // 其他类型容器：简单渲染图片坑位（无增删功能）
                      <div className="image-slots-grid">
                        {moduleImageSlots.map(slot => (
                          <div key={slot.id} className="image-slot-wrapper">
                            <ImageUploader
                              slot={slot}
                              value={imageValues[slot.id] || null}
                              onChange={(data) => handleImageChange(slot.id, data)}
                              isSelected={selectedSlotId === slot.id}
                              onSelect={() => setSelectedSlotId(slot.id)}
                            />
                          </div>
                        ))}
                      </div>
                    )
                  )}
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {/* 渲染未匹配到任何模块的字段（兜底） */}
          {(() => {
            // 使用 containers 时，直接跳过（所有字段已精确匹配）
            if (template.containers) return null;
            
            const unassignedTextFields = template.textFields.filter(f => !skill.modules.some(m => f.id.startsWith(m.id)));
            const unassignedImageSlots = template.imageSlots.filter(s => !skill.modules.some(m => s.id.startsWith(m.id)));
            
            if (unassignedTextFields.length === 0 && unassignedImageSlots.length === 0) {
              return null;
            }

            return (
              <div className="module-section">
                <div className="module-header" style={{ borderLeftColor: '#999' }}>
                  <span className="module-icon">💎</span>
                  <h3 className="module-title">其他信息</h3>
                </div>
                
                <div className="module-content">
                  {unassignedTextFields.map(field => (
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

                  {unassignedImageSlots.length > 0 && (
                    <div className="image-slots-grid">
                      {unassignedImageSlots.map(slot => (
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
          })()}
        </div>
      </div>
      {/* 预览弹窗 */}
      {showPreviewModal && (
        <DocumentPreview 
          template={previewTemplate} 
          textValues={textValues} 
          fieldLabels={localFieldLabels}
          imageValues={{
            ...imageValues,
            // 合并额外图片到 imageValues
            ...Object.entries(extraImages).reduce((acc, [slotId, extras]) => {
              extras.forEach((img, index) => {
                if (img && img.preview) {
                  const extraSlotId = `${slotId}-extra-${index}`;
                  acc[extraSlotId] = { ...img, slotId: extraSlotId };
                }
              });
              return acc;
            }, {} as Record<string, ImageData>)
          }} 
          isModal={true}
          onClose={() => setShowPreviewModal(false)}
        />
      )}
    </div>
  );
};

export default TemplateEditor;