import React from 'react';
import './DeleteButton.css';

/**
 * 删除按钮位置类型
 * - corner: 容器右上角（用于条目/容器删除）
 * - rightMiddle: 容器右侧垂直居中（用于输入框内删除）
 * - inline: 行内显示（用于列表项删除）
 */
export type DeleteButtonPosition = 'corner' | 'rightMiddle' | 'inline';

/**
 * 删除按钮大小
 * - small: 20px（用于小容器/输入框内）
 * - medium: 24px（默认，用于普通容器）
 * - large: 28px（用于大容器）
 */
export type DeleteButtonSize = 'small' | 'medium' | 'large';

export interface DeleteButtonProps {
  /** 点击回调 */
  onClick: () => void;
  /** 悬停提示 */
  title?: string;
  /** 按钮位置类型，默认 'corner' */
  position?: DeleteButtonPosition;
  /** 按钮大小，默认 'medium' */
  size?: DeleteButtonSize;
  /** 自定义类名 */
  className?: string;
  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * 通用删除按钮组件
 * 统一所有场景下删除按钮的样式和行为
 */
const DeleteButton: React.FC<DeleteButtonProps> = ({
  onClick,
  title = '删除',
  position = 'corner',
  size = 'medium',
  className = '',
  disabled = false,
}) => {
  // 组合类名
  const classNames = [
    'delete-btn',
    `delete-btn--${position}`,
    `delete-btn--${size}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      className={classNames}
      onClick={onClick}
      title={title}
      disabled={disabled}
      type="button"
    >
      ✕
    </button>
  );
};

export default DeleteButton;
