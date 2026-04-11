import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getAuthEmailRedirectUrl } from '../lib/supabaseConfig';
import { isAdmin as checkIsAdmin } from '../lib/profileService';
import type { User, Session } from '@supabase/supabase-js';
import { useToast, default as Toast } from '../components/Toast';

/**
 * 认证上下文类型定义
 */
/** 认证操作结果（支持429频率限制标记） */
export interface AuthResult {
  success: boolean;        // 操作是否成功
  rateLimited?: boolean;   // 是否触发了429频率限制
}

interface AuthContextType {
  user: User | null;                           // 当前登录用户
  session: Session | null;                     // 当前会话
  loading: boolean;                            // 初始化加载状态
  sessionExpired: boolean;                     // 会话是否过期（用于提示用户）
  networkError: boolean;                       // 网络是否异常（用于显示重试按钮）
  isAdmin: boolean;                            // 当前用户是否为管理员
  signOut: () => Promise<void>;                // 登出方法
  refreshSession: () => Promise<void>;         // 刷新会话（更新user_metadata等）
  clearSessionExpired: () => void;             // 清除过期提示
  retrySessionRecovery: () => void;            // 重试会话恢复
  resendVerification: (email: string) => Promise<AuthResult>;        // 重新发送确认邮件
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
  const [adminLoading, setAdminLoading] = useState(true);  // 管理员状态加载中
  const [isAdminState, setIsAdminState] = useState(false); // 管理员标记
  const { toast, showSuccess, showError, dismiss } = useToast();
  const initSessionRef = useRef<() => void>(); // 保存初始化函数引用，供重试调用
  const authEmailRedirectUrl = getAuthEmailRedirectUrl();

  /** 初始化会话（可被重试调用） */
  const initSession = async () => {
    setLoading(true);
    setNetworkError(false);
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      // 检查管理员状态（失败时静默处理，不影响正常会话恢复）
      if (currentSession?.user) {
        setAdminLoading(true);
        try {
          const admin = await checkIsAdmin(currentSession.user.id);
          setIsAdminState(admin);
        } catch {
          setIsAdminState(false);
        }
        setAdminLoading(false);
      } else {
        setIsAdminState(false);
        setAdminLoading(false);
      }
    } catch (error) {
      console.warn('获取会话失败:', error);
      // 网络异常：标记并显示重试提示
      setNetworkError(true);
      showError('网络异常，请检查网络连接');
      setIsAdminState(false);
      setAdminLoading(false);
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
      async (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setNetworkError(false);

        // 同步管理员状态（失败时静默处理）
        if (newSession?.user) {
          try {
            const admin = await checkIsAdmin(newSession.user.id);
            setIsAdminState(admin);
          } catch {
            setIsAdminState(false);
          }
        } else {
          setIsAdminState(false);
        }

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
   * 刷新会话：获取最新的用户信息（如 user_metadata 更新后）
   */
  const refreshSession = useCallback(async () => {
    try {
      const { data: { session: refreshedSession } } = await supabase.auth.refreshSession();
      setSession(refreshedSession);
      setUser(refreshedSession?.user ?? null);
    } catch (error) {
      console.warn('刷新会话失败:', error);
    }
  }, []);

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
   * 重新发送确认邮件（登录时检测到 Email not confirmed 场景）
   * @returns AuthResult（包含是否触发429频率限制标记）
   */
  const resendVerification = useCallback(async (email: string): Promise<AuthResult> => {
    try {
      const resendOptions = authEmailRedirectUrl
        ? { emailRedirectTo: authEmailRedirectUrl }
        : undefined;
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: resendOptions,
      });
      if (error) {
        // 检测429频率限制
        const isRateLimited = error.status === 429 ||
          error.message.includes('rate limit') ||
          error.message.includes('too many requests');
        if (isRateLimited) {
          showError('发送过于频繁，请稍后再试');
          return { success: false, rateLimited: true };
        }
        if (error.message.includes('Error sending confirmation email')) {
          showError('确认邮件发送失败，请检查邮件服务配置');
          return { success: false };
        }
        showError('发送失败，请稍后重试');
        return { success: false };
      }
      showSuccess('确认邮件已发送，请查收');
      return { success: true };
    } catch {
      showError('发送失败，请稍后重试');
      return { success: false };
    }
  }, [showSuccess, showError, authEmailRedirectUrl]);

  return (
    <AuthContext.Provider value={{
      user, session, loading, sessionExpired, networkError, isAdmin: isAdminState,
      signOut, refreshSession, clearSessionExpired, retrySessionRecovery,
      resendVerification,
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
