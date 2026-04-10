-- ============================================================
-- 迁移脚本：为 templates 和 template_history 表添加用户隔离支持
-- 包含：user_id 字段、外键约束、RLS 策略
-- ============================================================

-- 1. 为 templates 表添加 user_id 字段，关联 auth.users
ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. 为 template_history 表添加 user_id 字段，关联 auth.users
ALTER TABLE template_history
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. 为 user_id 字段创建索引，加速按用户查询
CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id);
CREATE INDEX IF NOT EXISTS idx_template_history_user_id ON template_history(user_id);

-- ============================================================
-- 4. 开启 Row Level Security (RLS)
-- ============================================================
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_history ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. templates 表 RLS 策略
-- ============================================================

-- 查询：仅返回当前用户的数据
CREATE POLICY "templates_select_own"
  ON templates FOR SELECT
  USING (auth.uid() = user_id);

-- 插入：强制 user_id 为当前用户
CREATE POLICY "templates_insert_own"
  ON templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 更新：仅允许更新自己的数据
CREATE POLICY "templates_update_own"
  ON templates FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 删除：仅允许删除自己的数据
CREATE POLICY "templates_delete_own"
  ON templates FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 6. template_history 表 RLS 策略
-- ============================================================

-- 查询：仅返回当前用户的数据
CREATE POLICY "template_history_select_own"
  ON template_history FOR SELECT
  USING (auth.uid() = user_id);

-- 插入：强制 user_id 为当前用户
CREATE POLICY "template_history_insert_own"
  ON template_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 更新：仅允许更新自己的数据
CREATE POLICY "template_history_update_own"
  ON template_history FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 删除：仅允许删除自己的数据
CREATE POLICY "template_history_delete_own"
  ON template_history FOR DELETE
  USING (auth.uid() = user_id);
