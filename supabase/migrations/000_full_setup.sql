-- ============================================================
-- VTools 完整数据库初始化脚本（合并所有迁移）
-- 可在全新 Supabase 环境的 SQL Editor 中一次性执行
-- 包含：profiles / templates / template_history 三张表
-- 以及：角色体系、RLS 策略、触发器、辅助函数
-- ============================================================

-- ************************************************************
-- 一、创建 ENUM 类型
-- ************************************************************

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('super_admin', 'admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ************************************************************
-- 二、创建 profiles 表（用户资料 + 角色 + 封禁）
-- ************************************************************

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  role public.user_role NOT NULL DEFAULT 'user',
  banned BOOLEAN NOT NULL DEFAULT false,
  banned_at TIMESTAMPTZ,
  banned_reason TEXT,
  last_name_change_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- username 唯一约束（幂等：先检查是否已存在）
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_username_unique'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_unique UNIQUE (username);
  END IF;
END $$;

-- 索引
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- ************************************************************
-- 三、创建 templates 表（用户自定义模版）
-- ************************************************************

CREATE TABLE IF NOT EXISTS public.templates (
  id TEXT PRIMARY KEY,
  name TEXT,
  category TEXT,
  data JSONB,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 兼容旧表：如果 templates 表已存在但缺少 user_id 列，则补充添加
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'templates' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.templates ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 兼容旧表：如果 templates 表已存在但缺少 updated_at 列，则补充添加
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'templates' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.templates ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_templates_user_id ON public.templates(user_id);

-- ************************************************************
-- 四、创建 template_history 表（模版编辑历史）
-- ************************************************************

CREATE TABLE IF NOT EXISTS public.template_history (
  id TEXT PRIMARY KEY,
  template_id TEXT,
  title TEXT,
  data JSONB,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 兼容旧表：如果 template_history 表已存在但缺少 user_id 列，则补充添加
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'template_history' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.template_history ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_template_history_user_id ON public.template_history(user_id);

-- ************************************************************
-- 五、辅助函数：角色判断（SECURITY DEFINER）
-- ************************************************************

-- 判断是否为管理员（含超级管理员）
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

-- 判断是否为超级管理员
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

-- ************************************************************
-- 六、开启 RLS
-- ************************************************************

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_history ENABLE ROW LEVEL SECURITY;

-- ************************************************************
-- 七、profiles 表 RLS 策略
-- ************************************************************

-- 先清理旧策略（幂等）
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_role_super_admin_only" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;

-- 普通用户只能查自己
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- 管理员可查所有
CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- 用户只能插入自己的行（注册时）
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- 用户可更新自己（改用户名等）
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 管理员可更新任意 profile（封禁等）
CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 角色变更：仅超级管理员可修改 role 字段
CREATE POLICY "profiles_update_role_super_admin_only"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_super_admin(auth.uid()) OR auth.uid() = id)
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()))
  );

-- 管理员可删除用户
CREATE POLICY "profiles_delete_admin"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ************************************************************
-- 八、templates 表 RLS 策略
-- ************************************************************

DROP POLICY IF EXISTS "templates_select_own" ON public.templates;
DROP POLICY IF EXISTS "templates_insert_own" ON public.templates;
DROP POLICY IF EXISTS "templates_update_own" ON public.templates;
DROP POLICY IF EXISTS "templates_delete_own" ON public.templates;

CREATE POLICY "templates_select_own"
  ON public.templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "templates_insert_own"
  ON public.templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "templates_update_own"
  ON public.templates FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "templates_delete_own"
  ON public.templates FOR DELETE
  USING (auth.uid() = user_id);

-- ************************************************************
-- 九、template_history 表 RLS 策略
-- ************************************************************

DROP POLICY IF EXISTS "template_history_select_own" ON public.template_history;
DROP POLICY IF EXISTS "template_history_insert_own" ON public.template_history;
DROP POLICY IF EXISTS "template_history_update_own" ON public.template_history;
DROP POLICY IF EXISTS "template_history_delete_own" ON public.template_history;

CREATE POLICY "template_history_select_own"
  ON public.template_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "template_history_insert_own"
  ON public.template_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "template_history_update_own"
  ON public.template_history FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "template_history_delete_own"
  ON public.template_history FOR DELETE
  USING (auth.uid() = user_id);

-- ************************************************************
-- 十、触发器：新用户注册时自动创建 profile
-- ************************************************************

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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 执行完毕！
-- 如需设置第一个超级管理员，请执行：
-- UPDATE public.profiles SET role = 'super_admin' WHERE username = '你的用户名';
-- ============================================================
