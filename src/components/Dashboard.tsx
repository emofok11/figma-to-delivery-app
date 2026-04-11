import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import './Dashboard.css';

// 工具模块定义，预留后续扩展
interface ToolModule {
  id: string;
  name: string;
  description: string;
  icon?: string;
  status: 'active' | 'coming-soon';
}

// 当前已有的工具模块列表
const TOOL_MODULES: ToolModule[] = [
  {
    id: 'ui-delivery-template',
    name: '发包模版',
    description: '击杀图标、列表表格等模版的创建、编辑与导出，支持历史记录管理',
    status: 'active',
  },
  {
    id: 'design-review',
    name: '设计审核',
    description: '设计稿审核流程管理，支持多轮评审与反馈跟踪',
    status: 'coming-soon',
  },
  {
    id: 'design-spec',
    name: '设计规范',
    description: '统一视觉设计规范与组件标准，确保设计一致性',
    status: 'coming-soon',
  },
  {
    id: 'design-generation',
    name: '设计生成',
    description: 'AI驱动的设计稿自动生成，快速产出高质量视觉方案',
    status: 'coming-soon',
  },
];

interface DashboardProps {
  onEnterModule: (moduleId: string) => void;
  onOpenSettings: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onEnterModule, onOpenSettings }) => {
  const { user, signOut } = useAuth();

  /** 获取显示名称：优先用户名，回退邮箱前缀 */
  const displayName = user?.user_metadata?.username || (user?.email ? user.email.split('@')[0] : '');

  return (
    <div className="dashboard">
      {/* 顶部导航栏 - 红色 */}
      <header className="dashboard-topbar">
        <div className="topbar-left">
          <div className="topbar-brand">
            <span className="brand-name">VALM OS</span>
          </div>
          <span className="brand-version">v1</span>
        </div>
        <div className="topbar-right">
          <span className="topbar-slogan">TACTICAL DESIGN SYSTEM</span>
          {/* 用户信息与登出按钮 */}
          {user && (
            <div className="topbar-user">
              <span className="topbar-username" onClick={onOpenSettings} title="点击进入用户设置">{displayName}</span>
              <button className="topbar-logout-btn" onClick={signOut}>登出</button>
            </div>
          )}
        </div>
      </header>

      {/* 主内容区 - 黑色背景 */}
      <main className="dashboard-main">
        {/* 欢迎区域 */}
        <section className="dashboard-hero">
          <div className="hero-content">
            <h1 className="hero-title">VALM OS</h1>
<p className="hero-subtitle">无畏契约手游 · 视觉设计系统</p>
            <div className="hero-divider"></div>
          </div>
        </section>

        {/* 工具模块网格 */}
        <section className="dashboard-modules">
          <div className="modules-header">
            <h2 className="modules-title">工具模块</h2>
          </div>

          <div className="modules-grid">
            {TOOL_MODULES.map((module) => (
              <div
                key={module.id}
                className={`module-card ${module.status === 'coming-soon' ? 'disabled' : ''}`}
                onClick={() => {
                  if (module.status === 'active') {
                    onEnterModule(module.id);
                  }
                }}
              >
                <div className="module-card-accent"></div>
                <div className="module-card-body">
                  <div className="module-info">
                    <h3 className="module-name">{module.name}</h3>
                    <p className="module-desc">{module.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* 底部信息 */}
      <footer className="dashboard-footer">
        <span>VALM OS v1 · Tactical Design System</span>
      </footer>
    </div>
  );
};

export default Dashboard;
