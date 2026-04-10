# 实施计划

- [ ] 1. 创建 Toast 提示组件
   - 编写 `src/components/Toast.tsx` 和 `Toast.css`，实现非模态提示组件，支持成功（绿色）/错误（红色）两种样式
   - 实现 3 秒自动消失、点击关闭、新提示替换旧提示的逻辑
   - 导出 `useToast` Hook 供其他组件调用
   - _需求：5.1、5.2、5.3、5.4、5.5_

- [ ] 2. 创建 OTP 验证码输入组件
   - 编写 `src/components/OtpInput.tsx` 和 `OtpInput.css`，实现 6 位数字逐位输入框
   - 实现自动聚焦下一位、Backspace 回退、粘贴 6 位验证码自动填充并触发验证
   - 保持暗色调 Tactical Design 风格，与 AuthGate 视觉一致
   - _需求：2.1、2.3、4.1、4.3、4.4、4.5_

- [ ] 3. 升级 AuthContext 支持验证码流程与登录状态提示
   - 在 `AuthContext.tsx` 中增加 `verifyOtp`、`resendOtp` 方法的封装
   - 增加 Session 恢复中的加载状态提示（"正在恢复会话..."）
   - 增加 Session 过期/网络错误的检测逻辑，触发对应的 Toast 提示；网络异常时提供重试按钮
   - 增加登出成功提示（"已成功退出登录"）
   - 新增 `resendVerification(email)` 方法，供登录页检测到未验证账号时直接发送验证码
   - _需求：2.2、2.7、3.2、3.3、3.4、3.5、3.6、3.7、3.8_

- [ ] 4. 重构 AuthGate 组件集成验证码流程
   - 在 `AuthGate.tsx` 中增加"注册 → 验证码输入"的流程状态管理（注册表单 → OTP 验证界面）
   - 注册成功时显示成功 Toast 并进入 OTP 验证界面；注册失败时显示具体中文错误 Toast
   - 登录成功时显示"登录成功，欢迎回来"Toast；登录失败时根据错误类型显示中文提示（如"邮箱或密码错误"、"账号未验证，请先验证邮箱"等）
   - OTP 验证成功显示"验证成功，正在登录..."Toast 并自动跳转；验证失败显示错误 Toast 并清空输入
   - 实现重发验证码 60 秒冷却倒计时，重发成功/失败均显示对应 Toast
   - 验证码界面显示脱敏邮箱（如 `t***@gmail.com`）和"返回登录"链接
   - _需求：1.1、1.2、1.3、1.4、1.5、1.6、2.4、2.5、2.6、2.8、2.9、2.10、2.11、4.2、5.6、5.7_

- [ ] 5. 确认 Supabase 客户端 Session 持久化配置
   - 检查 `src/lib/supabase.ts` 中 `persistSession` 为 `true`，确保 Session 默认存储到 localStorage
   - 确认 `signUp` 返回的 `session` 是否为 null 的动态判断逻辑，无需硬编码邮箱确认模式
   - _需求：3.1、6.2_

- [ ] 6. 编写 Supabase 邮箱确认模式与 OTP 邮件模板配置说明
   - 在 `supabase/migrations/` 下创建 `002_enable_email_otp.sql`，包含开启邮箱确认模式和配置 OTP 类型邮件模板的 SQL 语句（需在 Supabase 控制台手动执行）
   - _需求：6.1、6.3_
