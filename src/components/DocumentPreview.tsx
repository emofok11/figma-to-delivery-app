import React, { useMemo } from 'react';
import { TemplateDefinition, ImageData } from '../types/template';
import { generateDynamicSkill, TemplateModule } from '../lib/templateSkills';
import { filterVisibleFields } from '../lib/templateUtils'; // 引入公共过滤函数
import './DocumentPreview.css';

const DESCRIPTION_COLOR_META_SUFFIX = '__color';
const DEFAULT_DESCRIPTION_TEXT_COLOR = '#ECE8E1';
const DESCRIPTION_BULLET_REGEXP = /^\s*[·•●▪◦‣\-]\s*/;

function getDescriptionColorFieldId(fieldId: string): string {
  return `${fieldId}${DESCRIPTION_COLOR_META_SUFFIX}`;
}

function normalizeDescriptionColor(value?: string): string {
  if (!value) return DEFAULT_DESCRIPTION_TEXT_COLOR;
  const normalizedValue = value.trim();

  if (/^#[0-9a-fA-F]{6}$/.test(normalizedValue)) {
    return normalizedValue.toUpperCase();
  }

  const rgbMatch = normalizedValue.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (rgbMatch) {
    const toHex = (channel: string) => Math.max(0, Math.min(255, Number(channel)))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();

    return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
  }

  return DEFAULT_DESCRIPTION_TEXT_COLOR;
}

// 判断当前值是否已经是富文本 HTML，兼容旧版纯文本描述内容。
function isDescriptionRichHtml(value?: string): boolean {
  return Boolean(value && /<\/?[a-z][^>]*>/i.test(value));
}

// 转义纯文本里的特殊字符，避免把用户输入误当成 HTML。
function escapeDescriptionHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 将纯文本描述转成带 <br> 的 HTML，便于和富文本走同一套解析流程。
// 行首空格（续行缩进）用 &nbsp; 保留，避免 HTML 连续空格被浏览器折叠。
function descriptionPlainTextToHtml(value: string): string {
  const normalizedText = value.replace(/\r\n/g, '\n');
  if (!normalizedText) return '';
  const escaped = escapeDescriptionHtml(normalizedText).replace(/\n /g, (match) => {
    const spaces = match.slice(1);
    return '<br>' + spaces.replace(/ /g, '&nbsp;');
  });
  return escaped.replace(/\n/g, '<br>');
}

interface DescriptionCharToken {
  char: string;
  color?: string;
}

interface DescriptionPreviewPoint {
  lines: DescriptionCharToken[][];
  markerColor?: string;
  baseColor?: string;
  isBullet?: boolean;
}

// 将富文本 HTML 还原为纯文本，便于做内容存在性判断和兼容旧逻辑。
function descriptionHtmlToPlainText(value?: string): string {
  if (!value) return '';
  if (!isDescriptionRichHtml(value)) {
    return value.replace(/\r\n/g, '\n');
  }

  const container = document.createElement('div');
  container.innerHTML = value;
  const parts: string[] = [];

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent || '');
      return;
    }

    if (!(node instanceof HTMLElement)) {
      return;
    }

    const tagName = node.tagName.toLowerCase();
    if (tagName === 'br') {
      parts.push('\n');
      return;
    }

    node.childNodes.forEach(walk);

    if ((tagName === 'div' || tagName === 'p' || tagName === 'li') && parts[parts.length - 1] !== '\n') {
      parts.push('\n');
    }
  };

  container.childNodes.forEach(walk);
  return parts.join('').replace(/\u00A0/g, ' ').replace(/\n+$/, '');
}

// 将富文本描述拍平成字符 token，保留局部字色与换行信息。
function descriptionHtmlToCharTokens(value?: string, fallbackColor?: string): DescriptionCharToken[] {
  if (!value) return [];

  const container = document.createElement('div');
  container.innerHTML = isDescriptionRichHtml(value) ? value : descriptionPlainTextToHtml(value);
  const normalizedFallbackColor = normalizeDescriptionColor(fallbackColor);
  const tokens: DescriptionCharToken[] = [];

  const pushText = (text: string, color?: string) => {
    const normalizedColor = color && normalizeDescriptionColor(color) !== normalizedFallbackColor
      ? normalizeDescriptionColor(color)
      : undefined;

    Array.from(text.replace(/\u00A0/g, ' ')).forEach(char => {
      tokens.push({ char, color: normalizedColor });
    });
  };

  const walk = (node: Node, inheritedColor?: string) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushText(node.textContent || '', inheritedColor);
      return;
    }

    if (!(node instanceof HTMLElement)) {
      return;
    }

    const tagName = node.tagName.toLowerCase();
    if (tagName === 'br') {
      tokens.push({ char: '\n' });
      return;
    }

    const rawColor = node.style.color || node.getAttribute('color') || inheritedColor;
    const normalizedColor = rawColor ? normalizeDescriptionColor(rawColor) : undefined;

    node.childNodes.forEach(child => walk(child, normalizedColor));

    if ((tagName === 'div' || tagName === 'p' || tagName === 'li') && tokens[tokens.length - 1]?.char !== '\n') {
      tokens.push({ char: '\n' });
    }
  };

  container.childNodes.forEach(node => walk(node));

  while (tokens[tokens.length - 1]?.char === '\n') {
    tokens.pop();
  }

  return tokens;
}

function getDescriptionLineText(tokens: DescriptionCharToken[]): string {
  return tokens.map(token => token.char).join('');
}

// 编辑器里的续行缩进只用于输入辅助，预览里改为真实换行对齐，因此去掉前导空格。
function trimDescriptionLineTokens(tokens: DescriptionCharToken[]): DescriptionCharToken[] {
  let start = 0;
  while (start < tokens.length && /\s/.test(tokens[start].char)) {
    start += 1;
  }
  return tokens.slice(start);
}

// 将富文本描述拆成“项目符号 + 多行内容”的结构，保证预览与输入框换行效果一致。
function extractDescriptionPreviewPoints(value?: string, fallbackColor?: string): DescriptionPreviewPoint[] {
  if (!value) return [];

  const rawTokens = descriptionHtmlToCharTokens(value, fallbackColor);
  if (rawTokens.length === 0) return [];

  const lines: DescriptionCharToken[][] = [];
  let currentLine: DescriptionCharToken[] = [];

  rawTokens.forEach(token => {
    if (token.char === '\n') {
      lines.push(currentLine);
      currentLine = [];
      return;
    }

    currentLine.push(token);
  });
  lines.push(currentLine);

  const points: DescriptionPreviewPoint[] = [];
  let currentPoint: DescriptionPreviewPoint | null = null;

  const commitPoint = () => {
    if (!currentPoint) return;

    const normalizedLines = [...currentPoint.lines];
    while (normalizedLines.length > 0 && !getDescriptionLineText(normalizedLines[0]).trim()) normalizedLines.shift();
    while (normalizedLines.length > 0 && !getDescriptionLineText(normalizedLines[normalizedLines.length - 1]).trim()) normalizedLines.pop();

    if (normalizedLines.some(line => getDescriptionLineText(line).trim())) {
      points.push({
        ...currentPoint,
        lines: normalizedLines
      });
    }

    currentPoint = null;
  };

  lines.forEach(lineTokens => {
    const lineText = getDescriptionLineText(lineTokens);
    const bulletMatch = lineText.match(DESCRIPTION_BULLET_REGEXP);

    if (bulletMatch) {
      commitPoint();

      let markerColor = normalizeDescriptionColor(fallbackColor);
      for (let index = bulletMatch[0].length - 1; index >= 0; index -= 1) {
        const token = lineTokens[index];
        if (token && !/\s/.test(token.char)) {
          markerColor = token.color || normalizeDescriptionColor(fallbackColor);
          break;
        }
      }

      currentPoint = {
        markerColor,
        // 续行应回落到字段默认色，不能跟着首行或项目符号颜色一起继承。
        baseColor: normalizeDescriptionColor(fallbackColor),
        lines: [trimDescriptionLineTokens(lineTokens.slice(bulletMatch[0].length))],
        isBullet: true
      };
      return;
    }

    if (lineText.trim()) {
      const normalizedLine = trimDescriptionLineTokens(lineTokens);
      if (!currentPoint) {
        const normalizedBaseColor = normalizeDescriptionColor(fallbackColor);
        currentPoint = {
          markerColor: normalizedBaseColor,
          baseColor: normalizedBaseColor,
          lines: [normalizedLine]
        };
      } else {
        currentPoint.lines.push(normalizedLine);
      }
      return;
    }

    if (currentPoint) {
      currentPoint.lines.push([]);
    }
  });

  commitPoint();
  return points;
}

// 将同色的连续字符合并为 span，保证局部字色在预览里连续显示。
function renderDescriptionLineTokens(tokens: DescriptionCharToken[], fallbackColor: string, keyPrefix: string): React.ReactNode {
  if (tokens.length === 0) return null;

  const normalizedFallbackColor = normalizeDescriptionColor(fallbackColor);
  const segments: Array<{ text: string; color?: string }> = [];

  tokens.forEach(token => {
    const normalizedColor = token.color && normalizeDescriptionColor(token.color) !== normalizedFallbackColor
      ? normalizeDescriptionColor(token.color)
      : undefined;
    const lastSegment = segments[segments.length - 1];

    if (lastSegment && lastSegment.color === normalizedColor) {
      lastSegment.text += token.char;
      return;
    }

    segments.push({
      text: token.char,
      color: normalizedColor
    });
  });

  return segments.map((segment, index) => (
    <span
      key={`${keyPrefix}-${index}`}
      style={segment.color ? { color: segment.color } : undefined}
    >
      {segment.text}
    </span>
  ));
}

function renderDescriptionRichText(value: string | undefined, fallbackColor: string, keyPrefix: string): React.ReactNode {
  const tokens = descriptionHtmlToCharTokens(value, fallbackColor);
  if (tokens.length === 0) return null;

  const normalizedFallbackColor = normalizeDescriptionColor(fallbackColor);
  const nodes: React.ReactNode[] = [];
  let currentText = '';
  let currentColor: string | undefined;
  let segmentIndex = 0;

  const flushSegment = () => {
    if (!currentText) return;

    nodes.push(
      <span
        key={`${keyPrefix}-segment-${segmentIndex}`}
        style={currentColor ? { color: currentColor } : undefined}
      >
        {currentText}
      </span>
    );

    segmentIndex += 1;
    currentText = '';
  };

  tokens.forEach((token, index) => {
    if (token.char === '\n') {
      flushSegment();
      nodes.push(<br key={`${keyPrefix}-break-${index}`} />);
      currentColor = undefined;
      return;
    }

    const normalizedColor = token.color && normalizeDescriptionColor(token.color) !== normalizedFallbackColor
      ? normalizeDescriptionColor(token.color)
      : undefined;

    if (normalizedColor !== currentColor) {
      flushSegment();
      currentColor = normalizedColor;
    }

    currentText += token.char;
  });

  flushSegment();
  return nodes;
}

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

  // 将多行项目符号文本拆成独立要点，兼容编辑器中的"· "前缀。
  // 返回值包含 isBullet 标记，只有以项目符号开头的行才标记为 isBullet。
  const splitBulletLines = (value: string | undefined, fallbackColor: string = DEFAULT_DESCRIPTION_TEXT_COLOR): DescriptionPreviewPoint[] => {
    if (!value) return [];

    const points: DescriptionPreviewPoint[] = [];
    let currentLines: string[] = [];
    let currentIsBullet = false;

    const commitPoint = () => {
      const normalizedPoint = currentLines.join('\n').trim();
      if (normalizedPoint) {
        points.push({
          markerColor: fallbackColor,
          baseColor: fallbackColor,
          isBullet: currentIsBullet,
          lines: [[{ char: normalizedPoint, color: undefined }]]
        });
      }
      currentLines = [];
    };

    value
      .replace(/\r\n/g, '\n')
      .split('\n')
      .forEach(line => {
        if (/^[·•●▪◦‣\-]\s*/.test(line)) {
          if (currentLines.length > 0) {
            commitPoint();
          }
          currentIsBullet = true;
          currentLines = [line.replace(/^[·•●▪◦‣\-]\s*/, '').trim()];
          return;
        }

        if (!line.trim()) {
          if (currentLines.length > 0) {
            currentLines.push('');
          }
          return;
        }

        if (currentLines.length === 0) {
          currentIsBullet = false;
          currentLines = [line.trim()];
        } else {
          currentLines.push(line.trim());
        }
      });

    if (currentLines.length > 0) {
      commitPoint();
    }

    return points;
  };
  // 渲染要点列表（bullet point 样式）
  // 同时支持整体印象模块（extra-impression-*）和自定义描述容器（extra-desc-{moduleId}-*）。
  const renderBulletPoints = (fields: ReturnType<typeof getFieldsForModule>, moduleId: string) => {
    const visibleFields = filterVisibleFields(fields);
    const primaryField = visibleFields[0];
    const fallbackColor = primaryField
      ? normalizeDescriptionColor(textValues[getDescriptionColorFieldId(primaryField.id)])
      : DEFAULT_DESCRIPTION_TEXT_COLOR;

    // 先收集模板中定义的字段值，富文本描述按字符颜色拆分；普通纯文本字段仍按原 bullet 逻辑处理。
    const points = visibleFields.flatMap(field => {
      const fieldValue = textValues[field.id];
      if (!fieldValue) return [];

      if (isDescriptionRichHtml(fieldValue)) {
        return extractDescriptionPreviewPoints(fieldValue, normalizeDescriptionColor(textValues[getDescriptionColorFieldId(field.id)]));
      }

      return splitBulletLines(fieldValue, fallbackColor);
    });

    // 根据模块类型收集动态添加的条目。
    const extraPrefix = moduleId === 'overall' ? 'extra-impression-' : `extra-desc-${moduleId}-`;
    const extraPoints = Object.keys(textValues)
      .filter(key => key.startsWith(extraPrefix))
      .flatMap(key => {
        const fieldValue = textValues[key];
        if (!fieldValue) return [];

        if (isDescriptionRichHtml(fieldValue)) {
          return extractDescriptionPreviewPoints(fieldValue, normalizeDescriptionColor(textValues[getDescriptionColorFieldId(key)]));
        }

        return splitBulletLines(fieldValue, fallbackColor);
      });

    const allPoints = [...points, ...extraPoints].filter(point =>
      point.lines.some(line => getDescriptionLineText(line).trim())
    );

    if (allPoints.length === 0) return null;

    return (
      <div className="preview-overall-panel">
        <ul className="preview-overall-list">
          {allPoints.map((point, index) => {
            const markerColor = point.markerColor || fallbackColor;
            const baseColor = point.baseColor || markerColor;
            const isBullet = point.isBullet === true; // 只有明确标记为bullet的点才显示项目符号

            const textContent = point.lines.map((lineTokens, lineIndex) => (
              <React.Fragment key={`${moduleId}-${index}-line-${lineIndex}`}>
                {lineIndex > 0 && <br />}
                {renderDescriptionLineTokens(
                  lineTokens,
                  baseColor,
                  `${moduleId}-${index}-segment-${lineIndex}`
                )}
              </React.Fragment>
            ));

            if (!isBullet) {
              // 正文内容：不加项目符号
              return (
                <li key={`${moduleId}-${index}`} className="preview-overall-item preview-overall-plain">
                  <span className="preview-overall-text" style={{ color: baseColor }}>
                    {textContent}
                  </span>
                </li>
              );
            }

            return (
              <li key={`${moduleId}-${index}`} className="preview-overall-item">
                <span className="preview-overall-bullet" style={{ color: markerColor }}>•</span>
                <span className="preview-overall-text" style={{ color: baseColor }}>
                  {textContent}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const renderRichDescriptionModule = (fields: ReturnType<typeof getFieldsForModule>) => {
    const visibleFields = filterVisibleFields(fields).filter(field => {
      const fieldValue = textValues[field.id];
      if (!fieldValue) return false;
      return Boolean(descriptionHtmlToPlainText(fieldValue).trim());
    });

    if (visibleFields.length === 0) return null;

    return (
      <div className="preview-description-rich-list">
        {visibleFields.map(field => {
          const fallbackColor = normalizeDescriptionColor(textValues[getDescriptionColorFieldId(field.id)]);
          const richContent = renderDescriptionRichText(textValues[field.id], fallbackColor, field.id);

          if (!richContent) return null;

          return (
            <div
              key={field.id}
              className="preview-description-rich-text"
              style={{ color: fallbackColor }}
            >
              {richContent}
            </div>
          );
        })}
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
    // 检查模板字段有值，富文本描述按还原后的纯文本判断。
    const hasFieldValues = fields.some(field => {
      const fieldValue = textValues[field.id];
      if (!fieldValue) return false;
      return isDescriptionRichHtml(fieldValue)
        ? Boolean(descriptionHtmlToPlainText(fieldValue).trim())
        : splitBulletLines(fieldValue).length > 0;
    });
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
              {module.id === 'overall' || containerType === 'description'
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
            <div className="preview-empty-icon">☐</div>
            <h3>当前还没有可预览的内容</h3>
            <p>请先补充文字说明或上传参考图片，预览页会自动生成更完整的版面效果。</p>
          </div>
        )}
      </div>

      {/* 附录 */}
      <div className="preview-appendix">
        <div className="preview-appendix-header">
          <span className="appendix-icon">!</span>
          <div>
            <span className="appendix-title">附录 - 合规性要求</span>
            <p className="appendix-subtitle">提交前请再次检查是否存在风险元素或不当表达。</p>
          </div>
        </div>
        <div className="preview-appendix-content">
          <p>设计要求遵守合规性与底线，需要对有风险的元素内容进行排查。</p>
          <p>包括但不限于：地缘政治、敏感历史、不良导向、性别种族歧视、血腥暴力、恐怖、涉外、违禁、抄袭等内容。</p>
          <p className="warning-text">常见如下图涉及地图、宗教符号、空白元素、血腥暴力的元素需规避使用。</p>
          {/* 固定内置合规示例图，使用 BASE_URL 确保部署路径正确 */}
          <img
            src={`${import.meta.env.BASE_URL}images/compliance-examples.png`}
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
            <button className="preview-close-btn" onClick={onClose}>×</button>
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
