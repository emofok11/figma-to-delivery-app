/**
 * Supabase 多服务器配置
 * 
 * 支持正式 (production) 和测试 (test) 两个环境
 * 通过 VITE_SUPABASE_ENV 环境变量切换：
 *   - "production" → 使用正式服务器（默认）
 *   - "test"       → 使用测试服务器
 * 
 * 也支持直接通过 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 覆盖
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
  anonKey: 'sb_publishable_0rZgO975JKGLwM2UkyoNuw_5DrV3K54',
  label: '正式环境',
  isProduction: true,
};

/** 测试服务器配置 */
const TEST_CONFIG: SupabaseServerConfig = {
  // ⚠️ 请替换为测试服务器的真实 URL
  url: 'https://knxhuvqctgpfblramwmx.supabase.co',
  // ⚠️ 请替换为测试服务器的真实 anon key
  anonKey: 'sb_publishable_elRmFN4oRl6_WJCgPD9zSw_EvHV0vcM',
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

/** 导出所有服务器配置（供设置页面切换用） */
export const SERVER_CONFIGS: Record<SupabaseEnv, SupabaseServerConfig> = {
  production: PRODUCTION_CONFIG,
  test: TEST_CONFIG,
};
