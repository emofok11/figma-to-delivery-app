import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

/**
 * 认证上下文类型定义
 */
interface AuthContextType {
  user: User | null;           // 当前登录用户
  session: Session | null;     // 当前会话
  loading: boolean;            // 初始化加载状态
  sessionExpired: boolean;     // 会话是否过期（用于提示用户）
  signOut: () => Promise<void>; // 登出方法
  clearSessionExpired: () => void; // 清除过期提示
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * 全局认证状态提供者
 * - 监听 Supabase Auth 状态变化
 * - 自动恢复会话（关闭浏览器后再次访问）
 * - 检测会话过期并提示用户
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true); // 初始化时为 true，等待会话恢复
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    // 1. 初始化：获取当前会话（自动恢复已有登录状态）
    const initSession = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
      } catch (error) {
        console.warn('获取会话失败:', error);
      } finally {
        setLoading(false);
      }
    };

    initSession();

    // 2. 监听认证状态变化（登录、登出、Token 刷新、过期等）
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);

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
  }, []);

  /**
   * 登出：销毁服务端会话 + 清除本地状态
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
  }, []);

  /**
   * 清除会话过期提示标记
   */
  const clearSessionExpired = useCallback(() => {
    setSessionExpired(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, sessionExpired, signOut, clearSessionExpired }}>
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
