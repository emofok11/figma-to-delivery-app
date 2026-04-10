# 需求文档：注册邮箱验证码与登录状态持久化

## 引言
在现有 Supabase Auth 认证系统基础上，为注册流程增加邮箱验证码（OTP）环节，确保用户输入的邮箱真实可访问；同时完善登录状态持久化机制，使用户关闭浏览器后再次访问时自动恢复登录状态，无需重复登录。

---

## 需求

### 需求 1：注册后发送邮箱验证码

**用户故事：** 作为一名新用户，我希望注册后系统向我的邮箱发送验证码，以便证明该邮箱确实属于我。

#### 验收标准

1. WHEN 用户成功提交注册表单 THEN 系统 SHALL 调用 Supabase Auth `signUp` 创建账号，并自动触发 Supabase 发送邮箱验证码（OTP）
2. WHEN 注册 API 调用成功且 `data.session` 为 null（需邮箱确认模式） THEN 系统 SHALL 显示验证码输入界面，提示用户查收邮箱
3. WHEN 注册 API 调用成功且 `data.session` 存在（自动确认模式） THEN 系统 SHALL 直接完成登录，跳过验证码步骤
4. IF 注册 API 返回错误（如邮箱已注册） THEN 系统 SHALL 在注册表单上显示对应错误提示，不进入验证码界面
5. WHEN 注册成功并进入验证码界面 THEN 系统 SHALL 显示"注册成功，验证码已发送至您的邮箱"的成功提示
6. WHEN 注册 API 返回错误 THEN 系统 SHALL 根据错误类型显示具体的中文提示（如"该邮箱已被注册"、"密码不符合要求"等），而非通用错误信息

---

### 需求 2：验证码输入与验证

**用户故事：** 作为一名新注册用户，我希望能在页面上输入收到的验证码，以便完成邮箱真实性验证并进入网站。

#### 验收标准

1. WHEN 验证码输入界面显示 THEN 系统 SHALL 提供 6 位数字验证码输入框（支持逐位输入和粘贴）
2. WHEN 用户输入完整 6 位验证码 THEN 系统 SHALL 自动调用 Supabase Auth `verifyOtp` 进行验证，无需手动点击确认按钮
3. WHEN 验证码验证中 THEN 系统 SHALL 禁用输入框并显示加载状态
4. IF 验证码正确 THEN 系统 SHALL 显示"验证成功，正在登录..."的成功提示，完成邮箱确认，自动登录用户，并跳转至主页面
5. IF 验证码错误或已过期 THEN 系统 SHALL 显示"验证码错误或已过期，请重新发送"的错误提示，并清空已输入的验证码
6. WHEN 验证码输入界面显示 THEN 系统 SHALL 提供"重新发送验证码"按钮
7. WHEN 用户点击"重新发送验证码" THEN 系统 SHALL 调用 Supabase Auth `resend` 重新发送验证码到用户邮箱
8. IF 重新发送操作在 60 秒内重复触发 THEN 系统 SHALL 禁用"重新发送"按钮并显示倒计时（60秒冷却期）
9. WHEN 用户点击"重新发送验证码"成功 THEN 系统 SHALL 显示"验证码已重新发送"的成功提示
10. IF 重新发送验证码失败 THEN 系统 SHALL 显示"发送失败，请稍后重试"的错误提示
11. WHEN 验证码输入界面显示 THEN 系统 SHALL 提供"返回登录"的链接，允许用户放弃验证回到登录页

---

### 需求 3：登录状态持久化

**用户故事：** 作为一名已登录用户，我希望关闭浏览器后再次访问时无需重新登录，以便获得无缝的使用体验。

#### 验收标准

1. WHEN 用户首次登录成功 THEN 系统 SHALL 将 Supabase Session 持久化存储到浏览器 localStorage（Supabase 默认行为）
2. WHEN 用户关闭浏览器后再次访问应用 THEN 系统 SHALL 自动从本地存储恢复 Session，无需用户重新输入邮箱密码
3. WHEN Session 恢复成功 THEN 系统 SHALL 直接渲染主页面，不显示登录界面
4. WHEN Session 恢复过程中 THEN 系统 SHALL 显示"正在恢复会话..."的加载提示
5. IF 本地 Session 已过期且 Token 刷新失败 THEN 系统 SHALL 清除过期状态，显示登录界面，并提示"登录已过期，请重新登录"
6. WHEN 用户主动点击登出 THEN 系统 SHALL 显示"已成功退出登录"的提示，清除本地 Session 存储，下次访问需重新登录
7. IF Session 恢复或刷新过程中发生网络错误 THEN 系统 SHALL 显示"网络异常，请检查网络连接"的提示，并提供重试按钮

8. WHEN 用户使用未验证的邮箱尝试登录 THEN 系统 SHALL 检测 Supabase 返回的"Email not confirmed"错误，显示"账号未验证，请先验证邮箱"的提示，并提供"发送验证码"按钮直接跳转至验证码输入界面（无需返回注册页重新注册）

---

### 需求 4：验证码界面 UI 与交互

**用户故事：** 作为一名用户，我希望验证码界面风格与现有认证页面一致，操作流程清晰直观。

#### 验收标准

1. WHEN 显示验证码输入界面 THEN 系统 SHALL 保持与 AuthGate 一致的暗色调（Tactical Design）设计风格
2. WHEN 显示验证码输入界面 THEN 系统 SHALL 提示用户验证码已发送至哪个邮箱（脱敏显示，如 `t***@gmail.com`）
3. WHEN 用户在验证码输入框中按下 Backspace THEN 系统 SHALL 清除当前位并自动聚焦到前一位
4. WHEN 用户粘贴 6 位验证码 THEN 系统 SHALL 自动填充所有输入框并触发验证
5. WHEN 验证码界面显示 THEN 系统 SHALL 在界面顶部保留 "VALM OS / TACTICAL DESIGN SYSTEM" 品牌标识

---

### 需求 5：操作反馈提示

**用户故事：** 作为一名用户，我希望每个关键操作都有明确的成功或失败提示，以便清楚了解操作结果。

#### 验收标准

1. WHEN 任何认证操作（注册、登录、验证码验证、登出、重发验证码）成功 THEN 系统 SHALL 显示绿色的成功提示消息，包含具体操作结果描述
2. WHEN 任何认证操作失败 THEN 系统 SHALL 显示红色的错误提示消息，包含具体原因描述，而非通用的"操作失败"
3. WHEN 提示消息显示后 THEN 系统 SHALL 在 3 秒后自动消失，或在用户点击时立即关闭
4. WHEN 提示消息显示 THEN 系统 SHALL 不阻断用户后续操作（非模态提示）
5. WHEN 同一操作产生新提示 THEN 系统 SHALL 替换旧提示，而非叠加显示
6. WHEN 登录操作成功 THEN 系统 SHALL 显示"登录成功，欢迎回来"的提示
7. WHEN 登录操作失败 THEN 系统 SHALL 根据错误类型显示具体中文提示（如"邮箱或密码错误"、"账号未验证，请先验证邮箱"等）

---

### 需求 6：Supabase 邮箱确认模式配置

**用户故事：** 作为系统管理员，我希望 Supabase 的邮箱确认策略与验证码流程一致，以确保安全性和用户体验。

#### 验收标准

1. IF Supabase 项目配置为"确认邮箱"模式 THEN 系统 SHALL 使用验证码（OTP）流程进行邮箱验证
2. WHEN Supabase 项目确认模式变更 THEN 系统 SHALL 通过 `signUp` 返回的 `session` 是否为 null 动态判断是否需要验证码步骤，无需硬编码
3. WHEN Supabase 发送验证邮件 THEN 系统 SHALL 配置邮件模板使用 OTP 类型（数字验证码），而非默认的确认链接类型

---

## 技术说明

- **验证码机制**：使用 Supabase Auth 内置的邮箱 OTP 功能。注册时 `signUp` 自动发送验证码，前端通过 `verifyOtp({ type: 'signup', email, token })` 验证。
- **重新发送**：使用 `supabase.auth.resend({ type: 'signup', email })` 重新发送验证码。
- **Session 持久化**：Supabase 客户端默认将 Session 存储在 `localStorage`，`getSession()` 可恢复已有登录状态。需确保 Supabase Client 初始化时 `persistSession` 选项为 `true`（默认值）。
- **验证码输入 UI**：采用 6 个独立数字输入框的逐位输入模式，支持粘贴自动填充。
- **邮箱脱敏**：对用户邮箱进行部分隐藏显示，如 `t***@gmail.com`，防止完整邮箱泄露。
- **操作反馈提示**：实现一个轻量的 Toast 提示组件，支持成功（绿色）/ 错误（红色）两种样式，自动 3 秒消失，非模态设计，同一时间仅显示最新一条。
