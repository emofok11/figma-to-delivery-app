import React, { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import './OtpInput.css';

/** OTP 输入框位数 */
const OTP_LENGTH = 6;

/** 暴露给父组件的方法 */
export interface OtpInputHandle {
  clear: () => void; // 清空所有输入框
}

interface OtpInputProps {
  /** 验证码输入完成时回调（6位全部填入后自动触发） */
  onComplete: (code: string) => void;
  /** 是否禁用输入（验证中状态） */
  disabled?: boolean;
}

/**
 * OTP 验证码输入组件
 * - 6 位数字逐位输入框
 * - 自动聚焦下一位
 * - Backspace 回退到上一位
 * - 粘贴 6 位验证码自动填充并触发验证
 * - 保持暗色调 Tactical Design 风格
 * - 通过 ref 暴露 clear() 方法供父组件调用
 */
const OtpInput = forwardRef<OtpInputHandle, OtpInputProps>(({ onComplete, disabled = false }, ref) => {
  // 每位数字的状态
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  // 每个输入框的 ref，用于程序化聚焦
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  /** 聚焦到指定位置的输入框 */
  const focusInput = useCallback((index: number) => {
    if (index >= 0 && index < OTP_LENGTH) {
      inputRefs.current[index]?.focus();
    }
  }, []);

  /** 清空所有输入并聚焦第一位 */
  const clear = useCallback(() => {
    setDigits(Array(OTP_LENGTH).fill(''));
    focusInput(0);
  }, [focusInput]);

  // 暴露 clear 方法给父组件
  useImperativeHandle(ref, () => ({ clear }), [clear]);

  /** 输入变化处理 */
  const handleChange = useCallback((index: number, value: string) => {
    // 只取数字
    const digit = value.replace(/\D/g, '').slice(-1);
    if (!digit) return;

    // 更新对应位
    setDigits(prev => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });

    // 自动聚焦下一位
    if (index < OTP_LENGTH - 1) {
      focusInput(index + 1);
    }
  }, [focusInput]);

  /** 键盘事件处理（Backspace 回退） */
  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        // 当前位有值 → 清空当前位
        setDigits(prev => {
          const next = [...prev];
          next[index] = '';
          return next;
        });
      } else if (index > 0) {
        // 当前位为空 → 清空前一位并聚焦
        setDigits(prev => {
          const next = [...prev];
          next[index - 1] = '';
          return next;
        });
        focusInput(index - 1);
      }
    }
  }, [digits, focusInput]);

  /** 粘贴处理（自动填充 6 位验证码） */
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    // 从剪贴板提取纯数字
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;

    // 填充各位
    const newDigits = Array(OTP_LENGTH).fill('');
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setDigits(newDigits);

    // 聚焦到最后一个填入位之后（或最后一位）
    const nextIndex = Math.min(pasted.length, OTP_LENGTH - 1);
    focusInput(nextIndex);
  }, [focusInput]);

  /** 当 6 位全部填入时自动触发 onComplete */
  useEffect(() => {
    const code = digits.join('');
    if (code.length === OTP_LENGTH && digits.every(d => d !== '')) {
      onComplete(code);
    }
  }, [digits, onComplete]);

  return (
    <div className="otp-input-wrapper">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={el => { inputRefs.current[index] = el; }}
          className="otp-input-box"
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={e => handleChange(index, e.target.value)}
          onKeyDown={e => handleKeyDown(index, e)}
          onPaste={handlePaste}
          disabled={disabled}
          autoFocus={index === 0}
          autoComplete="one-time-code"
        />
      ))}
    </div>
  );
});

OtpInput.displayName = 'OtpInput';

export default OtpInput;
