-- ============================================
-- 用户管理功能：role / banned 字段 + 管理员 RLS 策略
-- 需在 Supabase Dashboard → SQL Editor 中执行
-- ============================================

-- 1. profiles 表增加 role 字段（admin / user）
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

-- 2. profiles 表增加 banned 字段（封禁标记 + 时间）
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned_reason TEXT;

-- 3. 删除旧的宽松 SELECT 策略，替换为管理员可查全部 + 普通用户只能查自己
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;

-- 创建 SECURITY DEFINER 辅助函数，绕过 RLS 递归查询
-- 直接用 superuser 权限检查 role，避免 RUSING 子查询自身被 RLS 拦截
CREATE OR REPLACE FUNCTION public.is_admin(check_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = check_uid AND role = 'admin');
$$;

-- 普通用户只能查自己的 profile
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- 管理员可查所有 profile（通过 SECURITY DEFINER 函数避免递归）
CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- 4. 管理员可更新任意 profile（封禁/解封/改名/角色变更）
CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 5. 管理员可删除任意 profile
CREATE POLICY "profiles_delete_admin"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- 6. 更新触发器：自动创建 profile 时设置默认 role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role, banned, banned_at, banned_reason, last_name_change_at, created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    'user',
    false,
    NULL,
    NULL,
    NULL,
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 7. 为 role 创建索引
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
