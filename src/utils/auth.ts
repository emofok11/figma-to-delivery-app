/**
 * 认证工具模块
 * - 密码以 SHA-256 哈希存储，代码中不含明文
 * - 使用 sessionStorage 管理登录状态，关闭标签页自动失效
 * - 预留用户组扩展能力
 */

// 用户组配置：每个用户组对应一个密码哈希和可用功能
export interface UserGroup {
  name: string;           // 用户组显示名称
  passwordHash: string;   // SHA-256 哈希
  features?: string[];    // 预留：可用功能列表
}

// 用户组配置表（可扩展，新增用户组只需在此添加）
// 密码 "codev" 的 SHA-256 哈希
export const USER_GROUPS: UserGroup[] = [
  {
    name: '默认用户组',
    passwordHash: 'e654cb6610e3667fe6c1aa21932985c59ca2817c0a283c3b344414ee78470ca5',
    features: ['all'],
  },
];

const AUTH_SESSION_KEY = 'ui_delivery_auth';
const AUTH_GROUP_KEY = 'ui_delivery_group';

/**
 * 计算字符串的 SHA-256 哈希值
 */
export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 初始化：预计算真实哈希并替换占位符（首次加载时执行）
 * 这里我们直接在运行时比对哈希
 */

/**
 * 验证用户组密码
 * @returns 匹配的用户组名称，验证失败返回 null
 */
export async function verifyPassword(input: string): Promise<string | null> {
  const inputHash = await sha256(input);

  for (const group of USER_GROUPS) {
    if (inputHash === group.passwordHash) {
      // 验证通过，存入 sessionStorage
      sessionStorage.setItem(AUTH_SESSION_KEY, 'authenticated');
      sessionStorage.setItem(AUTH_GROUP_KEY, group.name);
      return group.name;
    }
  }
  return null;
}

/**
 * 检查是否已认证
 */
export function isAuthenticated(): boolean {
  return sessionStorage.getItem(AUTH_SESSION_KEY) === 'authenticated';
}

/**
 * 获取当前用户组名称
 */
export function getCurrentGroup(): string | null {
  return sessionStorage.getItem(AUTH_GROUP_KEY);
}

/**
 * 登出
 */
export function logout(): void {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  sessionStorage.removeItem(AUTH_GROUP_KEY);
}
