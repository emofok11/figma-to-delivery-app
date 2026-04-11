import React, { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './Toast';
import { getAuthEmailRedirectUrl, getSupabaseConfig } from '../lib/supabaseConfig';
import { checkUsernameUnique, createProfile } from '../lib/profileService';
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

/** 用户名格式校验：2-20位，仅中英文、数字、下划线 */
const isValidUsername = (username: string): boolean =>
  username.length >= 2 && username.length <= 20 && /^[\u4e00-\u9fa5a-zA-Z0-9_]+$/.test(username);

/**
 * 邮箱脱敏显示（如 t***@gmail.com）
 */
const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  // 取首字符 + *** + @ + 域名
  return `${local[0]}***@${domain}`;
};

/**
 * 将 Supabase 错误信息转译为中文提示
 * 登录时对"邮箱未验证"特殊处理，其余统一显示"邮箱或密码错误"
 */
const translateError = (message: string, mode: AuthMode): string => {
  // 频率限制
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return '操作过于频繁，请稍后再试';
  }
  // 邮箱未验证（登录时特殊处理）
  if (message.includes('Email not confirmed')) {
    return 'ACCOUNT_NOT_CONFIRMED';
  }
  // 确认邮件发送失败
  if (message.includes('Error sending confirmation email')) {
    return '确认邮件发送失败，请检查邮件服务配置';
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
 * 支持流程：登录/注册表单 → OTP 验证码验证
 */
const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const {
    user, loading, sessionExpired, networkError,
    clearSessionExpired, retrySessionRecovery,
    resendVerification,
  } = useAuth();
  const { showSuccess, showError } = useToast();

  // 当前服务器环境标识
  const serverConfig = getSupabaseConfig();
  const authEmailRedirectUrl = getAuthEmailRedirectUrl();

  // 表单状态
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false); // 同步锁，防止快速双击穿透 useState 异步更新
  const lastSubmitTimeRef = useRef(0); // 上次提交时间戳，用于客户端冷却
  const SUBMIT_COOLDOWN_MS = 30_000; // 提交冷却期：30秒（防止频繁触发429）
  const RATE_LIMIT_COOLDOWN_MS = 60_000; // 429后的冷却期：60秒

  // 未验证账号状态（登录时检测到邮箱未确认）
  const [unconfirmedEmail, setUnconfirmedEmail] = useState(''); // 未验证的邮箱
  const [resendCooldown, setResendCooldown] = useState(0);     // 重发冷却倒计时（秒）
  const [submitCooldown, setSubmitCooldown] = useState(0);     // 提交冷却倒计时（秒，429后显示）
  const [resending, setResending] = useState(false);           // 重发确认邮件中

  /** 切换登录/注册模式 */
  const toggleMode = useCallback(() => {
    setMode(prev => prev === 'login' ? 'register' : 'login');
    setError('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setUsername('');
    setUsernameError('');
    setUnconfirmedEmail('');
  }, []);

  /** 清除未验证提示，返回正常登录状态 */
  const clearUnconfirmed = useCallback(() => {
    setUnconfirmedEmail('');
    setError('');
  }, []);

  /** 前端表单验证 */
  const validate = useCallback((): string | null => {
    if (mode === 'register') {
      if (!username.trim()) return '请输入用户名';
      if (username.trim().length < 2 || username.trim().length > 20) return '用户名长度需在2-20个字符之间';
      if (!isValidUsername(username.trim())) return '用户名只能包含中英文、数字和下划线';
      if (usernameError) return usernameError; // 唯一性校验失败时使用其错误信息
    }
    if (!email.trim()) return '请输入邮箱';
    if (!isValidEmail(email.trim())) return '邮箱格式不正确';
    if (!password) return '请输入密码';
    if (mode === 'register') {
      if (!isValidPassword(password)) return '密码至少8位，且需包含字母和数字';
      if (password !== confirmPassword) return '两次输入的密码不一致';
    }
    return null;
  }, [username, email, password, confirmPassword, mode, usernameError]);

  /** 重发确认邮件冷却倒计时 */
  React.useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => {
      setResendCooldown(prev => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  /** 提交冷却倒计时（429后显示，防止用户反复重试） */
  React.useEffect(() => {
    if (submitCooldown <= 0) return;
    const timer = setTimeout(() => {
      setSubmitCooldown(prev => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [submitCooldown]);

  /** 用户名失焦时校验唯一性 */
  const handleUsernameBlur = useCallback(async () => {
    const trimmed = username.trim();
    if (!trimmed || !isValidUsername(trimmed)) return; // 格式不对不查唯一性
    setCheckingUsername(true);
    setUsernameError('');
    const isUnique = await checkUsernameUnique(trimmed);
    setCheckingUsername(false);
    if (!isUnique) {
      setUsernameError('该用户名已被占用，请换一个');
    } else {
      setUsernameError('');
    }
  }, [username]);

  /** 提交表单：登录或注册 */
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    // 同步锁：防止快速双击穿透 useState 异步更新
    if (submittingRef.current) return;

    // 客户端冷却检查：防止短时间内重复提交触发429
    const now = Date.now();
    if (now - lastSubmitTimeRef.current < SUBMIT_COOLDOWN_MS) {
      const remainSec = Math.ceil((SUBMIT_COOLDOWN_MS - (now - lastSubmitTimeRef.current)) / 1000);
      setError(`操作过于频繁，请 ${remainSec} 秒后再试`);
      return;
    }

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    lastSubmitTimeRef.current = Date.now(); // 记录提交时间

    try {
      if (mode === 'login') {
        // ===== 登录 =====
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError) {
          const translated = translateError(authError.message, 'login');
          // 检测429频率限制 → 启动冷却倒计时
          if (authError.message.includes('rate limit') || authError.message.includes('too many requests') || authError.status === 429) {
            setError('操作过于频繁，请稍后再试');
            setSubmitCooldown(60); // 429后强制冷却60秒
          }
          // 检测"邮箱未验证"错误 → 发送确认邮件并显示提示界面
          else if (translated === 'ACCOUNT_NOT_CONFIRMED') {
            setUnconfirmedEmail(email.trim());
            // 自动发送一封确认邮件
            resendVerification(email.trim());
            setResendCooldown(60);
          } else {
            setError(translated);
          }
        } else {
          // 登录成功
          showSuccess('登录成功，欢迎回来');
        }
      } else {
        // ===== 注册 =====
        const signUpOptions = authEmailRedirectUrl
          ? { emailRedirectTo: authEmailRedirectUrl, data: { username: username.trim() } }
          : { data: { username: username.trim() } };
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: signUpOptions,
        });
        if (authError) {
          // 检测429频率限制 → 启动冷却倒计时
          if (authError.message.includes('rate limit') || authError.message.includes('too many requests') || authError.status === 429) {
            setError('操作过于频繁，请稍后再试');
            setSubmitCooldown(60);
          } else {
            setError(translateError(authError.message, 'register'));
          }
        } else if (!data.session) {
          // 注册成功但未自动登录 → 创建 profile
          if (data.user) {
            await createProfile(data.user.id, username.trim());
          }
          // Supabase 已发送确认邮件，提示用户去邮箱点击链接
          showSuccess('注册成功！确认邮件已发送，请前往邮箱点击确认链接后再登录');
          // 切换到登录模式
          setMode('login');
          setPassword('');
          setConfirmPassword('');
        }
        // data.session 存在 → 自动登录成功，创建 profile 并由 onAuthStateChange 更新状态
        if (!authError && data.session && data.user) {
          await createProfile(data.user.id, username.trim());
        }
      }
    } catch {
      setError('操作失败，请检查网络后重试');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [username, email, password, mode, validate, showSuccess, resendVerification, authEmailRedirectUrl]);

  /** 重新发送确认邮件（登录时账号未验证场景） */
  const handleResendVerification = useCallback(async () => {
    if (resendCooldown > 0 || !unconfirmedEmail) return;
    setResending(true);
    const result = await resendVerification(unconfirmedEmail);
    if (result.success) {
      setResendCooldown(60); // 60 秒冷却
    } else if (result.rateLimited) {
      setResendCooldown(60);
    }
    setResending(false);
  }, [unconfirmedEmail, resendCooldown, resendVerification]);

  // ===== 初始化加载中 =====
  if (loading) {
    return (
      <div className="auth-gate-overlay">
        <div className="auth-gate-card">
          <h1 className="auth-gate-title">VALM OS</h1>
          <p className="auth-gate-subtitle">TACTICAL DESIGN SYSTEM</p>
          <p className="auth-gate-loading">正在恢复会话...</p>
          {/* 网络异常时显示重试按钮 */}
          {networkError && (
            <button className="auth-gate-btn" onClick={retrySessionRecovery}>
              重试
            </button>
          )}
        </div>
      </div>
    );
  }

  // ===== 已登录，渲染子组件 =====
  if (user) {
    return <>{children}</>;
  }

  // ===== 未登录，显示认证界面 =====
  return (
    <div className="auth-gate-overlay">
      <div className="auth-gate-card">
        <h1 className="auth-gate-title">VALM OS</h1>
        <p className="auth-gate-subtitle">TACTICAL DESIGN SYSTEM</p>
        {!serverConfig.isProduction && (
          <p className="auth-gate-env-badge">{serverConfig.label}</p>
        )}

        {/* 会话过期提示 */}
        {sessionExpired && !unconfirmedEmail && (
          <p className="auth-gate-expired" onClick={clearSessionExpired}>
            登录已过期，请重新登录
          </p>
        )}

        {/* ===== 登录/注册表单 ===== */}
        {!unconfirmedEmail && (
          <>
            <form className="auth-gate-form" onSubmit={handleSubmit}>
              {/* 用户名输入（仅注册模式） */}
              {mode === 'register' && (
                <div className="auth-gate-input-wrapper">
                  <input
                    className={`auth-gate-input ${usernameError ? 'error' : ''}`}
                    type="text"
                    placeholder="请输入用户名..."
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setUsernameError(''); setError(''); }}
                    onBlur={handleUsernameBlur}
                    disabled={submitting || checkingUsername}
                  />
                  <p className="auth-gate-input-hint">2-20位，中英文、数字、下划线</p>
                  {checkingUsername && <p className="auth-gate-checking">正在检查用户名...</p>}
                  {usernameError && <p className="auth-gate-error" style={{ marginTop: '4px' }}>{usernameError}</p>}
                </div>
              )}

              {/* 邮箱输入 */}
              <div className="auth-gate-input-wrapper">
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
                disabled={submitting || submitCooldown > 0}
              >
                {submitCooldown > 0
                  ? `请稍候 (${submitCooldown}s)`
                  : submitting
                    ? (mode === 'login' ? '验证中...' : '注册中...')
                    : (mode === 'login' ? '进入作战系统' : '立即注册')
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
          </>
        )}

        {/* ===== 未验证账号提示 ===== */}
        {unconfirmedEmail && (
          <div className="auth-gate-otp">
            <p className="auth-gate-otp-hint">
              确认邮件已发送至 <strong>{maskEmail(unconfirmedEmail)}</strong>
            </p>
            <p className="auth-gate-otp-hint" style={{ marginTop: '8px', fontSize: '13px', opacity: 0.8 }}>
              请前往邮箱点击确认链接完成验证，验证后即可登录
            </p>

            {/* 重新发送确认邮件 */}
            <button
              className="auth-gate-btn"
              type="button"
              onClick={handleResendVerification}
              disabled={resendCooldown > 0 || resending}
              style={{ marginTop: '16px' }}
            >
              {resending
                ? '发送中...'
                : resendCooldown > 0
                  ? `重新发送确认邮件 (${resendCooldown}s)`
                  : '重新发送确认邮件'
              }
            </button>

            {/* 返回登录 */}
            <p className="auth-gate-switch">
              <button
                className="auth-gate-switch-btn"
                type="button"
                onClick={clearUnconfirmed}
              >
                返回登录
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthGate;
