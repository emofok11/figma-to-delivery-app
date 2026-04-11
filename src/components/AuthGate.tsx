import React, { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './Toast';
import OtpInput, { OtpInputHandle } from './OtpInput';
import { getSupabaseConfig } from '../lib/supabaseConfig';
import './AuthGate.css';

/** 认证步骤：登录/注册表单 → OTP 验证 */
type AuthStep = 'form' | 'otp';

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
    verifyOtp, resendOtp,
  } = useAuth();
  const { showSuccess, showError } = useToast();

  // 当前服务器环境标识
  const serverConfig = getSupabaseConfig();

  // 表单状态
  const [step, setStep] = useState<AuthStep>('form');
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false); // 同步锁，防止快速双击穿透 useState 异步更新
  const lastSubmitTimeRef = useRef(0); // 上次提交时间戳，用于客户端冷却
  const SUBMIT_COOLDOWN_MS = 30_000; // 提交冷却期：30秒（防止频繁触发429）
  const RATE_LIMIT_COOLDOWN_MS = 60_000; // 429后的冷却期：60秒

  // OTP 验证状态
  const [otpVerifying, setOtpVerifying] = useState(false);    // 验证码验证中
  const otpVerifyingRef = useRef(false); // 同步锁，防止 OTP 验证重复提交
  const [resendCooldown, setResendCooldown] = useState(0);     // 重发冷却倒计时（秒）
  const [submitCooldown, setSubmitCooldown] = useState(0);     // 提交冷却倒计时（秒，429后显示）
  const otpInputRef = useRef<OtpInputHandle>(null); // OTP 输入框引用

  /** 切换登录/注册模式 */
  const toggleMode = useCallback(() => {
    setMode(prev => prev === 'login' ? 'register' : 'login');
    setError('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setStep('form');
  }, []);

  /** 返回登录表单（从 OTP 验证界面） */
  const backToLogin = useCallback(() => {
    setStep('form');
    setMode('login');
    setError('');
    setPassword('');
    setConfirmPassword('');
    setOtpVerifying(false);
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

  /** 进入 OTP 验证步骤 */
  const enterOtpStep = useCallback(() => {
    setStep('otp');
    setResendCooldown(60); // 进入验证步骤即开始 60 秒冷却
  }, []);

  /** 重发验证码冷却倒计时 */
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
          // 检测"邮箱未验证"错误 → 直接提示（暂不跳转OTP验证）
          else if (translated === 'ACCOUNT_NOT_CONFIRMED') {
            setError('账号未验证，请联系管理员或稍后重试');
          } else {
            setError(translated);
          }
        } else {
          // 登录成功
          showSuccess('登录成功，欢迎回来');
        }
      } else {
        // ===== 注册 =====
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
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
          // 注册成功，需邮箱确认（当前跳过OTP，直接提示用户）
          showSuccess('注册成功，请使用注册的邮箱和密码登录');
        }
        // data.session 存在 → 自动登录成功，onAuthStateChange 会更新状态
      }
    } catch {
      setError('操作失败，请检查网络后重试');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [email, password, mode, validate, showSuccess, enterOtpStep]);

  /** OTP 验证码输入完成回调（6位全部填入后自动触发） */
  const handleOtpComplete = useCallback(async (code: string) => {
    // 同步锁：防止重复触发验证请求
    if (otpVerifyingRef.current) return;
    otpVerifyingRef.current = true;
    setOtpVerifying(true);

    const result = await verifyOtp(email.trim(), code);
    if (result.success) {
      // 验证成功，onAuthStateChange 会更新 user 状态，自动跳转
    } else if (result.rateLimited) {
      // 429频率限制 → 启动冷却倒计时，清空输入框
      setSubmitCooldown(60);
      otpInputRef.current?.clear();
    } else {
      // 验证失败，清空输入框
      otpInputRef.current?.clear();
    }

    otpVerifyingRef.current = false;
    setOtpVerifying(false);
  }, [email, verifyOtp]);

  /** 重新发送验证码 */
  const handleResend = useCallback(async () => {
    if (resendCooldown > 0) return;
    const result = await resendOtp(email.trim());
    if (result.success) {
      setResendCooldown(60); // 重新开始 60 秒冷却
    } else if (result.rateLimited) {
      // 429频率限制 → 启动冷却倒计时，防止用户反复重试
      setResendCooldown(60);
    }
  }, [email, resendCooldown, resendOtp]);

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
        {sessionExpired && step === 'form' && (
          <p className="auth-gate-expired" onClick={clearSessionExpired}>
            登录已过期，请重新登录
          </p>
        )}

        {/* ===== 步骤1：登录/注册表单 ===== */}
        {step === 'form' && (
          <>
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
                disabled={submitting || submitCooldown > 0}
              >
                {submitCooldown > 0
                  ? `请稍候 (${submitCooldown}s)`
                  : submitting
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
          </>
        )}

        {/* ===== 步骤2：OTP 验证码输入 ===== */}
        {step === 'otp' && (
          <div className="auth-gate-otp">
            {/* 提示文字 */}
            <p className="auth-gate-otp-hint">
              验证码已发送至 <strong>{maskEmail(email.trim())}</strong>
            </p>

            {/* 6 位验证码输入框 */}
            <OtpInput
              ref={otpInputRef}
              onComplete={handleOtpComplete}
              disabled={otpVerifying}
            />

            {/* 验证中状态提示 */}
            {otpVerifying && (
              <p className="auth-gate-otp-verifying">验证中...</p>
            )}

            {/* 重新发送验证码按钮 */}
            <button
              className="auth-gate-otp-resend"
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0}
            >
              {resendCooldown > 0
                ? `重新发送 (${resendCooldown}s)`
                : '重新发送验证码'
              }
            </button>

            {/* 返回登录 */}
            <p className="auth-gate-switch">
              <button
                className="auth-gate-switch-btn"
                type="button"
                onClick={backToLogin}
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
