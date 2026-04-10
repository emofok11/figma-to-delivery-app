-- ============================================================
-- 002_enable_email_otp.sql
-- 开启邮箱确认模式 + 配置 OTP 类型邮件模板
-- 
-- 注意：以下 SQL 需在 Supabase 控制台 SQL Editor 中执行
-- 部分配置（如邮件模板）需在 Supabase Dashboard → Authentication → Email Templates 中手动修改
-- ============================================================

-- 1. 开启"确认邮箱"模式（确保注册后需要邮箱验证才能登录）
-- Supabase 中此配置通过 auth.config 表控制，但直接修改该表需要 service_role 权限
-- 推荐在 Supabase Dashboard → Authentication → Providers → Email 中勾选 "Confirm email"
-- 以下 SQL 仅作为参考（需 service_role key 执行）：

-- UPDATE auth.config SET confirm_email = true;

-- 2. 配置注册邮件模板为 OTP 类型（数字验证码而非确认链接）
-- 需在 Supabase Dashboard → Authentication → Email Templates 中操作：
--   - 选择 "Confirm signup" 模板
--   - 将模板内容替换为 OTP 验证码格式，使用变量 {{ .Token }} 
--   - 示例模板：

/*
Subject: 您的验证码 - VALM OS

Body:
<h2>邮箱验证码</h2>
<p>您的验证码为：</p>
<h1 style="font-size:32px;letter-spacing:4px;color:#FF4655;">{{ .Token }}</h1>
<p>验证码有效期为 24 小时，请在注册页面输入此验证码完成验证。</p>
<p>如非本人操作，请忽略此邮件。</p>
<hr style="border:none;border-top:1px solid #333;margin:16px 0;" />
<p style="color:#999;font-size:12px;">VALM OS - Tactical Design System</p>
*/

-- 3. 确保 OTP 验证码类型为 signup
-- 前端调用 supabase.auth.verifyOtp({ type: 'signup', email, token }) 
-- 和 supabase.auth.resend({ type: 'signup', email }) 时
-- Supabase 会自动使用 "Confirm signup" 模板发送验证码
-- 无需额外 SQL 配置
