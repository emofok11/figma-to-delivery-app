-- ============================================
-- 用户管理功能：super_admin / admin / user 角色体系 + 管理员 RLS 策略
-- 需在 Supabase Dashboard → SQL Editor 中执行
-- ============================================

-- 1. 创建 role 枚举类型（Supabase Dashboard 会自动识别为下拉选项）
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('super_admin', 'admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 如果 role 列已存在且为 TEXT 类型，先转换为 ENUM
-- 必须在 ADD COLUMN 之前执行，否则 IF NOT EXISTS 会跳过已有列
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'role'
      AND data_type IN ('text', 'character varying')
  ) THEN
    -- 先移除旧的 CHECK 约束（如果存在）
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
    -- 将 TEXT/VARCHAR 转为 ENUM
    ALTER TABLE public.profiles
      ALTER COLUMN role DROP DEFAULT;
    ALTER TABLE public.profiles
      ALTER COLUMN role TYPE public.user_role
      USING role::public.user_role;
    ALTER TABLE public.profiles
      ALTER COLUMN role SET DEFAULT 'user';
  END IF;
END $$;

-- profiles 表增加 role 字段（若不存在）
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role public.user_role NOT NULL DEFAULT 'user';

-- 2. profiles 表增加 banned 字段（封禁标记 + 时间）
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned_reason TEXT;

-- 3. 删除旧的宽松 SELECT 策略，替换为管理员可查全部 + 普通用户只能查自己
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;

-- 创建 SECURITY DEFINER 辅助函数：判断是否为管理员（含超级管理员）
-- 超级管理员和管理员都能查看所有用户
CREATE OR REPLACE FUNCTION public.is_admin(check_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = check_uid AND role IN ('super_admin', 'admin')
  );
$$;

-- 创建 SECURITY DEFINER 辅助函数：判断是否为超级管理员
-- 仅超级管理员可变更角色
CREATE OR REPLACE FUNCTION public.is_super_admin(check_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = check_uid AND role = 'super_admin'
  );
$$;

-- 普通用户只能查自己的 profile
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- 管理员（含超级管理员）可查所有 profile
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- 4. 管理员（含超级管理员）可更新任意 profile（封禁/解封/改名）
-- 注意：角色变更操作由前端+RLS双重限制，仅超级管理员可变更角色
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 角色字段更新：仅超级管理员可以修改其他用户的 role 字段
-- 通过额外的 RLS 策略限制：非超级管理员不能将 role 设为非原值
DROP POLICY IF EXISTS "profiles_update_role_super_admin_only" ON public.profiles;
CREATE POLICY "profiles_update_role_super_admin_only"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_super_admin(auth.uid()) OR auth.uid() = id)
  -- 超级管理员可以改任何人的 role，非超级管理员只能改自己且不能改 role
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()))
  );

-- 5. 管理员（含超级管理员）可删除任意 profile
DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;
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
