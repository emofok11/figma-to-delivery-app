# 需求文档：用户账号注册与登录系统

## 引言
将现有的简单密码验证系统升级为基于 Supabase Auth 的真实用户账号系统。用户可以注册独立账号、登录系统，系统将持久化存储用户信息，并支持不同用户拥有独立的模板数据。本次升级需确保逻辑严密、边界条件处理完善以及数据访问的绝对安全。

---

## 需求

### 需求 1：用户注册功能

**用户故事：** 作为一名新用户，我希望能够注册账号，以便拥有独立的个人空间和数据。

#### 验收标准

1. WHEN 用户访问应用时，IF 未登录状态 THEN 系统 SHALL 提供进入"注册"页面的入口
2. WHEN 用户访问注册页面时，IF 用户已处于登录状态 THEN 系统 SHALL 自动重定向至主页面
3. WHEN 用户提交注册表单 THEN 系统 SHALL 在前端验证邮箱格式是否合法
4. WHEN 用户提交注册表单 THEN 系统 SHALL 验证密码强度（至少8位，且包含字母和数字）
5. WHEN 注册请求处理中 THEN 系统 SHALL 禁用提交按钮并显示加载状态，防止重复提交
6. IF 邮箱已被注册 THEN 系统 SHALL 显示"该邮箱已被注册"的明确错误提示
7. WHEN 注册成功 THEN 系统 SHALL 自动完成登录状态的初始化，并跳转到主页面
8. WHEN 注册成功 THEN 系统 SHALL 在 Supabase 数据库的 auth.users 中生成对应的用户记录

---

### 需求 2：用户登录功能

**用户故事：** 作为一名已注册用户，我希望能够登录系统，以便访问我的个人数据。

#### 验收标准

1. WHEN 用户访问登录页面时，IF 用户已处于登录状态 THEN 系统 SHALL 自动重定向至主页面
2. WHEN 用户输入邮箱和密码并提交 THEN 系统 SHALL 调用 Supabase Auth 进行身份验证
3. WHEN 登录请求处理中 THEN 系统 SHALL 禁用提交按钮并显示加载状态
4. IF 邮箱或密码错误 THEN 系统 SHALL 统一显示"邮箱或密码错误"提示（不区分具体错误以防止账号探测）
5. IF 连续多次登录失败 THEN 系统 SHALL 触发 Supabase 的防暴破机制（Rate Limiting）并提示用户稍后再试
6. WHEN 登录成功 THEN 系统 SHALL 持久化保存用户会话状态（Token），并跳转到主页面
7. WHEN 用户关闭浏览器后再次访问 THEN 系统 SHALL 自动恢复登录状态（依赖 Supabase Session 机制）

---

### 需求 3：用户登出与会话管理

**用户故事：** 作为一名已登录用户，我希望能够安全登出，且在长时间不活动后系统能保护我的账号安全。

#### 验收标准

1. WHEN 用户已登录 THEN 系统 SHALL 在界面显著位置显示"登出"按钮
2. WHEN 用户点击登出按钮 THEN 系统 SHALL 调用 Supabase Auth 登出接口销毁服务端会话
3. WHEN 用户点击登出按钮 THEN 系统 SHALL 清除本地所有相关的会话状态和敏感缓存数据
4. WHEN 登出完成 THEN 系统 SHALL 跳转回登录页面
5. WHEN 用户的登录会话过期（Token失效且无法刷新） THEN 系统 SHALL 自动登出用户，重定向到登录页面，并提示"登录已过期，请重新登录"

---

### 需求 4：用户界面与交互体验

**用户故事：** 作为一名用户，我希望登录/注册界面风格与应用一致，并在操作时获得清晰的反馈。

#### 验收标准

1. WHEN 显示登录/注册页面 THEN 系统 SHALL 保持与现有 AuthGate 组件一致的暗色调（Tactical Design）设计风格
2. WHEN 用户在登录和注册页面之间切换 THEN 系统 SHALL 提供平滑的过渡和明确的切换链接
3. WHEN 发生任何表单验证错误或网络错误 THEN 系统 SHALL 以红色文字在对应输入框附近或表单顶部清晰显示错误信息
4. WHEN 用户在输入框中按下 Enter 键 THEN 系统 SHALL 触发对应表单的提交操作

---

### 需求 5：数据隔离与安全性 (核心逻辑)

**用户故事：** 作为一名用户，我希望我的模板数据仅对我可见，以便保护我的数据隐私。

#### 验收标准

1. WHEN 用户登录后获取模板列表 THEN 系统 SHALL 仅返回 `user_id` 匹配当前登录用户的数据
2. WHEN 用户创建或更新模板 THEN 系统 SHALL 强制将数据的 `user_id` 字段设置为当前登录用户的 ID
3. WHEN 用户尝试访问、修改或删除非本人的模板数据 THEN 系统 SHALL 拒绝操作并在数据库层面拦截（RLS）
4. WHEN 用户未登录访问受保护的路由（如主页面） THEN 系统 SHALL 拦截访问并重定向到登录页面

---

## 技术说明

- **认证核心**：使用 `@supabase/supabase-js` 提供的 Auth API 进行用户认证管理。
- **数据隔离 (RLS)**：必须在 Supabase 控制台为 `templates` 和 `template_history` 表开启 Row Level Security (RLS)。
  - 创建 Policy：`SELECT`, `INSERT`, `UPDATE`, `DELETE` 操作均需满足 `auth.uid() = user_id`。
- **表结构变更**：现有的 `templates` 和 `template_history` 表需要添加 `user_id` (uuid) 字段，并建立外键关联到 `auth.users(id)`。
- **会话管理**：利用 Supabase 客户端自动处理 Token 的存储和刷新，前端通过 `supabase.auth.onAuthStateChange` 监听状态变化。
- **错误处理**：需捕获并转译 Supabase 返回的英文错误码（如 `Invalid login credentials`）为友好的中文提示。
