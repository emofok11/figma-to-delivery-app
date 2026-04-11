import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './Toast';
import {
  listAllUsers,
  banUser,
  unbanUser,
  adminUpdateUsername,
  changeUserRole,
  deleteUserProfile,
  type ProfileData,
  type UserRole,
  ROLE_LABELS,
} from '../lib/profileService';
import './UserManagement.css';

interface UserManagementProps {
  onBack: () => void;
}

type ModalType = 'edit-username' | 'ban' | 'role' | 'delete' | null;

interface ModalState {
  type: ModalType;
  user: ProfileData | null;
}

const UserManagement: React.FC<UserManagementProps> = ({ onBack }) => {
  const { user: currentUser, isSuperAdmin } = useAuth();
  const { showSuccess, showError } = useToast();

  const [users, setUsers] = useState<ProfileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // 弹窗状态
  const [modal, setModal] = useState<ModalState>({ type: null, user: null });
  const [modalInput, setModalInput] = useState('');
  const [modalError, setModalError] = useState('');
  const [modalSaving, setModalSaving] = useState(false);
  // 角色变更弹窗：选择目标角色
  const [selectedRole, setSelectedRole] = useState<UserRole>('user');

  // 加载用户列表
  const loadUsers = useCallback(async () => {
    setLoading(true);
    const list = await listAllUsers();
    setUsers(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // 过滤用户
  const filteredUsers = users.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
    );
  });

  // 统计
  const totalCount = users.length;
  const superAdminCount = users.filter((u) => u.role === 'super_admin').length;
  const adminCount = users.filter((u) => u.role === 'admin').length;
  const bannedCount = users.filter((u) => u.banned).length;

  // 判断是否为自身
  const isSelf = (userId: string) => userId === currentUser?.id;

  // 判断目标用户是否为管理员或超级管理员
  const isTargetAdmin = (u: ProfileData) => u.role === 'admin' || u.role === 'super_admin';

  // ===== 弹窗操作 =====
  const openModal = (type: ModalType, user: ProfileData) => {
    setModal({ type, user });
    setModalInput(type === 'edit-username' ? user.username : '');
    setModalError('');
    setModalSaving(false);
    if (type === 'role') {
      // 默认选择当前角色的反向：管理员→普通用户，普通用户→管理员
      setSelectedRole(user.role === 'admin' ? 'user' : user.role === 'user' ? 'admin' : 'user');
    }
  };

  const closeModal = () => {
    setModal({ type: null, user: null });
    setModalInput('');
    setModalError('');
    setModalSaving(false);
  };

  // 修改用户名
  const handleSaveUsername = async () => {
    if (!modal.user) return;
    const trimmed = modalInput.trim();
    if (!trimmed) { setModalError('请输入用户名'); return; }
    if (trimmed.length < 2 || trimmed.length > 20) { setModalError('用户名需2-20位'); return; }

    setModalSaving(true);
    const ok = await adminUpdateUsername(modal.user.id, trimmed);
    setModalSaving(false);
    if (ok) {
      showSuccess('用户名修改成功');
      closeModal();
      loadUsers();
    } else {
      setModalError('修改失败，请重试');
    }
  };

  // 封禁用户（仅可封禁普通用户）
  const handleBan = async () => {
    if (!modal.user) return;
    setModalSaving(true);
    const ok = await banUser(modal.user.id, modalInput.trim() || undefined);
    setModalSaving(false);
    if (ok) {
      showSuccess('用户已封禁');
      closeModal();
      loadUsers();
    } else {
      setModalError('封禁失败，请重试');
    }
  };

  // 解封用户
  const handleUnban = async (userId: string) => {
    const ok = await unbanUser(userId);
    if (ok) {
      showSuccess('用户已解封');
      loadUsers();
    } else {
      showError('解封失败，请重试');
    }
  };

  // 修改角色（仅超级管理员可用）
  const handleChangeRole = async () => {
    if (!modal.user) return;
    setModalSaving(true);
    const ok = await changeUserRole(modal.user.id, selectedRole);
    setModalSaving(false);
    if (ok) {
      showSuccess(`角色已变更为${ROLE_LABELS[selectedRole]}`);
      closeModal();
      loadUsers();
    } else {
      setModalError('角色变更失败，请重试');
    }
  };

  // 删除用户
  const handleDelete = async () => {
    if (!modal.user) return;
    setModalSaving(true);
    const ok = await deleteUserProfile(modal.user.id);
    setModalSaving(false);
    if (ok) {
      showSuccess('用户已删除');
      closeModal();
      loadUsers();
    } else {
      setModalError('删除失败，请重试');
    }
  };

  // 格式化日期
  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // 角色标签样式映射
  const getRoleTagClass = (role: UserRole) => {
    switch (role) {
      case 'super_admin': return 'super-admin';
      case 'admin': return 'admin';
      default: return 'user';
    }
  };

  // 渲染弹窗
  const renderModal = () => {
    if (!modal.type || !modal.user) return null;

    const u = modal.user;

    return (
      <div className="um-modal-overlay" onClick={closeModal}>
        <div className="um-modal" onClick={(e) => e.stopPropagation()}>
          {modal.type === 'edit-username' && (
            <>
              <h3 className="um-modal-title">修改用户名</h3>
              <div className="um-modal-field">
                <div className="um-modal-label">当前用户名：{u.username}</div>
                <input
                  className="um-modal-input"
                  value={modalInput}
                  onChange={(e) => { setModalInput(e.target.value); setModalError(''); }}
                  placeholder="输入新用户名..."
                  disabled={modalSaving}
                />
                {modalError && <div className="um-modal-error">{modalError}</div>}
              </div>
              <div className="um-modal-actions">
                <button className="btn-primary" onClick={handleSaveUsername} disabled={modalSaving}>
                  {modalSaving ? '保存中...' : '保存'}
                </button>
                <button className="btn-secondary" onClick={closeModal} disabled={modalSaving}>取消</button>
              </div>
            </>
          )}

          {modal.type === 'ban' && (
            <>
              <h3 className="um-modal-title">封禁用户</h3>
              <div className="um-modal-field">
                <div className="um-modal-label">用户：{u.username}（{ROLE_LABELS[u.role]}）</div>
                <input
                  className="um-modal-input"
                  value={modalInput}
                  onChange={(e) => { setModalInput(e.target.value); setModalError(''); }}
                  placeholder="封禁原因（可选）..."
                  disabled={modalSaving}
                />
                {modalError && <div className="um-modal-error">{modalError}</div>}
              </div>
              <div className="um-modal-actions">
                <button className="btn-danger" onClick={handleBan} disabled={modalSaving}>
                  {modalSaving ? '封禁中...' : '确认封禁'}
                </button>
                <button className="btn-secondary" onClick={closeModal} disabled={modalSaving}>取消</button>
              </div>
            </>
          )}

          {modal.type === 'role' && (
            <>
              <h3 className="um-modal-title">变更角色</h3>
              <div className="um-modal-field">
                <div className="um-modal-label">
                  用户：{u.username}，当前角色：{ROLE_LABELS[u.role]}
                </div>
                <div className="um-role-select-group">
                  {(['admin', 'user'] as UserRole[]).map((r) => (
                    <label key={r} className={`um-role-option ${selectedRole === r ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="role-select"
                        value={r}
                        checked={selectedRole === r}
                        onChange={() => setSelectedRole(r)}
                        disabled={modalSaving}
                      />
                      <span className="um-role-option-label">{ROLE_LABELS[r]}</span>
                    </label>
                  ))}
                </div>
                {modalError && <div className="um-modal-error">{modalError}</div>}
              </div>
              <div className="um-modal-actions">
                <button className="btn-primary" onClick={handleChangeRole} disabled={modalSaving || selectedRole === u.role}>
                  {modalSaving ? '变更中...' : '确认变更'}
                </button>
                <button className="btn-secondary" onClick={closeModal} disabled={modalSaving}>取消</button>
              </div>
            </>
          )}

          {modal.type === 'delete' && (
            <>
              <h3 className="um-modal-title">删除用户</h3>
              <div className="um-modal-field">
                <div className="um-modal-label">
                  确定要删除用户 <strong>{u.username}</strong>（{ROLE_LABELS[u.role]}）吗？此操作不可恢复。
                </div>
                <div className="um-modal-label" style={{ color: 'rgba(255,70,85,0.7)' }}>
                  注意：仅删除 profiles 记录，auth.users 需在 Supabase 后台手动删除。
                </div>
                {modalError && <div className="um-modal-error">{modalError}</div>}
              </div>
              <div className="um-modal-actions">
                <button className="btn-danger" onClick={handleDelete} disabled={modalSaving}>
                  {modalSaving ? '删除中...' : '确认删除'}
                </button>
                <button className="btn-secondary" onClick={closeModal} disabled={modalSaving}>取消</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="user-management">
      {/* 顶部导航栏 */}
      <header className="user-management-topbar">
        <div className="topbar-left">
          <button className="topbar-back-btn" onClick={onBack}>← 返回</button>
          <div className="topbar-brand">
            <span className="brand-name">VALM OS</span>
          </div>
        </div>
        <div className="topbar-right">
          <span className="topbar-page-title">用户管理</span>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="user-management-main">
        {/* 统计栏 */}
        <div className="um-stats">
          <div className="um-stat-card">
            <div className="um-stat-value">{totalCount}</div>
            <div className="um-stat-label">总用户</div>
          </div>
          <div className="um-stat-card">
            <div className="um-stat-value">{superAdminCount}</div>
            <div className="um-stat-label">超级管理员</div>
          </div>
          <div className="um-stat-card">
            <div className="um-stat-value">{adminCount}</div>
            <div className="um-stat-label">管理员</div>
          </div>
          <div className="um-stat-card">
            <div className="um-stat-value">{bannedCount}</div>
            <div className="um-stat-label">已封禁</div>
          </div>
        </div>

        {/* 搜索栏 */}
        <div className="um-search-bar">
          <input
            className="um-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索用户名或 ID..."
          />
        </div>

        {/* 用户列表 */}
        {loading ? (
          <div className="um-empty">加载中...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="um-empty">暂无用户数据</div>
        ) : (
          <table className="um-table">
            <thead>
              <tr>
                <th>用户</th>
                <th className="um-id-col">ID</th>
                <th>角色</th>
                <th>状态</th>
                <th>注册时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="um-username-cell">
                      <div className={`um-user-avatar ${getRoleTagClass(u.role)}`}>
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      <span className="um-user-name">
                        {u.username}
                        {isSelf(u.id) && <span className="um-self-mark">（我）</span>}
                      </span>
                    </div>
                  </td>
                  <td className="um-id-col">
                    <span className="um-id-text">{u.id.substring(0, 8)}...</span>
                  </td>
                  <td>
                    <span className={`um-role-tag ${getRoleTagClass(u.role)}`}>
                      {ROLE_LABELS[u.role]}
                    </span>
                  </td>
                  <td>
                    <span className={`um-status-tag ${u.banned ? 'banned' : 'active'}`}>
                      {u.banned ? '封禁' : '正常'}
                    </span>
                    {u.banned && u.banned_reason && (
                      <div className="um-ban-reason">原因：{u.banned_reason}</div>
                    )}
                  </td>
                  <td>{formatDate(u.created_at)}</td>
                  <td>
                    <div className="um-actions">
                      <button className="um-action-btn edit" onClick={() => openModal('edit-username', u)}>
                        改名
                      </button>
                      {u.banned ? (
                        <button className="um-action-btn unban" onClick={() => handleUnban(u.id)}>
                          解封
                        </button>
                      ) : (
                        /* 自己和管理员/超级管理员不显示封禁按钮 */
                        !isSelf(u.id) && !isTargetAdmin(u) && (
                          <button
                            className="um-action-btn ban"
                            onClick={() => openModal('ban', u)}
                          >
                            封禁
                          </button>
                        )
                      )}
                      {/* 仅超级管理员可变更角色 */}
                      {isSuperAdmin && !isSelf(u.id) && u.role !== 'super_admin' && (
                        <button
                          className="um-action-btn role"
                          onClick={() => openModal('role', u)}
                          title="变更角色"
                        >
                          角色
                        </button>
                      )}
                      <button
                        className="um-action-btn delete"
                        onClick={() => openModal('delete', u)}
                        disabled={isSelf(u.id) || u.role === 'super_admin'}
                        title={
                          isSelf(u.id)
                            ? '不能删除自己'
                            : u.role === 'super_admin'
                              ? '不能删除超级管理员'
                              : ''
                        }
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>

      {/* 弹窗 */}
      {renderModal()}
    </div>
  );
};

export default UserManagement;
