import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './supabaseConfig';

const config = getSupabaseConfig();

export const supabase = createClient(config.url, config.anonKey, {
  auth: {
    persistSession: true,     // 显式开启 Session 持久化（存储到 localStorage）
    autoRefreshToken: true,   // 自动刷新 Token
    detectSessionInUrl: true, // 从 URL 中检测会话（支持 OAuth 回调）
  },
});
