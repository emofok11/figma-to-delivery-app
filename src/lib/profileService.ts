import { supabase } from './supabase';

/**
 * profiles 表服务
 * 负责用户名唯一性校验、创建/更新 profile
 */

/** 检查用户名是否唯一（未被占用） */
export async function checkUsernameUnique(username: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .limit(1);

  if (error) {
    console.warn('校验用户名唯一性失败:', error.message);
    // 查询失败时保守返回 false，避免允许重复用户名
    return false;
  }

  return data.length === 0;
}

/** 创建用户 profile（注册时调用） */
export async function createProfile(userId: string, username: string): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      username,
      last_name_change_at: null,
    });

  if (error) {
    console.warn('创建 profile 失败:', error.message);
    return false;
  }
  return true;
}

/** 更新用户名（修改用户名时调用） */
export async function updateUsername(userId: string, username: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('profiles')
    .update({
      username,
      last_name_change_at: now,
    })
    .eq('id', userId);

  if (error) {
    console.warn('更新用户名失败:', error.message);
    return false;
  }
  return true;
}

/** 获取用户的 profile 信息 */
export async function getProfile(userId: string): Promise<{
  username: string | null;
  last_name_change_at: string | null;
} | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('username, last_name_change_at')
    .eq('id', userId)
    .single();

  if (error) {
    console.warn('获取 profile 失败:', error.message);
    return null;
  }
  return data;
}
