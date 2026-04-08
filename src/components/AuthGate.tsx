import React, { useState, useCallback } from 'react';
import { verifyPassword, isAuthenticated } from '../utils/auth';
import './AuthGate.css';

interface AuthGateProps {
  children: React.ReactNode;
}

/**
 * 认证门禁组件
 * 包裹应用主体，未认证时显示用户组输入页面
 */
const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const [authed, setAuthed] = useState(isAuthenticated());
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) {
      setError('请输入用户组标识');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const groupName = await verifyPassword(input.trim());
      if (groupName) {
        setAuthed(true);
      } else {
        setError('用户组标识无效，请重新输入');
        setInput('');
      }
    } catch {
      setError('验证失败，请重试');
    } finally {
      setLoading(false);
    }
  }, [input]);

  // 已认证，直接渲染子组件
  if (authed) {
    return <>{children}</>;
  }

  // 未认证，显示门禁页
  return (
    <div className="auth-gate-overlay">
      <div className="auth-gate-card">
        <h1 className="auth-gate-title">VALM OS</h1>
        <p className="auth-gate-subtitle">TACTICAL DESIGN SYSTEM</p>

        <form className="auth-gate-form" onSubmit={handleSubmit}>
          <div className="auth-gate-input-wrapper">
            <input
              className={`auth-gate-input ${error ? 'error' : ''}`}
              type="password"
              placeholder="请输入用户组标识..."
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError('');
              }}
              autoFocus
              disabled={loading}
            />
          </div>

          {error && <p className="auth-gate-error">{error}</p>}

          <button
            className="auth-gate-btn"
            type="submit"
            disabled={loading}
          >
            {loading ? '验证中...' : '进入作战系统'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AuthGate;
