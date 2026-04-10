import React, { useState, useCallback, useRef } from 'react';
import './Toast.css';

/** Toast 类型：成功 / 错误 */
export type ToastType = 'success' | 'error';

/** Toast 数据 */
interface ToastData {
  id: number;         // 唯一标识
  message: string;    // 提示内容
  type: ToastType;    // 类型
}

/** useToast Hook 返回值 */
interface UseToastReturn {
  toast: ToastData | null;       // 当前 Toast
  showSuccess: (msg: string) => void;  // 显示成功提示
  showError: (msg: string) => void;    // 显示错误提示
  dismiss: () => void;                  // 手动关闭
}

/** 自增 ID 计数器 */
let toastIdCounter = 0;

/**
 * useToast Hook
 * - 同一时间仅显示最新一条 Toast（新提示替换旧提示）
 * - 3 秒自动消失
 */
export function useToast(): UseToastReturn {
  const [toast, setToast] = useState<ToastData | null>(null);
  // 使用 ref 保存定时器，避免组件卸载后仍触发 setState
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 清除定时器 */
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** 显示 Toast（新提示替换旧提示） */
  const showToast = useCallback((message: string, type: ToastType) => {
    // 清除旧定时器
    clearTimer();
    // 生成新 Toast
    const id = ++toastIdCounter;
    setToast({ id, message, type });
    // 3 秒后自动消失
    timerRef.current = setTimeout(() => {
      setToast(prev => (prev && prev.id === id ? null : prev));
      timerRef.current = null;
    }, 3000);
  }, [clearTimer]);

  /** 显示成功提示（绿色） */
  const showSuccess = useCallback((msg: string) => showToast(msg, 'success'), [showToast]);

  /** 显示错误提示（红色） */
  const showError = useCallback((msg: string) => showToast(msg, 'error'), [showToast]);

  /** 手动关闭 Toast */
  const dismiss = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  return { toast, showSuccess, showError, dismiss };
}

/**
 * Toast 渲染组件
 * 非模态，固定在页面顶部居中，不阻断用户操作
 */
const Toast: React.FC<{ toast: ToastData | null; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  if (!toast) return null;

  return (
    <div className={`toast-container toast-${toast.type}`} onClick={onDismiss}>
      {/* 类型图标 */}
      <span className="toast-icon">
        {toast.type === 'success' ? '✓' : '✕'}
      </span>
      {/* 提示内容 */}
      <span className="toast-message">{toast.message}</span>
    </div>
  );
};

export default Toast;
