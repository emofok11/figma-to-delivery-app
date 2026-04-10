/**
 * 认证工具模块（已迁移至 Supabase Auth）
 *
 * 旧的密码哈希验证逻辑已移除，认证功能由以下模块接管：
 * - src/contexts/AuthContext.tsx  → 全局认证状态管理
 * - src/lib/supabase.ts          → Supabase 客户端
 *
 * 本文件仅保留向后兼容的清理工具函数
 */

/**
 * 清除旧版认证残留的 sessionStorage 标记
 * 在迁移过渡期调用，确保旧标记不会干扰新系统
 */
export function clearLegacyAuth(): void {
  sessionStorage.removeItem('ui_delivery_auth');
  sessionStorage.removeItem('ui_delivery_group');
}
