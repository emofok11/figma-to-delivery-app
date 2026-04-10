import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import { useToast, default as Toast } from '../components/Toast';

/**
 * 认证上下文类型定义
 */
interface AuthContextType {
  user: User | null;                           // 当前登录用户
  session: Session | null;                     // 当前会话
  loading: boolean;                            // 初始化加载状态
  sessionExpired: boolean;                     // 会话是否过期（用于提示用户）
  networkError: boolean;                       // 网络是否异常（用于显示重试按钮）
  signOut: () => Promise<void>;                // 登出方法
  clearSessionExpired: () => void;             // 清除过期提示
  retrySessionRecovery: () => void;            // 重试会话恢复
  verifyOtp: (email: string, token: string) => Promise<boolean>;  // 验证 OTP 验证码
  resendOtp: (email: string) => Promise<boolean>;                 // 重新发送验证码
  resendVerification: (email: string) => Promise<boolean>;        // 登录时为未验证账号发送验证码
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * 全局认证状态提供者
 * - 监听 Supabase Auth 状态变化
 * - 自动恢复会话（关闭浏览器后再次访问）
 * - 检测会话过期并提示用户
 * - 封装 OTP 验证与重发方法
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true); // 初始化时为 true，等待会话恢复
  const [sessionExpired, setSessionExpired] = useState(false);
  const [networkError, setNetworkError] = useState(false); // 网络异常标记
  const { toast, showSuccess, showError, dismiss } = useToast();
  const initSessionRef = useRef<() => void>(); // 保存初始化函数引用，供重试调用

  /** 初始化会话（可被重试调用） */
  const initSession = async () => {
    setLoading(true);
    setNetworkError(false);
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
    } catch (error) {
      console.warn('获取会话失败:', error);
      // 网络异常：标记并显示重试提示
      setNetworkError(true);
      showError('网络异常，请检查网络连接');
    } finally {
      setLoading(false);
    }
  };

  // 保存 initSession 引用供重试使用
  initSessionRef.current = initSession;

  useEffect(() => {
    // 1. 初始化：获取当前会话（自动恢复已有登录状态）
    initSession();

    // 2. 监听认证状态变化（登录、登出、Token 刷新、过期等）
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setNetworkError(false);

        // Token 刷新失败 → 会话过期
        if (event === 'TOKEN_REFRESHED' && !newSession) {
          setSessionExpired(true);
          setUser(null);
          setSession(null);
        }

        // 用户被登出（包括会话过期自动登出）
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setSession(null);
        }
      }
    );

    // 清理订阅
    return () => {
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 登出：销毁服务端会话 + 清除本地状态
   * 并显示"已成功退出登录"提示
   */
  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn('登出失败:', error);
    }
    // 清除本地残留的旧认证标记（兼容迁移期）
    sessionStorage.removeItem('ui_delivery_auth');
    sessionStorage.removeItem('ui_delivery_group');
    setUser(null);
    setSession(null);
    showSuccess('已成功退出登录');
  }, [showSuccess]);

  /**
   * 清除会话过期提示标记
   */
  const clearSessionExpired = useCallback(() => {
    setSessionExpired(false);
  }, []);

  /**
   * 重试会话恢复（网络异常后用户点击重试）
   */
  const retrySessionRecovery = useCallback(() => {
    initSessionRef.current?.();
  }, []);

  /**
   * 验证 OTP 验证码
   * @returns 验证是否成功
   */
  const verifyOtp = useCallback(async (email: string, token: string): Promise<boolean> => {
    try {
      const { error } = await supabase.auth.verifyOtp({
        type: 'signup',
        email,
        token,
      });
      if (error) {
        showError('验证码错误或已过期，请重新发送');
        return false;
      }
      showSuccess('验证成功，正在登录...');
      return true;
    } catch {
      showError('验证失败，请稍后重试');
      return false;
    }
  }, [showSuccess, showError]);

  /**
   * 重新发送注册验证码
   * @returns 发送是否成功
   */
  const resendOtp = useCallback(async (email: string): Promise<boolean> => {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      });
      if (error) {
        showError('发送失败，请稍后重试');
        return false;
      }
      showSuccess('验证码已重新发送');
      return true;
    } catch {
      showError('发送失败，请稍后重试');
      return false;
    }
  }, [showSuccess, showError]);

  /**
   * 为未验证账号发送验证码（登录时检测到 Email not confirmed 场景）
   * @returns 发送是否成功
   */
  const resendVerification = useCallback(async (email: string): Promise<boolean> => {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      });
      if (error) {
        showError('发送失败，请稍后重试');
        return false;
      }
      showSuccess('验证码已发送至您的邮箱');
      return true;
    } catch {
      showError('发送失败，请稍后重试');
      return false;
    }
  }, [showSuccess, showError]);

  return (
    <AuthContext.Provider value={{
      user, session, loading, sessionExpired, networkError,
      signOut, clearSessionExpired, retrySessionRecovery,
      verifyOtp, resendOtp, resendVerification,
    }}>
      {/* 全局 Toast 提示 */}
      <Toast toast={toast} onDismiss={dismiss} />
      {children}
    </AuthContext.Provider>
  );
};

/**
 * 自定义 Hook：获取认证上下文
 * 必须在 AuthProvider 内部使用
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth 必须在 AuthProvider 内部使用');
  }
  return context;
}
