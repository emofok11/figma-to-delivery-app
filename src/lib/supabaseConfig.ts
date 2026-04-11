/**
 * Supabase 多服务器配置
 * 
 * 支持正式 (production) 和测试 (test) 两个环境
 * 通过 VITE_SUPABASE_ENV 环境变量切换：
 *   - "production" → 使用正式服务器（默认）
 *   - "test"       → 使用测试服务器
 * 
 * 也支持直接通过 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 覆盖
 * 可选通过 VITE_AUTH_EMAIL_REDIRECT_URL 指定认证邮件回跳地址
 */

export type SupabaseEnv = 'production' | 'test';

interface SupabaseServerConfig {
  url: string;
  anonKey: string;
  label: string;       // 显示名称（如"正式环境"、"测试环境"）
  isProduction: boolean;
}

/** 正式服务器配置 */
const PRODUCTION_CONFIG: SupabaseServerConfig = {
  url: 'https://nrgkpkkomhbxsucombcg.supabase.co',
  // ⚠️ 请替换为真实的 anon key（从 Supabase Dashboard → Settings → API 获取）
  // 合法格式：eyJ 开头的长 JWT token
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yZ2twa2tvbWhieHN1Y29tYmNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MDc5NzgsImV4cCI6MjA5MTI4Mzk3OH0.-bDBP0ob5I00HBSYL88eZEJV0nMstECWKooz_rVWaD8',
  label: '正式环境',
  isProduction: true,
};

/** 测试服务器配置 */
const TEST_CONFIG: SupabaseServerConfig = {
  // ⚠️ 请替换为测试服务器的真实 URL
  url: 'https://knxhuvqctgpfblramwmx.supabase.co',
  // ⚠️ 请替换为测试服务器的真实 anon key
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtueGh1dnFjdGdwZmJscmFtd214Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MDgwMTUsImV4cCI6MjA5MTM4NDAxNX0.1TiF59cS4SMAbKsvSx5PgrZwuCodJcha7r6sShCQPxQ',
  label: '测试环境',
  isProduction: false,
};

/** 获取当前 Supabase 环境标识 */
export function getSupabaseEnv(): SupabaseEnv {
  return (import.meta.env.VITE_SUPABASE_ENV as SupabaseEnv) || 'production';
}

/** 获取当前激活的服务器配置 */
export function getSupabaseConfig(): SupabaseServerConfig {
  // 优先级：直接指定的环境变量 > VITE_SUPABASE_ENV 选择 > 默认正式环境
  const envUrl = import.meta.env.VITE_SUPABASE_URL;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (envUrl && envKey) {
    // 直接指定了 URL 和 Key，以此为准
    return {
      url: envUrl,
      anonKey: envKey,
      label: '自定义环境',
      isProduction: !envUrl.includes('test') && !envUrl.includes('staging'),
    };
  }

  const env = getSupabaseEnv();
  return env === 'test' ? TEST_CONFIG : PRODUCTION_CONFIG;
}

/** 获取认证邮件中的回跳地址 */
export function getAuthEmailRedirectUrl(): string | undefined {
  const envRedirectUrl = import.meta.env.VITE_AUTH_EMAIL_REDIRECT_URL?.trim();
  if (envRedirectUrl) {
    return envRedirectUrl;
  }

  if (typeof window === 'undefined') {
    return undefined;
  }

  return new URL(import.meta.env.BASE_URL || '/', window.location.origin).toString();
}

/** 导出所有服务器配置（供设置页面切换用） */
export const SERVER_CONFIGS: Record<SupabaseEnv, SupabaseServerConfig> = {
  production: PRODUCTION_CONFIG,
  test: TEST_CONFIG,
};
