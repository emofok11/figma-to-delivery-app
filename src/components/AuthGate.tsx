import React, { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import './AuthGate.css';

/** 认证模式：登录 / 注册 */
type AuthMode = 'login' | 'register';

interface AuthGateProps {
  children: React.ReactNode;
}

// ===== 前端验证工具 =====

/** 邮箱格式校验 */
const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/** 密码强度校验：至少8位，包含字母和数字 */
const isValidPassword = (password: string): boolean =>
  password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);

/**
 * 将 Supabase 错误信息转译为中文提示
 * 登录时统一显示"邮箱或密码错误"，防止账号探测
 */
const translateError = (message: string, mode: AuthMode): string => {
  // 频率限制
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return '操作过于频繁，请稍后再试';
  }
  // 注册：邮箱已存在
  if (mode === 'register' && message.includes('already registered')) {
    return '该邮箱已被注册';
  }
  // 登录：统一错误提示（防止账号探测）
  if (mode === 'login' && message.includes('Invalid login credentials')) {
    return '邮箱或密码错误';
  }
  // 网络错误
  if (message.includes('fetch') || message.includes('network')) {
    return '网络连接失败，请检查网络后重试';
  }
  return mode === 'login' ? '邮箱或密码错误' : '注册失败，请重试';
};

/**
 * 认证门禁组件
 * 未登录时显示登录/注册表单，已登录时渲染子组件
 */
const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const { user, loading, sessionExpired, clearSessionExpired } = useAuth();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(''); // 注册时的确认密码
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  /** 切换登录/注册模式 */
  const toggleMode = useCallback(() => {
    setMode(prev => prev === 'login' ? 'register' : 'login');
    setError('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
  }, []);

  /** 前端表单验证 */
  const validate = useCallback((): string | null => {
    if (!email.trim()) return '请输入邮箱';
    if (!isValidEmail(email.trim())) return '邮箱格式不正确';
    if (!password) return '请输入密码';
    if (mode === 'register') {
      if (!isValidPassword(password)) return '密码至少8位，且需包含字母和数字';
      if (password !== confirmPassword) return '两次输入的密码不一致';
    }
    return null;
  }, [email, password, confirmPassword, mode]);

  /** 提交表单：登录或注册 */
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    // 前端验证
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      if (mode === 'login') {
        // ===== 登录 =====
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError) {
          setError(translateError(authError.message, 'login'));
        }
        // 登录成功后 onAuthStateChange 会自动更新 user 状态
      } else {
        // ===== 注册 =====
        const { error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (authError) {
          setError(translateError(authError.message, 'register'));
        }
        // 注册成功后 Supabase 自动登录，onAuthStateChange 更新状态
      }
    } catch {
      setError('操作失败，请检查网络后重试');
    } finally {
      setSubmitting(false);
    }
  }, [email, password, mode, validate]);

  // ===== 初始化加载中 =====
  if (loading) {
    return (
      <div className="auth-gate-overlay">
        <div className="auth-gate-card">
          <h1 className="auth-gate-title">VALM OS</h1>
          <p className="auth-gate-subtitle">TACTICAL DESIGN SYSTEM</p>
          <p className="auth-gate-loading">正在恢复会话...</p>
        </div>
      </div>
    );
  }

  // ===== 已登录，渲染子组件 =====
  if (user) {
    return <>{children}</>;
  }

  // ===== 未登录，显示登录/注册表单 =====
  return (
    <div className="auth-gate-overlay">
      <div className="auth-gate-card">
        <h1 className="auth-gate-title">VALM OS</h1>
        <p className="auth-gate-subtitle">TACTICAL DESIGN SYSTEM</p>

        {/* 会话过期提示 */}
        {sessionExpired && (
          <p className="auth-gate-expired" onClick={clearSessionExpired}>
            登录已过期，请重新登录
          </p>
        )}

        <form className="auth-gate-form" onSubmit={handleSubmit}>
          {/* 邮箱输入 */}
          <div className="auth-gate-input-wrapper">
            <label className="auth-gate-input-label">邮箱</label>
            <input
              className={`auth-gate-input ${error && !email.trim() ? 'error' : ''}`}
              type="email"
              placeholder="请输入邮箱地址..."
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              autoFocus
              disabled={submitting}
            />
          </div>

          {/* 密码输入 */}
          <div className="auth-gate-input-wrapper">
            <label className="auth-gate-input-label">密码</label>
            <input
              className={`auth-gate-input ${error && !password ? 'error' : ''}`}
              type="password"
              placeholder={mode === 'register' ? '至少8位，包含字母和数字' : '请输入密码...'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              disabled={submitting}
            />
          </div>

          {/* 确认密码（仅注册模式） */}
          {mode === 'register' && (
            <div className="auth-gate-input-wrapper">
              <label className="auth-gate-input-label">确认密码</label>
              <input
                className={`auth-gate-input ${error && password !== confirmPassword ? 'error' : ''}`}
                type="password"
                placeholder="请再次输入密码..."
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                disabled={submitting}
              />
            </div>
          )}

          {/* 错误提示 */}
          {error && <p className="auth-gate-error">{error}</p>}

          {/* 提交按钮 */}
          <button
            className="auth-gate-btn"
            type="submit"
            disabled={submitting}
          >
            {submitting
              ? (mode === 'login' ? '登录中...' : '注册中...')
              : (mode === 'login' ? '登录' : '注册')
            }
          </button>
        </form>

        {/* 模式切换链接 */}
        <p className="auth-gate-switch">
          {mode === 'login' ? '还没有账号？' : '已有账号？'}
          <button
            className="auth-gate-switch-btn"
            type="button"
            onClick={toggleMode}
            disabled={submitting}
          >
            {mode === 'login' ? '立即注册' : '返回登录'}
          </button>
        </p>
      </div>
    </div>
  );
};

export default AuthGate;
