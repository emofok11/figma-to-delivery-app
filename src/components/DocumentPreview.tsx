import React, { useMemo } from 'react';
import { TemplateDefinition, ImageData } from '../types/template';
import { generateDynamicSkill, TemplateModule } from '../lib/templateSkills';
import { filterVisibleFields } from '../lib/templateUtils'; // 引入公共过滤函数
import './DocumentPreview.css';

interface DocumentPreviewProps {
  template: TemplateDefinition;
  textValues: Record<string, string>;
  imageValues: Record<string, ImageData>;
  fieldLabels?: Record<string, string>; // 用户编辑后的字段小标题映射
  onClose?: () => void;
  isModal?: boolean;
}

export const DocumentPreview: React.FC<DocumentPreviewProps> = ({
  template,
  textValues,
  imageValues,
  fieldLabels = {},
  onClose,
  isModal = false
}) => {
  // 获取当前模版最匹配的技能框架（或动态生成）
  const skill = useMemo(() => generateDynamicSkill(template), [template]);

  // 获取模块对应的字段
  const getFieldsForModule = (moduleId: string) => {
    return template.textFields.filter(field => field.id.startsWith(moduleId));
  };

  // 获取模块对应的图片
  const getImagesForModule = (moduleId: string) => {
    return template.imageSlots
      .filter(slot => slot.id.startsWith(moduleId))
      .map(slot => ({
        ...slot,
        imageData: imageValues[slot.id]
      }))
      .filter(item => item.imageData);
  };

  // 获取模块对应的图片网格类型
  // list-table 分类和 social-icon 的 specific 模块都使用表格布局
  const getImageGridClassName = (moduleId: string) => {
    if (moduleId === 'interface') return 'preview-images-grid layout-wide';
    if (moduleId === 'icon') return 'preview-images-grid layout-icon';
    if (moduleId === 'reference') return 'preview-images-grid layout-reference';
    // 列表表格类型：specific 模块使用表格布局
    if (moduleId === 'specific' && (skill.id === 'social-icon-v1' || skill.id === 'list-table-v1' || template.category === 'list-table')) {
      return 'preview-images-grid layout-table';
    }
    return 'preview-images-grid layout-standard';
  };

  // 渲染要点列表（bullet point 样式）
  // 同时支持整体印象模块（extra-impression-*）和自定义描述容器（extra-desc-{moduleId}-*）
  const renderBulletPoints = (fields: ReturnType<typeof getFieldsForModule>, moduleId: string) => {
    // 收集模板中定义的字段值（使用公共函数过滤）
    const points = filterVisibleFields(fields)
      .map(field => textValues[field.id])
      .filter(Boolean);
    
    // 根据模块类型收集动态添加的条目
    const extraPrefix = moduleId === 'overall' ? 'extra-impression-' : `extra-desc-${moduleId}-`;
    const extraPoints = Object.keys(textValues)
      .filter(key => key.startsWith(extraPrefix))
      .map(key => textValues[key])
      .filter(Boolean);

    const allPoints = [...points, ...extraPoints];

    if (allPoints.length === 0) return null;

    return (
      <div className="preview-overall-panel">
        <ul className="preview-overall-list">
          {allPoints.map((point, index) => (
            <li key={`${point}-${index}`} className="preview-overall-item">
              <span className="preview-overall-text">• {point}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  // 渲染常规文字字段
  const renderFieldCards = (fields: ReturnType<typeof getFieldsForModule>) => {
    const visibleFields = fields.filter(field => textValues[field.id]);

    if (visibleFields.length === 0) return null;

    return (
      <div className="preview-field-grid">
        {visibleFields.map(field => (
          <div key={field.id} className="preview-field-card">
            <div className="preview-field-label">{fieldLabels[field.id] || skill.fieldLabels[field.id] || field.label}</div>
            <div className="preview-field-value" style={{ color: '#4ECDC4', fontWeight: 'bold', marginBottom: '8px' }}>{fieldLabels[field.id] || skill.fieldLabels[field.id] || field.label}</div>
            <div className="preview-field-value" style={{ whiteSpace: 'pre-wrap' }}>{textValues[field.id]}</div>
          </div>
        ))}
      </div>
    );
  };

  // 渲染列表表格（动态发现所有条目，支持编辑器动态添加的条目）
  // 支持多容器：根据 module.id 确定字段前缀
  const renderListTable = (module: TemplateModule) => {
    // 确定字段前缀：旧模板用 'specific-item'，自定义容器用容器 ID
    const fieldPrefix = module.id === 'specific' ? 'specific-item' : module.id;
    
    // 动态发现所有条目索引
    const itemIndices = new Set<number>();
    
    // 从文字字段中提取索引
    Object.keys(textValues).forEach(key => {
      // 匹配 {prefix}-title-{N} 或 {prefix}-desc-{N}
      if (key.startsWith(`${fieldPrefix}-title-`) || key.startsWith(`${fieldPrefix}-desc-`)) {
        const numStr = key.split('-').pop();
        if (numStr && /^\d+$/.test(numStr)) {
          itemIndices.add(parseInt(numStr, 10));
        }
      }
    });
    
    // 从图片字段中提取索引（包括 extra 图片）
    Object.keys(imageValues).forEach(key => {
      // 匹配 {prefix}-img-{N} 或 {prefix}-img-{N}-extra-{M}
      if (key.startsWith(`${fieldPrefix}-img-`)) {
        const afterImg = key.slice(`${fieldPrefix}-img-`.length);
        const numStr = afterImg.split('-')[0]; // 取第一段数字
        if (numStr && /^\d+$/.test(numStr)) {
          itemIndices.add(parseInt(numStr, 10));
        }
      }
    });
    
    // 如果没有任何条目，默认显示第1条
    if (itemIndices.size === 0) {
      itemIndices.add(1);
    }
    
    // 按序号排序
    const sortedIndices = Array.from(itemIndices).sort((a, b) => a - b);
    
    // 过滤出有实际内容的条目
    const visibleRows = sortedIndices.filter(index => {
      const titleFieldId = `${fieldPrefix}-title-${index}`;
      const descFieldId = `${fieldPrefix}-desc-${index}`;
      const imgSlotId = `${fieldPrefix}-img-${index}`;
      
      const hasTitle = Boolean(textValues[titleFieldId]?.trim());
      const hasDesc = Boolean(textValues[descFieldId]?.trim());
      const hasImage = Boolean(imageValues[imgSlotId]);
      const hasExtraImages = Object.keys(imageValues).some(key => 
        key.startsWith(`${imgSlotId}-extra-`) && imageValues[key]
      );
      return hasTitle || hasDesc || hasImage || hasExtraImages;
    }).map(index => ({
      id: `${fieldPrefix}-img-${index}`,
      index,
      label: `需求条目${index}`
    }));

    if (visibleRows.length === 0) return null;

    return (
      <div className="preview-image-section">
        <table className="preview-image-table">
          <thead>
            <tr>
              <th>描述</th>
              <th>参考</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((slot, index) => {
              // 通过 img→title/desc 映射找到对应的标题和描述字段
              const titleFieldId = slot.id.replace('-img-', '-title-');
              const descFieldId = slot.id.replace('-img-', '-desc-');
              const titleText = textValues[titleFieldId]?.trim() || '';  // 用户输入的标题
              const descText = textValues[descFieldId]?.trim() || '';    // 用户输入的描述
              const imgData = imageValues[slot.id];
              
              // 收集所有额外图片（按索引排序）
              const extraImages: ImageData[] = [];
              Object.keys(imageValues)
                .filter(key => key.startsWith(`${slot.id}-extra-`))
                .sort((a, b) => {
                  const idxA = parseInt(a.split('-extra-')[1], 10);
                  const idxB = parseInt(b.split('-extra-')[1], 10);
                  return idxA - idxB;
                })
                .forEach(key => {
                  if (imageValues[key]) {
                    extraImages.push(imageValues[key]);
                  }
                });

              return (
                <tr key={slot.id}>
                  <td className="preview-table-desc">
                    {/* 序号+标题（标题加粗） */}
                    {titleText && (
                      <div className="preview-table-title" style={{ fontWeight: '600', marginBottom: '4px', color: 'rgba(255, 255, 255, 0.9)' }}>
                        {index + 1}. {titleText}
                      </div>
                    )}
                    {/* 如果没有标题，显示序号+默认标签 */}
                    {!titleText && (
                      <div className="preview-table-seq">{index + 1}. {slot.label.replace('-参考图', '')}</div>
                    )}
                    {/* 描述内容 */}
                    {descText && (
                      <div className="preview-table-text">{descText}</div>
                    )}
                  </td>
                  <td className="preview-table-img">
                    {/* 参考图：复用击杀图标模板的 preview-images-grid + preview-image-frame 布局 */}
                    {(imgData || extraImages.length > 0) ? (
                      <div className="preview-images-grid layout-reference">
                        {imgData && (
                          <figure className="preview-image-item">
                            <div className="preview-image-frame">
                              <img
                                src={imgData.preview}
                                alt={`${slot.label}-参考图1`}
                              />
                            </div>
                          </figure>
                        )}
                        {extraImages.map((extraImg, ei) => (
                          <figure key={`extra-${ei}`} className="preview-image-item">
                            <div className="preview-image-frame">
                              <img
                                src={extraImg.preview}
                                alt={`${slot.label}-参考图${ei + 2}`}
                              />
                            </div>
                          </figure>
                        ))}
                      </div>
                    ) : (
                      <span className="preview-table-no-img">暂无图片</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // 渲染图片区域（非列表表格类型使用）
  const renderImages = (module: TemplateModule, images: ReturnType<typeof getImagesForModule>) => {
    if (images.length === 0) return null;

    const gridClass = getImageGridClassName(module.id);
    // 判断图片标签是否为默认格式，默认格式不显示
    // 匹配：'xxx-参考图N'（table）、'xxx参考图N'（image-group，无分隔符）、'需求条目N-参考图'（list）、'需求条目N-参考图 (M)'（list 额外图片）
    const isDefaultLabel = (label: string) => /^.+[-]?参考图\s*\d*(\s*\(\d+\))?$/.test(label);

    return (
      <div className="preview-image-section">
        <div className={gridClass}>
          {images.map((image, index) => (
            <figure key={image.id} className="preview-image-item">
              {/* 仅当用户自定义了标题时才显示（默认格式的标题隐藏） */}
              {!isDefaultLabel(image.label) && (
                <figcaption className="preview-image-caption" style={{ marginBottom: '8px' }}>
                  <span className="preview-image-seq">{String(index + 1).padStart(2, '0')}</span>
              <span className="preview-image-label" style={{ color: '#8B978F', fontWeight: 'bold', fontSize: '14px' }}>{fieldLabels[image.id] || image.label}</span>
                </figcaption>
              )}
              <div className="preview-image-frame">
                <img
                  src={image.imageData!.preview}
                  alt={image.label}
                />
              </div>
            </figure>
          ))}
        </div>
      </div>
    );
  };

  // 计算可见模块
  const visibleModules = skill.modules.filter(module => {
    const fields = getFieldsForModule(module.id);
    const images = getImagesForModule(module.id);
    // 检查模板字段有值
    const hasFieldValues = fields.some(field => Boolean(textValues[field.id]));
    // 检查图片有值
    const hasImages = images.length > 0;
    // 对于overall模块，检查动态添加的extra-impression-*条目
    const hasExtraImpressions = module.id === 'overall' && Object.keys(textValues)
      .some(key => key.startsWith('extra-impression-') && Boolean(textValues[key]));
    
    // 对于description类型容器，检查动态添加的extra-desc-{moduleId}-*条目
    const containerDef = template.containers?.find(c => c.id === module.id);
    const isDescriptionModule = containerDef?.type === 'description';
    const hasExtraDescItems = isDescriptionModule && Object.keys(textValues)
      .some(key => key.startsWith(`extra-desc-${module.id}-`) && Boolean(textValues[key]));
    
    // 【关键】对于 list 类型容器，动态添加的条目字段不在 template.textFields 中，
    // 需要额外检查 textValues/imageValues 中是否有以容器 ID 为前缀的键
    const containerType = template.containers?.find(c => c.id === module.id)?.type;
    const isListModule = containerType === 'list' || (
      module.id === 'specific' && (template.category === 'list-table')
    );
    const hasDynamicListContent = isListModule && (
      Object.keys(textValues).some(key => key.startsWith(`${module.id === 'specific' ? 'specific-item' : module.id}-`) && Boolean(textValues[key])) ||
      Object.keys(imageValues).some(key => key.startsWith(`${module.id === 'specific' ? 'specific-item' : module.id}-`) && Boolean(imageValues[key]))
    );
    
    return hasFieldValues || hasImages || hasExtraImpressions || hasExtraDescItems || hasDynamicListContent;
  });

  // 渲染单个模块（章节标题统一红色，对照原稿）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const renderModule = (module: TemplateModule, _index: number) => {
    const fields = getFieldsForModule(module.id);
    const images = getImagesForModule(module.id);

    // 判断是否为列表表格的 specific 模块
    // 条件：1. skill匹配特定类型 且 module.id === 'specific'
    //      2. 或模块内包含 specific-item-* 模式的字段（旧模板兼容）
    //      3. 或该模块对应的容器类型为 'list'（自定义模板的 list 容器）
    const containerType = template.containers?.find(c => c.id === module.id)?.type;
    const isListTableSpecific = module.id === 'specific' && (
      skill.id === 'social-icon-v1' || skill.id === 'list-table-v1' || template.category === 'list-table'
    ) || containerType === 'list' || fields.some(f => f.id.startsWith('specific-item-')) || images.some(img => img.id.startsWith('specific-item-img-'));

    return (
      <section key={module.id} className="preview-module">
        <div className="preview-module-header">
          <div className="preview-module-heading">
            {/* 章节标题：红色 */}
            <h3 className="preview-module-title">{module.title}</h3>
          </div>
        </div>

        <div className="preview-module-content">
          {/* 列表表格的 specific 模块：使用专用表格渲染（描述+图片合并显示） */}
          {isListTableSpecific ? (
            renderListTable(module)
          ) : (
            <>
              {/* overall模块和description类型容器：使用bullet point列表展示 */}
              {module.id === 'overall' || template.containers?.find(c => c.id === module.id)?.type === 'description'
                ? renderBulletPoints(fields, module.id)
                : renderFieldCards(fields)}
              {renderImages(module, images)}
            </>
          )}
        </div>
      </section>
    );
  };

  // 获取版本号和标题（优先使用用户输入的值，兼容两种字段ID，未填写时 fallback 到模板默认信息）
  const title = textValues['overall-theme-name'] || textValues['theme-name'] || template.name;
  const version = textValues['overall-version-info'] || textValues['version-info'] || template.version || 'V / 2025.10.09';

  const content = (
    <div className={`document-preview ${isModal ? 'modal-mode' : ''}`}>
      {/* 文档头部：版本号 + 大标题居中，对照原稿 */}
      <div className="preview-header">
        {/* 版本号小字行 */}
        <div className="preview-chip-row">
          <span className="preview-chip">{version}</span>
        </div>
        <div className="preview-header-main">
          <div className="preview-title-section">
            {/* 大标题居中 */}
            <h1 className="preview-main-title">{title}</h1>
          </div>
        </div>
      </div>

      {/* 文档内容 */}
      <div className="preview-body">
        {visibleModules.length > 0 ? (
          visibleModules.map((module, index) => renderModule(module, index))
        ) : (
          <div className="preview-empty-state">
            <div className="preview-empty-icon">🗂️</div>
            <h3>当前还没有可预览的内容</h3>
            <p>请先补充文字说明或上传参考图片，预览页会自动生成更完整的版面效果。</p>
          </div>
        )}
      </div>

      {/* 附录 */}
      <div className="preview-appendix">
        <div className="preview-appendix-header">
          <span className="appendix-icon">⚠️</span>
          <div>
            <span className="appendix-title">附录 - 合规性要求</span>
            <p className="appendix-subtitle">提交前请再次检查是否存在风险元素或不当表达。</p>
          </div>
        </div>
        <div className="preview-appendix-content">
          <p>设计要求遵守合规性与底线，需要对有风险的元素内容进行排查。</p>
          <p>包括但不限于：地缘政治、敏感历史、不良导向、性别种族歧视、血腥暴力、恐怖、涉外、违禁、抄袭等内容。</p>
          <p className="warning-text">常见如下图涉及地图、宗教符号、空白元素、血腥暴力的元素需规避使用。</p>
          {/* 固定内置合规示例图，不需要用户上传 */}
          <img
            src="/compliance-examples.png"
            alt="合规性风险示例"
            className="compliance-examples-img"
          />
        </div>
      </div>

      {/* 底部横条：对照原稿「保密项目 · 禁止外传」 */}
      <div className="preview-footer">
        保密项目 · 禁止外传
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div className="preview-modal-overlay" onClick={onClose}>
        <div className="preview-modal-content" onClick={event => event.stopPropagation()}>
          <div className="preview-modal-header">
            <div>
              <h2>文档预览</h2>
              <p>当前内容已按正式模板版式排版</p>
            </div>
            <button className="preview-close-btn" onClick={onClose}>✕</button>
          </div>
          <div className="preview-modal-body">{content}</div>
          <div className="preview-modal-footer">
            <button className="btn-print" onClick={() => window.print()}>
              打印文档
            </button>
            {onClose && (
              <button className="btn-close-preview" onClick={onClose}>
                关闭预览
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return content;
};

export default DocumentPreview;
