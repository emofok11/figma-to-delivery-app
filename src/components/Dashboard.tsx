import React, { useState } from 'react';
import './Dashboard.css';

// 工具模块定义，预留后续扩展
interface ToolModule {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: 'active' | 'coming-soon';
}

// 当前已有的工具模块列表
const TOOL_MODULES: ToolModule[] = [
  {
    id: 'ui-delivery-template',
    name: 'UI发包模版',
    description: '击杀图标、列表表格等模版的创建、编辑与导出，支持历史记录管理',
    icon: '🎯',
    status: 'active',
  },
  // 预留：后续新增工具模块在此添加
  // {
  //   id: 'asset-manager',
  //   name: '素材管理',
  //   description: '游戏素材的统一管理与版本控制',
  //   icon: '📦',
  //   status: 'coming-soon',
  // },
];

interface DashboardProps {
  onEnterModule: (moduleId: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onEnterModule }) => {
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
            <span className="modules-count">{TOOL_MODULES.filter(m => m.status === 'active').length} 个可用</span>
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
                  <div className="module-icon">{module.icon}</div>
                  <div className="module-info">
                    <h3 className="module-name">{module.name}</h3>
                    <p className="module-desc">{module.description}</p>
                  </div>
                  <div className="module-action">
                    {module.status === 'active' ? (
                      <span className="module-enter">进入 →</span>
                    ) : (
                      <span className="module-coming">即将上线</span>
                    )}
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
