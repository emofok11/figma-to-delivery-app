-- ============================================
-- profiles 表：用户名唯一性保障
-- 需在 Supabase Dashboard → SQL Editor 中执行
-- ============================================

-- 1. 创建 profiles 表
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  last_name_change_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 为 username 添加唯一约束
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_unique UNIQUE (username);

-- 3. 创建索引加速查询
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- 4. 启用 RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 5. 所有已认证用户可读（用于唯一性校验）
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- 6. 用户只能插入自己的行（注册时创建 profile）
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- 7. 用户只能更新自己的行（修改用户名）
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
