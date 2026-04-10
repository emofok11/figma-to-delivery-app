import { createClient } from '@supabase/supabase-js';

// 优先使用环境变量，若未配置则使用默认值
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://nrgkpkkomhbxsucombcg.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_0rZgO975JKGLwM2UkyoNuw_5DrV3K54';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
