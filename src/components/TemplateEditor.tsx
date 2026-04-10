import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { TemplateDefinition, ImageData, ContainerPart } from '../types/template';
import { generateDynamicSkill } from '../lib/templateSkills';
import { isFieldVisible, getTodayVersion } from '../lib/templateUtils'; // 引入公共过滤函数
import { templateRegistry } from '../lib/templateRegistry'; // 用于同步容器变更到注册中心
import { createDescriptionPart, createListItemPart, createImageGroupPart, createTablePart } from '../lib/containerParts';
import {
  ListStateManager,
  KeyboardEventDispatcher,
  createInputHandler,
  initializeListEditorState,
  createConfiguredDispatcher
} from '../lib/listEditorUtils'; // 列表编辑工具
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

// 自定义描述模块统一使用项目符号文本格式，并支持同一条目内续行。
const DESCRIPTION_BULLET = '· ';
const DESCRIPTION_BULLET_REGEXP = /^\s*[·•●▪◦‣\-]\s*/;
const DESCRIPTION_CONTINUATION = '  ';
const DESCRIPTION_COLOR_META_SUFFIX = '__color';
const DEFAULT_DESCRIPTION_TEXT_COLOR = '#ECE8E1';
const DESCRIPTION_COLOR_OPTIONS = ['#ECE8E1', '#FF4655', '#F5D061', '#4ECDC4', '#7AA2FF', '#C792EA'] as const;
const DESCRIPTION_HISTORY_LIMIT = 100;

// 颜色元数据单独挂在 textValues 上，避免改动现有模版结构。
function getDescriptionColorFieldId(fieldId: string): string {
  return `${fieldId}${DESCRIPTION_COLOR_META_SUFFIX}`;
}

// 统一约束颜色格式，避免把非法值写入预览和存储。
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

// 转义描述内容里的危险字符，避免写回 DOM 时破坏结构。
function escapeDescriptionHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 将纯文本项目符号内容转换为富文本 HTML，供编辑器与预览复用。
function descriptionPlainTextToHtml(value: string): string {
  const normalizedText = value.replace(/\r\n/g, '\n');
  if (!normalizedText.trim()) return '';

  // 这里保持“纯文本 + 换行”的模型，避免列表渲染后的 HTML 与键盘编辑逻辑使用不同文本语义。
  return escapeDescriptionHtml(normalizedText).replace(/\n/g, '<br>');
}

// 将富文本 HTML 还原为纯文本，便于复用现有项目符号解析逻辑。
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

    if ((tagName === 'div' || tagName === 'p') && parts[parts.length - 1] !== '\n') {
      parts.push('\n');
    }
  };

  container.childNodes.forEach(walk);
  // 保留末尾换行，避免自定义描述输入框在 Enter / Shift+Enter 后被规范化逻辑吞掉空行。
  return parts.join('').replace(/\u00A0/g, ' ');
}

// 清洗富文本内容，只保留文本、换行和带颜色的 span，避免 contentEditable 回写脏结构。
function sanitizeDescriptionRichHtml(value?: string, fallbackColor?: string): string {
  if (!value) return '';
  if (!isDescriptionRichHtml(value)) {
    return descriptionPlainTextToHtml(descriptionHtmlToPlainText(value));
  }

  const container = document.createElement('div');
  container.innerHTML = value;
  const normalizedFallbackColor = normalizeDescriptionColor(fallbackColor);

  const serializeNode = (node: Node, inheritedColor?: string): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeDescriptionHtml(node.textContent || '');
    }

    if (!(node instanceof HTMLElement)) {
      return '';
    }

    const tagName = node.tagName.toLowerCase();
    if (tagName === 'br') {
      return '<br>';
    }

    const rawColor = node.style.color || node.getAttribute('color') || '';
    const normalizedColor = rawColor ? normalizeDescriptionColor(rawColor) : inheritedColor;
    const childHtml = Array.from(node.childNodes)
      .map(child => serializeNode(child, normalizedColor))
      .join('');

    if (!childHtml) {
      return '';
    }

    const normalizedInheritedColor = normalizeDescriptionColor(inheritedColor);
    const wrappedHtml = normalizedColor
      && normalizedColor !== normalizedInheritedColor
      && normalizedColor !== normalizedFallbackColor
      ? `<span style="color: ${normalizedColor};">${childHtml}</span>`
      : childHtml;

    if (tagName === 'div' || tagName === 'p' || tagName === 'li') {
      return `${wrappedHtml}<br>`;
    }

    return wrappedHtml;
  };

  // 保留末尾 <br>，这样自定义描述输入框才能显示真正的末尾空行。
  return Array.from(container.childNodes)
    .map(node => serializeNode(node, normalizedFallbackColor))
    .join('');
}

// 用字符级 token 保留描述内容中的局部颜色，避免插入换行或调整颜色时丢失样式。
interface DescriptionCharToken {
  char: string;
  color?: string;
}

// 用纯文本偏移量记录选区，便于在 DOM 与文本模型之间来回同步光标位置。
interface DescriptionSelectionRange {
  start: number;
  end: number;
}

// 为自定义描述输入框维护最小历史快照，专门用于 Ctrl/Cmd+Z 撤销。
interface DescriptionHistorySnapshot {
  value: string;
  selection: DescriptionSelectionRange;
  fallbackColor: string;
}

// 将富文本内容拍平成字符 token，便于基于纯文本偏移做插入、删除和着色。
function descriptionHtmlToCharTokens(value?: string, fallbackColor?: string): DescriptionCharToken[] {
  if (!value) return [];

  const container = document.createElement('div');
  // 统一使用innerHTML赋值，让浏览器自动解码HTML实体
  // 注意：这里不再区分是否是富HTML，因为我们总是需要正确解码HTML实体
  container.innerHTML = value;
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

  // 保留末尾换行 token，避免自定义描述输入框在行尾按 Enter / Shift+Enter 后被重新序列化时丢失空行。
  return tokens;
}

// 将字符 token 重新序列化成编辑器可用 HTML，只在必要时输出带颜色的 span。
function descriptionCharTokensToHtml(tokens: DescriptionCharToken[], fallbackColor?: string): string {
  const normalizedFallbackColor = normalizeDescriptionColor(fallbackColor);
  let html = '';
  let activeColor: string | undefined;

  const closeColorSpan = () => {
    if (activeColor) {
      html += '</span>';
      activeColor = undefined;
    }
  };

  tokens.forEach(token => {
    if (token.char === '\n') {
      closeColorSpan();
      html += '<br>';
      return;
    }

    const normalizedColor = token.color && normalizeDescriptionColor(token.color) !== normalizedFallbackColor
      ? normalizeDescriptionColor(token.color)
      : undefined;

    if (normalizedColor !== activeColor) {
      closeColorSpan();
      if (normalizedColor) {
        html += `<span style="color: ${normalizedColor};">`;
        activeColor = normalizedColor;
      }
    }

    html += escapeDescriptionHtml(token.char);
  });

  closeColorSpan();
  // 保留末尾 <br>，确保自定义描述输入框的行尾换行能被真实渲染出来。
  return html;
}

// 按纯文本偏移插入或替换描述内容，同时保留未修改字符原有的局部颜色。
function insertDescriptionTextIntoHtml(value: string, start: number, end: number, insertion: string, fallbackColor?: string): string {
  const tokens = descriptionHtmlToCharTokens(value, fallbackColor);
  const replacementTokens = Array.from(insertion).map(char => ({ char }));
  const safeStart = Math.max(0, Math.min(start, tokens.length));
  const safeEnd = Math.max(safeStart, Math.min(end, tokens.length));

  tokens.splice(safeStart, safeEnd - safeStart, ...replacementTokens);
  return descriptionCharTokensToHtml(tokens, fallbackColor);
}

// 仅对选中文字打颜色，不改未选中的文本，满足“必须选中文字才能改字色”的需求。
function applyDescriptionColorToHtml(value: string, start: number, end: number, color: string, fallbackColor?: string): string {
  const tokens = descriptionHtmlToCharTokens(value, fallbackColor);
  const normalizedFallbackColor = normalizeDescriptionColor(fallbackColor);
  const normalizedColor = normalizeDescriptionColor(color);
  const safeStart = Math.max(0, Math.min(start, tokens.length));
  const safeEnd = Math.max(safeStart, Math.min(end, tokens.length));

  for (let index = safeStart; index < safeEnd; index += 1) {
    if (tokens[index].char === '\n') continue;
    tokens[index].color = normalizedColor === normalizedFallbackColor ? undefined : normalizedColor;
  }

  return descriptionCharTokensToHtml(tokens, fallbackColor);
}

// 读取当前选区颜色，便于在标题末端的颜色按钮上显示当前选中色。
function getDescriptionSelectionColor(value: string, start: number, end: number, fallbackColor?: string): string | null {
  const tokens = descriptionHtmlToCharTokens(value, fallbackColor);
  const normalizedFallbackColor = normalizeDescriptionColor(fallbackColor);
  const safeStart = Math.max(0, Math.min(start, tokens.length));
  const safeEnd = Math.max(safeStart, Math.min(end, tokens.length));
  const coloredTokens = tokens
    .slice(safeStart, safeEnd)
    .filter(token => token.char !== '\n');

  if (coloredTokens.length === 0) return null;

  const firstColor = coloredTokens[0].color || normalizedFallbackColor;
  return coloredTokens.every(token => (token.color || normalizedFallbackColor) === firstColor)
    ? firstColor
    : null;
}

// 计算任意节点在描述编辑器里的纯文本长度，<br> 按单个换行字符处理。
function getDescriptionNodeTextLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent || '').replace(/\u00A0/g, ' ').length;
  }

  if (node instanceof HTMLElement && node.tagName.toLowerCase() === 'br') {
    return 1;
  }

  let length = 0;
  node.childNodes.forEach(child => {
    length += getDescriptionNodeTextLength(child);
  });
  return length;
}

// 将 DOM 选区位置换算为纯文本偏移，便于复用既有的项目符号处理逻辑。
function getDescriptionTextOffset(root: Node, targetNode: Node, targetOffset: number): number {
  let offset = 0;

  const walk = (node: Node): boolean => {
    if (node === targetNode) {
      if (node.nodeType === Node.TEXT_NODE) {
        offset += (node.textContent || '').replace(/\u00A0/g, ' ').slice(0, targetOffset).length;
        return true;
      }

      if (node instanceof HTMLElement && node.tagName.toLowerCase() === 'br') {
        offset += Math.min(targetOffset, 1);
        return true;
      }

      for (let index = 0; index < targetOffset; index += 1) {
        offset += getDescriptionNodeTextLength(node.childNodes[index]);
      }
      return true;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      offset += (node.textContent || '').replace(/\u00A0/g, ' ').length;
      return false;
    }

    if (node instanceof HTMLElement && node.tagName.toLowerCase() === 'br') {
      offset += 1;
      return false;
    }

    return Array.from(node.childNodes).some(child => walk(child));
  };

  walk(root);
  return offset;
}

// 根据纯文本偏移反查 DOM 位置，用于在内容重写后把光标放回正确位置。
function resolveDescriptionDomPosition(root: HTMLElement, offset: number): { node: Node; offset: number } {
  const safeOffset = Math.max(0, offset);
  let remaining = safeOffset;

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
        if (node instanceof HTMLElement && node.tagName.toLowerCase() === 'br') return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_SKIP;
      }
    }
  );

  let currentNode = walker.nextNode();
  while (currentNode) {
    const currentLength = currentNode.nodeType === Node.TEXT_NODE
      ? (currentNode.textContent || '').replace(/\u00A0/g, ' ').length
      : 1;

    if (remaining <= currentLength) {
      if (currentNode.nodeType === Node.TEXT_NODE) {
        return { node: currentNode, offset: remaining };
      }

      const parentNode = currentNode.parentNode;
      if (!parentNode) break;
      // 这里显式收窄为 ChildNode，避免 TreeWalker 返回的 Node 类型触发索引类型报错。
      const nodeIndex = Array.from(parentNode.childNodes).indexOf(currentNode as ChildNode);
      return {
        node: parentNode,
        offset: remaining === 0 ? nodeIndex : nodeIndex + 1
      };
    }

    remaining -= currentLength;
    currentNode = walker.nextNode();
  }

  return {
    node: root,
    offset: root.childNodes.length
  };
}

// 获取当前描述编辑器里的纯文本选区，供换行、粘贴和颜色按钮复用。
function getDescriptionSelectionOffsets(editor: HTMLElement): DescriptionSelectionRange | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
    return null;
  }

  return {
    start: getDescriptionTextOffset(editor, range.startContainer, range.startOffset),
    end: getDescriptionTextOffset(editor, range.endContainer, range.endOffset)
  };
}

// 按纯文本偏移恢复选区，避免富文本内容更新后光标跳走。
function setDescriptionSelectionOffsets(editor: HTMLElement, start: number, end: number): void {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  const startPosition = resolveDescriptionDomPosition(editor, start);
  const endPosition = resolveDescriptionDomPosition(editor, end);

  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}

// 计算当前光标所在行的起止位置，供键盘编辑逻辑复用。
function getLineStart(value: string, position: number): number {
  return value.lastIndexOf('\n', Math.max(0, position - 1)) + 1;
}

function getLineEnd(value: string, position: number): number {
  const nextBreakIndex = value.indexOf('\n', position);
  return nextBreakIndex === -1 ? value.length : nextBreakIndex;
}

// 替换指定区间的文本，避免重复手写 slice 逻辑。
function replaceTextInRange(value: string, start: number, end: number, replacement: string): string {
  return `${value.slice(0, start)}${replacement}${value.slice(end)}`;
}

// 判断一行是否为项目符号行，以及是否已经删除到只剩项目符号。
function isDescriptionBulletLine(lineText: string): boolean {
  return DESCRIPTION_BULLET_REGEXP.test(lineText);
}

function isDescriptionEmptyBulletLine(lineText: string): boolean {
  return isDescriptionBulletLine(lineText) && !lineText.replace(DESCRIPTION_BULLET_REGEXP, '').trim();
}

// 找到当前条目的完整文本范围，便于二次 Backspace 直接删除整条目。
function findDescriptionItemRange(value: string, cursor: number): { start: number; end: number } {
  let itemStart = getLineStart(value, cursor);
  let itemLineEnd = getLineEnd(value, itemStart);

  while (itemStart > 0 && !isDescriptionBulletLine(value.slice(itemStart, itemLineEnd))) {
    itemStart = getLineStart(value, itemStart - 1);
    itemLineEnd = getLineEnd(value, itemStart);
  }

  let nextLineStart = itemLineEnd < value.length ? itemLineEnd + 1 : -1;
  while (nextLineStart !== -1 && nextLineStart < value.length) {
    const nextLineEnd = getLineEnd(value, nextLineStart);
    const nextLineText = value.slice(nextLineStart, nextLineEnd);
    if (isDescriptionBulletLine(nextLineText)) {
      return { start: itemStart, end: nextLineStart };
    }
    nextLineStart = nextLineEnd < value.length ? nextLineEnd + 1 : -1;
  }

  if (itemStart > 0) {
    return { start: itemStart - 1, end: value.length };
  }

  return { start: 0, end: value.length };
}

// 将描述输入内容拆分为结构化要点，兼容 Shift+Enter 产生的续行。
function extractDescriptionPoints(value?: string): string[] {
  if (!value) return [];

  const plainTextValue = descriptionHtmlToPlainText(value);
  if (!plainTextValue) return [];

  const points: string[] = [];
  let currentPointLines: string[] = [];

  const commitCurrentPoint = () => {
    if (currentPointLines.length === 0) return;

    const normalizedLines = [...currentPointLines];
    while (normalizedLines.length > 0 && !normalizedLines[0].trim()) normalizedLines.shift();
    while (normalizedLines.length > 0 && !normalizedLines[normalizedLines.length - 1].trim()) normalizedLines.pop();

    if (normalizedLines.some(line => line.trim())) {
      points.push(normalizedLines.join('\n'));
    }

    currentPointLines = [];
  };

  plainTextValue
    .replace(/\r\n/g, '\n')
    .split('\n')
    .forEach(line => {
      if (isDescriptionBulletLine(line)) {
        commitCurrentPoint();
        currentPointLines = [line.replace(DESCRIPTION_BULLET_REGEXP, '').trim()];
        return;
      }

      if (line.trim()) {
        if (currentPointLines.length === 0) {
          currentPointLines = [line.trim()];
        } else {
          currentPointLines.push(line.trim());
        }
        return;
      }

      if (currentPointLines.length > 0) {
        currentPointLines.push('');
      }
    });

  commitCurrentPoint();
  return points;
}

// 将单个要点重新格式化为“首行项目符号 + 续行缩进”的编辑器文本。
function formatDescriptionPoint(point: string): string {
  return point
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line, index) => {
      const normalizedLine = line.trim();
      if (index === 0) {
        return `${DESCRIPTION_BULLET}${normalizedLine}`;
      }
      return normalizedLine ? `${DESCRIPTION_CONTINUATION}${normalizedLine}` : DESCRIPTION_CONTINUATION;
    })
    .join('\n');
}

// 将要点重新格式化为编辑器里的项目符号文本。
function formatDescriptionPoints(points: string[]): string {
  if (points.length === 0) return '';
  return points.map(formatDescriptionPoint).join('\n');
}

// 多行纯文本粘贴时，自动批量转成项目符号列表。
function buildDescriptionPasteValue(rawText: string): string {
  const normalizedText = rawText.replace(/\r\n/g, '\n');
  const sourceLines = normalizedText.split('\n');
  const hasBulletPrefix = sourceLines.some(line => isDescriptionBulletLine(line));

  const points = hasBulletPrefix
    ? extractDescriptionPoints(normalizedText)
    : sourceLines.map(line => line.trim()).filter(Boolean);

  return formatDescriptionPoints(points);
}

// 初始化文字值时，兼容旧版自定义描述模块的 extra-desc-* 条目并合并回单输入框。
function createInitialTextValues(
  template: TemplateDefinition,
  initialTextValues: Record<string, string>
): Record<string, string> {
  const values: Record<string, string> = {};

  template.textFields.forEach(field => {
    values[field.id] = initialTextValues[field.id] ?? field.defaultValue;
  });

  Object.keys(initialTextValues).forEach(key => {
    if (key.startsWith('extra-impression-')) {
      values[key] = initialTextValues[key];
      return;
    }

    if (key.startsWith('extra-desc-') && !key.startsWith('extra-desc-custom-desc-')) {
      values[key] = initialTextValues[key];
    }
  });

  (template.containers || [])
    .filter(container => container.type === 'description' && container.id.startsWith('custom-desc-'))
    .forEach(container => {
      const fieldId = container.textFields[0]?.id;
      if (!fieldId) return;

      const legacyExtraPoints = Object.keys(initialTextValues)
        .filter(key => key.startsWith(`extra-desc-${container.id}-`))
        .sort((a, b) => {
          const indexA = parseInt(a.split('-').pop() || '0', 10);
          const indexB = parseInt(b.split('-').pop() || '0', 10);
          return indexA - indexB;
        })
        .flatMap(key => extractDescriptionPoints(initialTextValues[key]));

      const hasRichPrimaryValue = isDescriptionRichHtml(values[fieldId]);
      if (hasRichPrimaryValue && legacyExtraPoints.length === 0) {
        values[fieldId] = sanitizeDescriptionRichHtml(values[fieldId], initialTextValues[getDescriptionColorFieldId(fieldId)]);
      } else {
        const mergedPoints = [
          ...extractDescriptionPoints(values[fieldId]),
          ...legacyExtraPoints
        ];
        values[fieldId] = descriptionPlainTextToHtml(formatDescriptionPoints(mergedPoints));
      }

      const colorFieldId = getDescriptionColorFieldId(fieldId);
      if (initialTextValues[colorFieldId]) {
        values[colorFieldId] = normalizeDescriptionColor(initialTextValues[colorFieldId]);
      }
    });

  return values;
}

// 仅保留整体印象与旧版描述模块的动态条目状态，自定义描述模块改为单一输入框。
function createExtraDescItemsState(initialTextValues: Record<string, string>): Record<string, number[]> {
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
      if (moduleId.startsWith('custom-desc-')) return;
      if (!restored[moduleId]) restored[moduleId] = [];
      restored[moduleId].push(parseInt(descMatch[2], 10));
    }
  });

  return restored;
}

// 保存前清理自定义描述模块里的空项目符号，并规范颜色元数据。
function sanitizeCustomDescriptionTextValues(
  containers: ContainerPart[] | undefined,
  textValues: Record<string, string>
): Record<string, string> {
  if (!containers || containers.length === 0) return textValues;

  const sanitizedValues = { ...textValues };

  containers
    .filter(container => container.type === 'description' && container.id.startsWith('custom-desc-'))
    .forEach(container => {
      container.textFields.forEach(field => {
        sanitizedValues[field.id] = sanitizeDescriptionRichHtml(
          sanitizedValues[field.id] || descriptionPlainTextToHtml(formatDescriptionPoints(extractDescriptionPoints(sanitizedValues[field.id]))),
          sanitizedValues[getDescriptionColorFieldId(field.id)]
        );

        const colorFieldId = getDescriptionColorFieldId(field.id);
        const normalizedColor = normalizeDescriptionColor(sanitizedValues[colorFieldId]);
        if (normalizedColor === DEFAULT_DESCRIPTION_TEXT_COLOR) {
          delete sanitizedValues[colorFieldId];
        } else {
          sanitizedValues[colorFieldId] = normalizedColor;
        }
      });
    });

  return sanitizedValues;
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
    const values = createInitialTextValues(template, initialTextValues);
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
      const values = createInitialTextValues(template, initialTextValues);
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

    // 同步恢复 extraDescItems 状态（只保留整体印象与旧版描述条目）
    setExtraDescItems(createExtraDescItemsState(initialTextValues));
  }, [initialTextValues, template]);

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
  const [editingModuleTitleId, setEditingModuleTitleId] = useState<string | null>(null); // 当前正在编辑的右侧条目标题ID（复用 header 的双击编辑模式）
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
  const descriptionEditorRefs = useRef<Record<string, HTMLDivElement | null>>({}); // 自定义描述富文本输入区引用
  const descriptionSelectionRangesRef = useRef<Record<string, DescriptionSelectionRange>>({}); // 自定义描述最近一次选区
  const descriptionSelectionFrameRef = useRef<Record<string, number | null>>({}); // 自定义描述选区恢复帧，避免旧帧把光标跳回去
  const descriptionHistoryRef = useRef<Record<string, DescriptionHistorySnapshot[]>>({}); // 自定义描述撤销历史，仅作用于该富文本输入框
  const descriptionHistoryIndexRef = useRef<Record<string, number>>({}); // 自定义描述当前历史游标
  const descriptionPendingSnapshotRef = useRef<Record<string, DescriptionHistorySnapshot | null>>({}); // 原生输入前暂存快照，供 Ctrl/Cmd+Z 撤销使用
  const isApplyingDescriptionHistoryRef = useRef(false); // 正在应用撤销/重做时，避免重复记录历史
  const listStateManagersRef = useRef<Record<string, ListStateManager>>({}); // 列表状态管理器
  const listDispatchersRef = useRef<Record<string, KeyboardEventDispatcher>>({}); // 列表键盘事件分发器
  const listInputHandlersRef = useRef<Record<string, ReturnType<typeof createInputHandler>>>({}); // 列表输入处理器
  const isComposingRef = useRef(false); // IME组合状态（中文输入法等）

  // 获取或创建指定字段的列表状态管理器
  const getListStateManager = useCallback((fieldId: string): ListStateManager => {
    if (!listStateManagersRef.current[fieldId]) {
      listStateManagersRef.current[fieldId] = initializeListEditorState();
    }
    return listStateManagersRef.current[fieldId];
  }, []);

  // 获取或创建指定字段的键盘事件分发器
  const getListDispatcher = useCallback((fieldId: string): KeyboardEventDispatcher => {
    if (!listDispatchersRef.current[fieldId]) {
      const stateManager = getListStateManager(fieldId);
      listDispatchersRef.current[fieldId] = createConfiguredDispatcher(stateManager);
    }
    return listDispatchersRef.current[fieldId];
  }, [getListStateManager]);

  const getListInputHandler = useCallback((fieldId: string): ReturnType<typeof createInputHandler> => {
    if (!listInputHandlersRef.current[fieldId]) {
      listInputHandlersRef.current[fieldId] = createInputHandler();
    }
    return listInputHandlersRef.current[fieldId];
  }, []);
  const [activeDescriptionSelection, setActiveDescriptionSelection] = useState<{
    fieldId: string | null;
    start: number;
    end: number;
    color: string | null;
  }>({
    fieldId: null,
    start: 0,
    end: 0,
    color: null
  });

  const focusDescriptionField = useCallback((fieldId: string, start: number, end = start) => {
    const pendingFrame = descriptionSelectionFrameRef.current[fieldId];
    if (pendingFrame !== null && pendingFrame !== undefined) {
      cancelAnimationFrame(pendingFrame);
    }

    descriptionSelectionFrameRef.current[fieldId] = requestAnimationFrame(() => {
      descriptionSelectionFrameRef.current[fieldId] = null;
      const target = descriptionEditorRefs.current[fieldId];
      if (!target) return;
      if (document.activeElement !== target) {
        target.focus();
      }
      setDescriptionSelectionOffsets(target, start, end);
    });
  }, []);

  const captureDescriptionSnapshot = useCallback((
    fieldId: string,
    valueOverride?: string,
    selectionOverride?: DescriptionSelectionRange,
    fallbackColorOverride?: string
  ): DescriptionHistorySnapshot => {
    const editor = descriptionEditorRefs.current[fieldId];
    const fallbackColor = normalizeDescriptionColor(
      fallbackColorOverride || textValues[getDescriptionColorFieldId(fieldId)]
    );
    const rawValue = valueOverride ?? editor?.innerHTML ?? textValues[fieldId] ?? '';
    const sanitizedValue = sanitizeDescriptionRichHtml(rawValue, fallbackColor);
    const plainTextValue = descriptionHtmlToPlainText(sanitizedValue);
    const selection = selectionOverride
      || (editor ? getDescriptionSelectionOffsets(editor) : null)
      || descriptionSelectionRangesRef.current[fieldId]
      || { start: plainTextValue.length, end: plainTextValue.length };

    return {
      value: sanitizedValue,
      selection,
      fallbackColor
    };
  }, [textValues]);

  const recordDescriptionHistory = useCallback((fieldId: string, snapshot: DescriptionHistorySnapshot) => {
    const history = descriptionHistoryRef.current[fieldId] || [];
    const currentIndex = descriptionHistoryIndexRef.current[fieldId] ?? (history.length - 1);
    const activeSnapshot = currentIndex >= 0 ? history[currentIndex] : null;

    if (
      activeSnapshot
      && activeSnapshot.value === snapshot.value
      && activeSnapshot.selection.start === snapshot.selection.start
      && activeSnapshot.selection.end === snapshot.selection.end
      && activeSnapshot.fallbackColor === snapshot.fallbackColor
    ) {
      return;
    }

    const nextHistory = history.slice(0, currentIndex + 1);
    nextHistory.push(snapshot);

    if (nextHistory.length > DESCRIPTION_HISTORY_LIMIT) {
      nextHistory.shift();
    }

    descriptionHistoryRef.current[fieldId] = nextHistory;
    descriptionHistoryIndexRef.current[fieldId] = nextHistory.length - 1;
  }, []);

  const handleDescriptionTextChange = useCallback((
    fieldId: string,
    value: string,
    selection?: DescriptionSelectionRange,
    fallbackColorOverride?: string,
    historyBaseSnapshot?: DescriptionHistorySnapshot | null
  ) => {
    const fallbackColor = normalizeDescriptionColor(
      fallbackColorOverride || textValues[getDescriptionColorFieldId(fieldId)]
    );
    const sanitizedValue = sanitizeDescriptionRichHtml(value, fallbackColor);
    const plainTextValue = descriptionHtmlToPlainText(sanitizedValue).replace(/\r\n/g, '\n');
    const resolvedSelection = selection || { start: plainTextValue.length, end: plainTextValue.length };

    if (!isApplyingDescriptionHistoryRef.current && historyBaseSnapshot) {
      recordDescriptionHistory(fieldId, historyBaseSnapshot);
      recordDescriptionHistory(fieldId, {
        value: sanitizedValue,
        selection: resolvedSelection,
        fallbackColor
      });
    }

    if (!plainTextValue.trim()) {
      setTextValues(prev => ({
        ...prev,
        [fieldId]: ''
      }));

      if (selection) {
        const emptySelection = { start: 0, end: 0 };
        descriptionSelectionRangesRef.current[fieldId] = emptySelection;
        setActiveDescriptionSelection({ fieldId, ...emptySelection, color: null });
        focusDescriptionField(fieldId, 0);
      }
      return;
    }

    setTextValues(prev => ({
      ...prev,
      [fieldId]: sanitizedValue
    }));

    if (selection) {
      descriptionSelectionRangesRef.current[fieldId] = selection;
      setActiveDescriptionSelection({
        fieldId,
        start: selection.start,
        end: selection.end,
        color: selection.end > selection.start
          ? getDescriptionSelectionColor(sanitizedValue, selection.start, selection.end, fallbackColor)
          : null
      });
      focusDescriptionField(fieldId, selection.start, selection.end);
    }
  }, [focusDescriptionField, recordDescriptionHistory, textValues]);

  const handleDescriptionSelectionChange = useCallback((fieldId: string, currentValue: string) => {
    const editor = descriptionEditorRefs.current[fieldId];
    if (!editor) return;

    const selection = getDescriptionSelectionOffsets(editor);
    if (!selection) return;

    const fallbackColor = normalizeDescriptionColor(textValues[getDescriptionColorFieldId(fieldId)]);
    const liveValue = sanitizeDescriptionRichHtml(editor.innerHTML || currentValue, fallbackColor);
    descriptionSelectionRangesRef.current[fieldId] = selection;
    setActiveDescriptionSelection({
      fieldId,
      start: selection.start,
      end: selection.end,
      color: selection.end > selection.start
        ? getDescriptionSelectionColor(liveValue, selection.start, selection.end, fallbackColor)
        : null
    });
  }, [textValues]);

  const applyDescriptionHistorySnapshot = useCallback((fieldId: string, snapshot: DescriptionHistorySnapshot) => {
    const colorFieldId = getDescriptionColorFieldId(fieldId);

    setTextValues(prev => {
      const next = {
        ...prev,
        [fieldId]: snapshot.value
      };

      if (snapshot.fallbackColor === DEFAULT_DESCRIPTION_TEXT_COLOR) {
        delete next[colorFieldId];
      } else {
        next[colorFieldId] = snapshot.fallbackColor;
      }

      return next;
    });

    descriptionSelectionRangesRef.current[fieldId] = snapshot.selection;
    setActiveDescriptionSelection({
      fieldId,
      start: snapshot.selection.start,
      end: snapshot.selection.end,
      color: snapshot.selection.end > snapshot.selection.start
        ? getDescriptionSelectionColor(snapshot.value, snapshot.selection.start, snapshot.selection.end, snapshot.fallbackColor)
        : null
    });
    focusDescriptionField(fieldId, snapshot.selection.start, snapshot.selection.end);
  }, [focusDescriptionField]);

  const handleDescriptionColorChange = useCallback((fieldId: string, color: string) => {
    const editor = descriptionEditorRefs.current[fieldId];
    const fallbackColor = normalizeDescriptionColor(textValues[getDescriptionColorFieldId(fieldId)]);
    const currentValue = sanitizeDescriptionRichHtml(editor?.innerHTML || textValues[fieldId] || '', fallbackColor);
    const selection = (editor && getDescriptionSelectionOffsets(editor))
      || (activeDescriptionSelection.fieldId === fieldId
        ? { start: activeDescriptionSelection.start, end: activeDescriptionSelection.end }
        : descriptionSelectionRangesRef.current[fieldId]);

    if (!selection || selection.end <= selection.start) return;

    const plainTextValue = descriptionHtmlToPlainText(currentValue);
    const totalTextLength = plainTextValue.replace(/\n/g, '').length;
    const selectedTextLength = plainTextValue.slice(selection.start, selection.end).replace(/\n/g, '').length;
    if (selectedTextLength === 0) return;

    const historyBaseSnapshot = captureDescriptionSnapshot(fieldId, currentValue, selection, fallbackColor);
    const normalizedColor = normalizeDescriptionColor(color);
    const coversAllText = totalTextLength > 0
      && selection.start === 0
      && selection.end === plainTextValue.length
      && selectedTextLength === totalTextLength;

    let nextValue = applyDescriptionColorToHtml(currentValue, selection.start, selection.end, normalizedColor, fallbackColor);
    const colorFieldId = getDescriptionColorFieldId(fieldId);

    if (!isApplyingDescriptionHistoryRef.current) {
      recordDescriptionHistory(fieldId, historyBaseSnapshot);
    }

    if (coversAllText) {
      nextValue = sanitizeDescriptionRichHtml(nextValue, normalizedColor);
      setTextValues(prev => {
        const next = {
          ...prev,
          [fieldId]: nextValue
        };

        if (normalizedColor === DEFAULT_DESCRIPTION_TEXT_COLOR) {
          delete next[colorFieldId];
        } else {
          next[colorFieldId] = normalizedColor;
        }

        return next;
      });

      if (!isApplyingDescriptionHistoryRef.current) {
        recordDescriptionHistory(fieldId, {
          value: nextValue,
          selection,
          fallbackColor: normalizedColor
        });
      }
    } else {
      nextValue = sanitizeDescriptionRichHtml(nextValue, fallbackColor);
      setTextValues(prev => ({
        ...prev,
        [fieldId]: nextValue
      }));

      if (!isApplyingDescriptionHistoryRef.current) {
        recordDescriptionHistory(fieldId, {
          value: nextValue,
          selection,
          fallbackColor
        });
      }
    }

    descriptionSelectionRangesRef.current[fieldId] = selection;
    setActiveDescriptionSelection({
      fieldId,
      start: selection.start,
      end: selection.end,
      color: normalizedColor
    });
    focusDescriptionField(fieldId, selection.start, selection.end);
  }, [activeDescriptionSelection, captureDescriptionSnapshot, focusDescriptionField, recordDescriptionHistory, textValues]);

  const handleDescriptionFocus = useCallback((fieldId: string, currentValue: string) => {
    requestAnimationFrame(() => {
      const initialSnapshot = captureDescriptionSnapshot(fieldId, currentValue);
      if (!descriptionHistoryRef.current[fieldId]?.length) {
        recordDescriptionHistory(fieldId, initialSnapshot);
      }
      handleDescriptionSelectionChange(fieldId, currentValue);
    });
  }, [captureDescriptionSnapshot, handleDescriptionSelectionChange, recordDescriptionHistory]);

  const handleDescriptionBlur = useCallback((fieldId: string, currentValue: string) => {
    descriptionPendingSnapshotRef.current[fieldId] = null;

    if (extractDescriptionPoints(currentValue).length > 0) return;

    setTextValues(prev => ({
      ...prev,
      [fieldId]: ''
    }));
    descriptionSelectionRangesRef.current[fieldId] = { start: 0, end: 0 };

    setActiveDescriptionSelection(prev => (
      prev.fieldId === fieldId
        ? { fieldId, start: 0, end: 0, color: null }
        : prev
    ));
  }, []);

  const handleDescriptionBeforeInput = useCallback((fieldId: string) => {
    // 在浏览器真正改写 DOM 前记录快照，供 Ctrl/Cmd+Z 撤销普通输入。
    if (isComposingRef.current || isApplyingDescriptionHistoryRef.current) {
      return;
    }

    descriptionPendingSnapshotRef.current[fieldId] = captureDescriptionSnapshot(fieldId);
  }, [captureDescriptionSnapshot]);

  const handleDescriptionInput = useCallback((fieldId: string, event: React.FormEvent<HTMLDivElement>) => {
    // 如果正在IME组合中（如中文输入法），跳过处理，避免重复转义。
    if (isComposingRef.current) {
      return;
    }

    const element = event.currentTarget;
    const fallbackColor = normalizeDescriptionColor(textValues[getDescriptionColorFieldId(fieldId)]);
    const historyBaseSnapshot = descriptionPendingSnapshotRef.current[fieldId] || null;
    descriptionPendingSnapshotRef.current[fieldId] = null;
    const tokens = descriptionHtmlToCharTokens(element.innerHTML, fallbackColor);
    let normalizedHtml = descriptionCharTokensToHtml(tokens, fallbackColor);
    const plainText = descriptionHtmlToPlainText(normalizedHtml);
    // 选区偶发丢失时，退回到最近一次选区或文本末尾，确保自动格式化仍能触发。
    const selection = getDescriptionSelectionOffsets(element)
      || descriptionSelectionRangesRef.current[fieldId]
      || { start: plainText.length, end: plainText.length };

    const currentLineIndex = plainText.slice(0, selection.start).split('\n').length - 1;
    const inputHandler = getListInputHandler(fieldId);
    const result = inputHandler({
      text: plainText,
      cursorPosition: selection.start,
      currentLineIndex
    });

    if (result.handled && result.newText !== undefined) {
      normalizedHtml = descriptionPlainTextToHtml(result.newText);
      const nextCursor = result.newCursorPos ?? selection.start;
      handleDescriptionTextChange(
        fieldId,
        normalizedHtml,
        { start: nextCursor, end: nextCursor },
        fallbackColor,
        historyBaseSnapshot
      );
      return;
    }

    handleDescriptionTextChange(fieldId, normalizedHtml, selection, fallbackColor, historyBaseSnapshot);
  }, [getListInputHandler, handleDescriptionTextChange, textValues]);

  const handleDescriptionPaste = useCallback((fieldId: string, event: React.ClipboardEvent<HTMLDivElement>) => {
    const pastedText = event.clipboardData.getData('text/plain');
    if (!pastedText) return;

    event.preventDefault();

    const currentValue = textValues[fieldId] || '';
    const fallbackColor = normalizeDescriptionColor(textValues[getDescriptionColorFieldId(fieldId)]);
    const historyBaseSnapshot = captureDescriptionSnapshot(fieldId, currentValue);
    const selection = getDescriptionSelectionOffsets(event.currentTarget)
      || descriptionSelectionRangesRef.current[fieldId]
      || { start: descriptionHtmlToPlainText(currentValue).length, end: descriptionHtmlToPlainText(currentValue).length };
    const normalizedText = pastedText.replace(/\r\n/g, '\n');
    const nonEmptyLines = normalizedText.split('\n').filter(line => line.trim());
    const formattedText = nonEmptyLines.length > 1
      ? buildDescriptionPasteValue(normalizedText)
      : normalizedText;

    if (!formattedText) return;

    const currentPlainText = descriptionHtmlToPlainText(currentValue);
    const shouldReplaceAll = extractDescriptionPoints(currentValue).length === 0;

    if (shouldReplaceAll && nonEmptyLines.length > 1) {
      handleDescriptionTextChange(
        fieldId,
        descriptionPlainTextToHtml(formattedText),
        { start: formattedText.length, end: formattedText.length },
        fallbackColor,
        historyBaseSnapshot
      );
      return;
    }

    const prefix = currentPlainText.slice(0, selection.start);
    const suffix = currentPlainText.slice(selection.end);
    const needsLeadingNewline = nonEmptyLines.length > 1 && prefix.length > 0 && !prefix.endsWith('\n');
    const needsTrailingNewline = nonEmptyLines.length > 1 && suffix.length > 0 && !suffix.startsWith('\n');
    const insertion = `${needsLeadingNewline ? '\n' : ''}${formattedText}${needsTrailingNewline ? '\n' : ''}`;
    const nextValue = insertDescriptionTextIntoHtml(currentValue, selection.start, selection.end, insertion, fallbackColor);
    const nextCursor = selection.start + insertion.length;

    handleDescriptionTextChange(fieldId, nextValue, {
      start: nextCursor,
      end: nextCursor
    }, fallbackColor, historyBaseSnapshot);
  }, [captureDescriptionSnapshot, handleDescriptionTextChange, textValues]);




  const handleDescriptionKeyDown = useCallback((fieldId: string, event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentValue = textValues[fieldId] || '';
    const fallbackColor = normalizeDescriptionColor(textValues[getDescriptionColorFieldId(fieldId)]);
    // 优先读取当前 DOM 内容，避免刚输入完文字立刻回车时仍按旧状态文本处理。
    const liveHtml = event.currentTarget.innerHTML || currentValue;
    const livePlainText = descriptionHtmlToPlainText(liveHtml);
    const selection = getDescriptionSelectionOffsets(event.currentTarget)
      || descriptionSelectionRangesRef.current[fieldId]
      || { start: livePlainText.length, end: livePlainText.length };
    const { start, end } = selection;
    const history = descriptionHistoryRef.current[fieldId] || [];
    const historyIndex = descriptionHistoryIndexRef.current[fieldId] ?? (history.length - 1);

    // 拦截 Ctrl/Cmd+Z，仅作用于自定义描述输入框，避免 React 回写打断原生撤销栈。
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.altKey) {
      event.preventDefault();

      if (event.shiftKey) {
        const redoIndex = historyIndex + 1;
        if (redoIndex < history.length) {
          isApplyingDescriptionHistoryRef.current = true;
          descriptionHistoryIndexRef.current[fieldId] = redoIndex;
          applyDescriptionHistorySnapshot(fieldId, history[redoIndex]);
          requestAnimationFrame(() => {
            isApplyingDescriptionHistoryRef.current = false;
          });
        }
        return;
      }

      const latestSnapshot = captureDescriptionSnapshot(fieldId, liveHtml, selection, fallbackColor);
      const activeSnapshot = historyIndex >= 0 ? history[historyIndex] : null;
      if (
        !activeSnapshot
        || activeSnapshot.value !== latestSnapshot.value
        || activeSnapshot.selection.start !== latestSnapshot.selection.start
        || activeSnapshot.selection.end !== latestSnapshot.selection.end
        || activeSnapshot.fallbackColor !== latestSnapshot.fallbackColor
      ) {
        recordDescriptionHistory(fieldId, latestSnapshot);
      }

      const undoHistory = descriptionHistoryRef.current[fieldId] || [];
      const undoIndex = Math.max(0, (descriptionHistoryIndexRef.current[fieldId] ?? (undoHistory.length - 1)) - 1);
      if (undoHistory[undoIndex]) {
        isApplyingDescriptionHistoryRef.current = true;
        descriptionHistoryIndexRef.current[fieldId] = undoIndex;
        applyDescriptionHistorySnapshot(fieldId, undoHistory[undoIndex]);
        requestAnimationFrame(() => {
          isApplyingDescriptionHistoryRef.current = false;
        });
      }
      return;
    }

    // ===== 使用列表编辑工具处理键盘事件 =====
    // 只处理 Enter、Backspace、Tab 键，Enter 只走一条路径，避免重复处理导致需要按两次回车。
    if (['Enter', 'Backspace', 'Tab'].includes(event.key)) {
      const dispatcher = getListDispatcher(fieldId);
      const historyBaseSnapshot = captureDescriptionSnapshot(fieldId, liveHtml, selection, fallbackColor);
      
      // 创建一个原生键盘事件对象（用于分发器）
      const nativeEvent = {
        key: event.key,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        preventDefault: () => event.preventDefault(),
      } as KeyboardEvent;

      // 使用分发器处理事件
      const result = dispatcher.dispatch(nativeEvent, livePlainText, start, end);

      if (result.handled && result.newText !== undefined) {
        event.preventDefault();
        
        // 将纯文本转换回 HTML（保留颜色信息）
        const newHtml = descriptionPlainTextToHtml(result.newText);
        
        // 应用修改
        handleDescriptionTextChange(fieldId, newHtml, {
          start: result.newCursorPos ?? start,
          end: result.newCursorPos ?? start
        }, fallbackColor, historyBaseSnapshot);
        return;
      }

      // 列表分发器未处理 Enter 时，走普通换行后备逻辑（仍在同一个 if 块内，不会重复触发）。
      if (event.key === 'Enter') {
        event.preventDefault();
        const insertion = '\n';
        const nextValue = insertDescriptionTextIntoHtml(liveHtml, start, end, insertion, fallbackColor);
        const nextCursor = start + insertion.length;

        handleDescriptionTextChange(fieldId, nextValue, {
          start: nextCursor,
          end: nextCursor
        }, fallbackColor, historyBaseSnapshot);
        return;
      }
    }
  }, [applyDescriptionHistorySnapshot, captureDescriptionSnapshot, getListDispatcher, handleDescriptionTextChange, recordDescriptionHistory, textValues]);

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

  // 描述模块额外条目（动态添加）- 仅保留整体印象与旧版描述模块的兼容恢复
  const [extraDescItems, setExtraDescItems] = useState<Record<string, number[]>>(() => createExtraDescItemsState(initialTextValues));

  // 添加描述条目（当前仅用于整体印象模块）
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

  // 删除描述条目（当前仅用于整体印象模块）
  const removeDescItem = useCallback((moduleId: string, itemId: number) => {
    setExtraDescItems(prev => ({
      ...prev,
      [moduleId]: (prev[moduleId] || []).filter(id => id !== itemId)
    }));
    // 清理对应的文字值
    setTextValues(prev => {
      const newValues = { ...prev };
      const keyPrefix = moduleId === 'overall' ? 'extra-impression' : `extra-desc-${moduleId}`;
      delete newValues[`${keyPrefix}-${itemId}`];
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

    const sanitizedTextValues = sanitizeCustomDescriptionTextValues(localContainers, textValues);
    
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
    
    onSave(sanitizedTextValues, allImageValues);
  }, [validation, textValues, imageValues, extraImages, onSave, canEditContainers, localContainers, template, localTemplateName, localTemplateVersion, listEntryCounts, localFieldLabels]);

  // 导出（合并主图片和额外图片）
  const handleExport = useCallback(() => {
    if (!validation.isValid) {
      alert('请填写所有必填项:\n' + validation.errors.join('\n'));
      return;
    }

    const sanitizedTextValues = sanitizeCustomDescriptionTextValues(localContainers, textValues);
    
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
    
    onExport?.(sanitizedTextValues, allImageValues);
  }, [validation, textValues, imageValues, extraImages, onExport, canEditContainers, localContainers, template, localTemplateName, localTemplateVersion, listEntryCounts, localFieldLabels]);

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
<span className="badge-icon">☰</span>
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
          </div>
          {/* 显示当前选中的图片坑位提示 */}
          {selectedSlotId && (
            <div className="selected-slot-badge">
☰ 已选中: {selectedSlotId}
              <span className="paste-hint-inline">可粘贴图片</span>
            </div>
          )}
        </div>
        <div className="header-actions">
          <button className="btn-save" onClick={handleSave}>
保存草稿
          </button>
          <button className="btn-preview" onClick={() => setShowPreviewModal(true)}>
预览文档
          </button>
          <button className="btn-export" onClick={handleExport}>
↗ 生成发包文档
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
<button onClick={handleAddDescriptionModule}>✎ 描述模块</button>
                  <button onClick={handleAddListItemModule}>☰ 列表条目</button>
                  <button onClick={handleAddImageGroupModule}>▣ 图片组</button>
                  <button onClick={handleAddTableModule}>⊞ 表格</button>
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
                  placeholder={getTodayVersion()}
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

            const isCustomDescriptionModule = moduleType === 'description'
              && module.id.startsWith('custom-desc-')
              && moduleTextFields.length > 0;
            const customDescriptionField = isCustomDescriptionModule ? moduleTextFields[0] : null;
            const customDescriptionValue = customDescriptionField ? (textValues[customDescriptionField.id] || '') : '';
            const customDescriptionColor = customDescriptionField
              ? normalizeDescriptionColor(textValues[getDescriptionColorFieldId(customDescriptionField.id)])
              : DEFAULT_DESCRIPTION_TEXT_COLOR;
            const customDescriptionSelection = customDescriptionField && activeDescriptionSelection.fieldId === customDescriptionField.id
              ? activeDescriptionSelection
              : null;
            const canChangeDescriptionColor = Boolean(
              customDescriptionField
              && customDescriptionSelection
              && descriptionHtmlToPlainText(customDescriptionValue)
                .slice(customDescriptionSelection.start, customDescriptionSelection.end)
                .replace(/\n/g, '')
                .length > 0
            );
            const activeDescriptionColor = canChangeDescriptionColor
              ? (customDescriptionSelection?.color || customDescriptionColor)
              : null;

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

                  <div className="module-header-main">
                    {/* 自定义容器：完全复用 header 的展示态/编辑态结构，避免 h3 与 input 盒模型不一致导致视觉偏移。 */}
                    {canEditContainers && localContainers.some(c => c.id === module.id) ? (
                      editingModuleTitleId === module.id ? (
                        <input
                          type="text"
                          className="header-inline-input module-title-input module-title-input-inline"
                          value={module.title}
                          onChange={(e) => handleContainerLabelChange(module.id, e.target.value)}
                          placeholder="请输入条目标题"
                          autoFocus
                          onBlur={() => setEditingModuleTitleId(null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') setEditingModuleTitleId(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          draggable={false}
                        />
                      ) : (
                        <span
                          className="module-title module-title-editable"
                          title="双击编辑条目标题"
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditingModuleTitleId(module.id);
                          }}
                        >{module.title}</span>
                      )
                    ) : (
                      <span className="module-title">{module.title}</span>
                    )}
                  </div>

                  {/* 自定义描述模块：颜色控件放到标题末端，且仅在选中文字时允许改色 */}
                  {isCustomDescriptionModule && customDescriptionField && (
                    <div className="description-header-tools" onMouseDown={(e) => e.stopPropagation()}>
                      <span className="description-toolbar-label">字色</span>
                      <div className="description-color-options description-color-options-compact">
                        {DESCRIPTION_COLOR_OPTIONS.map(color => (
                          <button
                            key={color}
                            type="button"
                            className={`description-color-btn${activeDescriptionColor === color ? ' is-active' : ''}`}
                            style={{ backgroundColor: color }}
                            title={canChangeDescriptionColor ? `将选中文字设置为 ${color}` : '请先选中文字'}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleDescriptionColorChange(customDescriptionField.id, color)}
                            disabled={!canChangeDescriptionColor}
                          />
                        ))}
                        <input
                          type="color"
                          className="description-color-picker"
                          value={activeDescriptionColor || customDescriptionColor}
                          onChange={(e) => handleDescriptionColorChange(customDescriptionField.id, e.target.value)}
                          title={canChangeDescriptionColor ? '自定义选中文字颜色' : '请先选中文字'}
                          disabled={!canChangeDescriptionColor}
                        />
                      </div>
                    </div>
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
                    .filter(field => !(moduleType === 'description' && module.id.startsWith('custom-desc-') && field === moduleTextFields[0]))
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

                  {/* 自定义描述模块：单一项目符号输入区 */}
                  {moduleType === 'description' && module.id.startsWith('custom-desc-') && moduleTextFields.length > 0 && (() => {
                    const descriptionField = moduleTextFields[0];
                    const currentValue = textValues[descriptionField.id] || '';
                    const currentColor = normalizeDescriptionColor(textValues[getDescriptionColorFieldId(descriptionField.id)]);

                    return (
                      <div className="text-field-wrapper description-textarea-wrapper">
                        <div className="description-editor-shell">
                          <div
                            ref={node => {
                              descriptionEditorRefs.current[descriptionField.id] = node;
                            }}
                            className="field-input description-rich-editor"
                            contentEditable
                            suppressContentEditableWarning
                            role="textbox"
                            aria-multiline="true"
                            spellCheck={false}
                            data-placeholder="点击后输入内容，回车新增条目，Shift+Enter 条目内换行"
                            dangerouslySetInnerHTML={{ __html: currentValue }}
                            onBeforeInput={() => handleDescriptionBeforeInput(descriptionField.id)}
                            onInput={(e) => handleDescriptionInput(descriptionField.id, e)}
                            onCompositionStart={() => { isComposingRef.current = true; }}
                            onCompositionEnd={(e) => {
                              isComposingRef.current = false;
                              // 组合结束后，手动触发一次输入处理
                              handleDescriptionInput(descriptionField.id, e as unknown as React.FormEvent<HTMLDivElement>);
                            }}
                            onFocus={() => handleDescriptionFocus(descriptionField.id, currentValue)}
                            onBlur={() => handleDescriptionBlur(descriptionField.id, textValues[descriptionField.id] || '')}
                            onPaste={(e) => handleDescriptionPaste(descriptionField.id, e)}
                            onKeyDown={(e) => handleDescriptionKeyDown(descriptionField.id, e)}
                            onKeyUp={() => handleDescriptionSelectionChange(descriptionField.id, textValues[descriptionField.id] || '')}
                            onMouseUp={() => handleDescriptionSelectionChange(descriptionField.id, textValues[descriptionField.id] || '')}
                            style={{ color: currentColor }}
                          />
                        </div>
                      </div>
                    );
                  })()}

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