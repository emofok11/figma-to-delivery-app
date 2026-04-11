import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './Toast';
import { checkUsernameUnique, updateUsername, getProfile } from '../lib/profileService';
import './UserSettings.css';

interface UserSettingsProps {
  onBack: () => void;
}

/** 用户名格式校验：2-20位，仅中英文、数字、下划线 */
const isValidUsername = (username: string): boolean =>
  username.length >= 2 && username.length <= 20 && /^[\u4e00-\u9fa5a-zA-Z0-9_]+$/.test(username);

/** 计算距下次可修改用户名的天数 */
const getDaysUntilNextChange = (lastChangeAt: string | null): number | null => {
  if (!lastChangeAt) return null;
  const lastChange = new Date(lastChangeAt);
  const nextChange = new Date(lastChange.getTime() + 30 * 24 * 60 * 60 * 1000);
  const now = new Date();
  const diffMs = nextChange.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
};

const UserSettings: React.FC<UserSettingsProps> = ({ onBack }) => {
  const { user, refreshSession } = useAuth();
  const { showSuccess, showError } = useToast();

  // 账户信息
  const [profileData, setProfileData] = useState<{
    username: string | null;
    last_name_change_at: string | null;
  } | null>(null);

  // 用户名修改
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);

  // 修改密码
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // 更换邮箱
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  // 登出其他设备
  const [signingOutOthers, setSigningOutOthers] = useState(false);
  const [showSignOutOthersConfirm, setShowSignOutOthersConfirm] = useState(false);

  // 加载 profile 数据
  useEffect(() => {
    if (user) {
      getProfile(user.id).then(setProfileData);
    }
  }, [user]);

  // 获取显示信息
  const currentUsername = user?.user_metadata?.username || profileData?.username || null;
  const lastNameChangeAt = profileData?.last_name_change_at || user?.user_metadata?.last_name_change_at || null;
  const daysUntilNextChange = getDaysUntilNextChange(lastNameChangeAt);
  const canChangeUsername = !lastNameChangeAt || daysUntilNextChange === null || daysUntilNextChange === 0;

  // ===== 用户名修改 =====
  const handleUsernameBlur = useCallback(async () => {
    const trimmed = newUsername.trim();
    if (!trimmed || !isValidUsername(trimmed)) return;
    setCheckingUsername(true);
    setUsernameError('');
    const isUnique = await checkUsernameUnique(trimmed);
    setCheckingUsername(false);
    if (!isUnique) {
      setUsernameError('该用户名已被占用，请换一个');
    } else {
      setUsernameError('');
    }
  }, [newUsername]);

  const handleSaveUsername = useCallback(async () => {
    if (!user) return;
    const trimmed = newUsername.trim();
    if (!trimmed) { setUsernameError('请输入用户名'); return; }
    if (!isValidUsername(trimmed)) { setUsernameError('用户名需2-20位，仅中英文、数字、下划线'); return; }
    if (!canChangeUsername) { setUsernameError(`用户名每30天只能修改一次，下次可修改时间为${getNextChangeDate(lastNameChangeAt)}`); return; }

    setSavingUsername(true);
    setUsernameError('');

    // 校验唯一性
    const isUnique = await checkUsernameUnique(trimmed);
    if (!isUnique) {
      setUsernameError('该用户名已被占用，请换一个');
      setSavingUsername(false);
      return;
    }

    // 更新 user_metadata 和 profiles 表
    const { error: updateError } = await supabase.auth.updateUser({
      data: { username: trimmed, last_name_change_at: new Date().toISOString() }
    });
    if (updateError) {
      setUsernameError('用户名更新失败，请重试');
      setSavingUsername(false);
      return;
    }

    const profileUpdated = await updateUsername(user.id, trimmed);
    if (!profileUpdated) {
      setUsernameError('用户名更新失败，请重试');
      setSavingUsername(false);
      return;
    }

    // 刷新数据
    await refreshSession();
    const updatedProfile = await getProfile(user.id);
    setProfileData(updatedProfile);
    setEditingUsername(false);
    setNewUsername('');
    setUsernameError('');
    setSavingUsername(false);
    showSuccess('用户名修改成功');
  }, [user, newUsername, canChangeUsername, lastNameChangeAt, refreshSession, showSuccess]);

  // ===== 修改密码 =====
  const handleChangePassword = useCallback(async () => {
    if (!user || !user.email) return;
    if (!currentPassword) { setPasswordError('请输入当前密码'); return; }
    if (!newPassword) { setPasswordError('请输入新密码'); return; }
    if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setPasswordError('新密码至少8位，需包含字母和数字');
      return;
    }
    if (newPassword !== confirmNewPassword) { setPasswordError('两次输入的密码不一致'); return; }

    setSavingPassword(true);
    setPasswordError('');

    // 先验证当前密码
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (verifyError) {
      setPasswordError('当前密码错误');
      setSavingPassword(false);
      return;
    }

    // 更新密码
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setPasswordError('密码修改失败，请重试');
      setSavingPassword(false);
      return;
    }

    setSavingPassword(false);
    showSuccess('密码修改成功，请重新登录');
    // 自动登出
    await supabase.auth.signOut();
  }, [user, currentPassword, newPassword, confirmNewPassword, showSuccess]);

  // ===== 更换邮箱 =====
  const handleChangeEmail = useCallback(async () => {
    if (!user || !user.email) return;
    const trimmedEmail = newEmail.trim();
    if (!trimmedEmail) { setEmailError('请输入新邮箱'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) { setEmailError('邮箱格式不正确'); return; }
    if (trimmedEmail === user.email) { setEmailError('新邮箱不能与当前邮箱相同'); return; }
    if (!emailPassword) { setEmailError('请输入当前密码'); return; }

    setSavingEmail(true);
    setEmailError('');

    // 先验证当前密码
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: emailPassword,
    });
    if (verifyError) {
      setEmailError('密码错误，请重新输入');
      setSavingEmail(false);
      return;
    }

    // 更新邮箱
    const { error: updateError } = await supabase.auth.updateUser({ email: trimmedEmail });
    if (updateError) {
      if (updateError.message.includes('already registered')) {
        setEmailError('该邮箱已被其他账户使用');
      } else {
        setEmailError('邮箱更换失败，请重试');
      }
      setSavingEmail(false);
      return;
    }

    setSavingEmail(false);
    showSuccess('确认邮件已发送至新邮箱，请前往确认');
    setShowChangeEmail(false);
    setNewEmail('');
    setEmailPassword('');
    setEmailError('');
  }, [user, newEmail, emailPassword, showSuccess]);

  // ===== 登出其他设备 =====
  const handleSignOutOthers = useCallback(async () => {
    setSigningOutOthers(true);
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    setSigningOutOthers(false);
    setShowSignOutOthersConfirm(false);
    if (error) {
      showError('操作失败，请重试');
    } else {
      showSuccess('已登出其他设备');
    }
  }, [showSuccess, showError]);

  if (!user) return null;

  return (
    <div className="user-settings">
      {/* 顶部导航栏 */}
      <header className="user-settings-topbar">
        <div className="topbar-left">
          <button className="topbar-back-btn" onClick={onBack}>← 返回</button>
          <div className="topbar-brand">
            <span className="brand-name">VALM OS</span>
          </div>
        </div>
        <div className="topbar-right">
          <span className="topbar-page-title">用户设置</span>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="user-settings-main">
        {/* ===== 账户信息区域 ===== */}
        <section className="settings-section">
          <h2 className="section-title">账户信息</h2>
          <div className="section-body">
            {/* 用户名 */}
            <div className="info-row">
              <span className="info-label">用户名</span>
              <div className="info-value-group">
                {editingUsername ? (
                  <div className="inline-edit">
                    <input
                      className={`settings-input ${usernameError ? 'error' : ''}`}
                      type="text"
                      value={newUsername}
                      onChange={(e) => { setNewUsername(e.target.value); setUsernameError(''); }}
                      onBlur={handleUsernameBlur}
                      placeholder="输入新用户名..."
                      disabled={savingUsername || checkingUsername}
                    />
                    {checkingUsername && <span className="checking-hint">检查中...</span>}
                    {usernameError && <span className="field-error">{usernameError}</span>}
                    <div className="inline-edit-actions">
                      <button className="btn-primary" onClick={handleSaveUsername} disabled={savingUsername || checkingUsername}>
                        {savingUsername ? '保存中...' : '保存'}
                      </button>
                      <button className="btn-secondary" onClick={() => { setEditingUsername(false); setNewUsername(''); setUsernameError(''); }} disabled={savingUsername}>
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="info-value">{currentUsername || '未设置'}</span>
                    {!currentUsername && <span className="info-hint">设置用户名后即可拥有个性化标识</span>}
                    {canChangeUsername ? (
                      <button className="btn-link" onClick={() => { setEditingUsername(true); setNewUsername(currentUsername || ''); }}>
                        {currentUsername ? '修改' : '设置用户名'}
                      </button>
                    ) : (
                      <span className="info-cooldown">还需等待 {daysUntilNextChange} 天才可修改</span>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* 邮箱 */}
            <div className="info-row">
              <span className="info-label">邮箱</span>
              <div className="info-value-group">
                <span className="info-value">{user.email}</span>
                {!showChangeEmail && (
                  <button className="btn-link" onClick={() => setShowChangeEmail(true)}>更换</button>
                )}
              </div>
            </div>

            {/* 更换邮箱表单 */}
            {showChangeEmail && (
              <div className="inline-form">
                <div className="form-field">
                  <input
                    className={`settings-input ${emailError ? 'error' : ''}`}
                    type="email"
                    value={newEmail}
                    onChange={(e) => { setNewEmail(e.target.value); setEmailError(''); }}
                    placeholder="输入新邮箱..."
                    disabled={savingEmail}
                  />
                </div>
                <div className="form-field">
                  <input
                    className={`settings-input ${emailError ? 'error' : ''}`}
                    type="password"
                    value={emailPassword}
                    onChange={(e) => { setEmailPassword(e.target.value); setEmailError(''); }}
                    placeholder="输入当前密码以验证..."
                    disabled={savingEmail}
                  />
                </div>
                {emailError && <span className="field-error">{emailError}</span>}
                <div className="inline-edit-actions">
                  <button className="btn-primary" onClick={handleChangeEmail} disabled={savingEmail}>
                    {savingEmail ? '提交中...' : '确认更换'}
                  </button>
                  <button className="btn-secondary" onClick={() => { setShowChangeEmail(false); setNewEmail(''); setEmailPassword(''); setEmailError(''); }} disabled={savingEmail}>
                    取消
                  </button>
                </div>
              </div>
            )}

            {/* 注册时间 */}
            <div className="info-row">
              <span className="info-label">注册时间</span>
              <span className="info-value">{user.created_at ? formatDate(user.created_at) : '未知'}</span>
            </div>

            {/* 上次登录 */}
            <div className="info-row">
              <span className="info-label">上次登录</span>
              <span className="info-value">{user.last_sign_in_at ? formatDate(user.last_sign_in_at) : '未知'}</span>
            </div>

            {/* 用户名最后修改时间 */}
            {lastNameChangeAt && (
              <div className="info-row">
                <span className="info-label">用户名修改时间</span>
                <span className="info-value">{formatDate(lastNameChangeAt)}</span>
              </div>
            )}
          </div>
        </section>

        {/* ===== 安全设置区域 ===== */}
        <section className="settings-section">
          <h2 className="section-title">安全设置</h2>
          <div className="section-body">
            {/* 修改密码 */}
            <div className="info-row">
              <span className="info-label">密码</span>
              <div className="info-value-group">
                <span className="info-value">••••••••</span>
                {!showChangePassword && (
                  <button className="btn-link" onClick={() => setShowChangePassword(true)}>修改</button>
                )}
              </div>
            </div>

            {showChangePassword && (
              <div className="inline-form">
                <div className="form-field">
                  <input
                    className={`settings-input ${passwordError ? 'error' : ''}`}
                    type="password"
                    value={currentPassword}
                    onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(''); }}
                    placeholder="当前密码..."
                    disabled={savingPassword}
                  />
                </div>
                <div className="form-field">
                  <input
                    className={`settings-input ${passwordError ? 'error' : ''}`}
                    type="password"
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setPasswordError(''); }}
                    placeholder="新密码（至少8位，包含字母和数字）..."
                    disabled={savingPassword}
                  />
                </div>
                <div className="form-field">
                  <input
                    className={`settings-input ${passwordError ? 'error' : ''}`}
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => { setConfirmNewPassword(e.target.value); setPasswordError(''); }}
                    placeholder="再次输入新密码..."
                    disabled={savingPassword}
                  />
                </div>
                {passwordError && <span className="field-error">{passwordError}</span>}
                <div className="inline-edit-actions">
                  <button className="btn-primary" onClick={handleChangePassword} disabled={savingPassword}>
                    {savingPassword ? '修改中...' : '确认修改'}
                  </button>
                  <button className="btn-secondary" onClick={() => { setShowChangePassword(false); setCurrentPassword(''); setNewPassword(''); setConfirmNewPassword(''); setPasswordError(''); }} disabled={savingPassword}>
                    取消
                  </button>
                </div>
              </div>
            )}

            {/* 登出其他设备 */}
            <div className="info-row">
              <span className="info-label">其他设备</span>
              <div className="info-value-group">
                <span className="info-value">登出其他设备上的会话</span>
                <button className="btn-link" onClick={() => setShowSignOutOthersConfirm(true)}>登出</button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 登出其他设备确认对话框 */}
      {showSignOutOthersConfirm && (
        <div className="confirm-overlay" onClick={() => setShowSignOutOthersConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-text">确定要登出其他设备吗？</p>
            <p className="confirm-subtext">此操作将使其他设备上的会话失效，当前设备不受影响。</p>
            <div className="confirm-actions">
              <button className="btn-danger" onClick={handleSignOutOthers} disabled={signingOutOthers}>
                {signingOutOthers ? '操作中...' : '确认登出'}
              </button>
              <button className="btn-secondary" onClick={() => setShowSignOutOthersConfirm(false)} disabled={signingOutOthers}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** 格式化日期 */
function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 获取下次可修改日期字符串 */
function getNextChangeDate(lastChangeAt: string | null): string {
  if (!lastChangeAt) return '';
  const d = new Date(new Date(lastChangeAt).getTime() + 30 * 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default UserSettings;
