# 实施计划

- [ ] 1. 编写数据库迁移脚本
   - 创建 `supabase/migrations/001_add_user_id_and_rls.sql` 文件
   - 编写 SQL 为 `templates` 和 `template_history` 表添加 `user_id` (uuid) 字段，设置外键关联到 `auth.users(id)`
   - 编写 SQL 为两张表开启 RLS，并创建 `SELECT`、`INSERT`、`UPDATE`、`DELETE` 策略，条件为 `auth.uid() = user_id`
   - _需求：5.2、5.3_

- [ ] 2. 创建全局认证状态管理（AuthContext）
   - 新建 `src/contexts/AuthContext.tsx`，定义 AuthProvider 和 useAuth Hook
   - 使用 `supabase.auth.onAuthStateChange` 监听登录状态变化，管理 user / session / loading 状态
   - 实现会话过期检测逻辑：当 Token 失效且无法刷新时，自动登出并提示"登录已过期，请重新登录"
   - 实现已登录状态判断：供路由守卫和 AuthGate 使用，已登录用户自动跳过登录页
   - _需求：2.1、2.6、2.7、3.5_

- [ ] 3. 重构 AuthGate 组件 UI（登录/注册双模式）
   - 修改 `src/components/AuthGate.tsx`，支持"登录"和"注册"两种模式的平滑切换
   - 增加邮箱和密码输入框，保留现有暗色调（Tactical Design）风格
   - 实现前端表单验证：邮箱格式校验、密码强度校验（至少8位，包含字母和数字）
   - 支持 Enter 键提交表单、加载状态下禁用按钮防止重复提交
   - 错误信息以红色文字显示在对应输入框附近
   - _需求：1.1、1.3、1.4、1.5、4.1、4.2、4.3、4.4_

- [ ] 4. 实现注册与登录核心逻辑
   - 在 AuthGate 中集成 `supabase.auth.signUp` 实现注册，注册成功后自动初始化登录状态并跳转主页面
   - 在 AuthGate 中集成 `supabase.auth.signInWithPassword` 实现登录
   - 捕获并转译 Supabase 错误码为中文提示（如"该邮箱已被注册"、"邮箱或密码错误"），统一错误提示防止账号探测
   - 依赖 Supabase 自带的 Rate Limiting 处理连续登录失败场景，前端捕获 429 状态码并提示用户稍后再试
   - _需求：1.6、1.7、1.8、2.2、2.3、2.4、2.5_

- [ ] 5. 实现登出功能与路由保护
   - 在主页面顶部导航栏添加"登出"按钮
   - 实现调用 `supabase.auth.signOut` 销毁服务端会话，清除本地会话状态和敏感缓存
   - 登出完成后重定向至登录页面
   - 在应用入口处（App.tsx）集成 AuthContext，实现路由守卫：未登录用户访问主页面时拦截并重定向至 AuthGate
   - _需求：3.1、3.2、3.3、3.4、5.4_

- [ ] 6. 改造数据服务层（supabaseService）
   - 修改 `src/lib/supabaseService.ts` 中的 `saveTemplate` 和 `saveHistory` 方法，在插入/更新时强制附加当前用户的 `user_id`
   - 确保 `getTemplates` 和 `getHistory` 在 RLS 保护下正常工作，仅返回当前用户数据
   - 添加必要的错误处理，当用户未登录时拒绝数据操作
   - _需求：5.1、5.2_

- [ ] 7. 清理旧认证模块并集成测试
   - 移除 `src/utils/auth.ts` 中的旧密码哈希验证逻辑（`verifyPassword`、`isAuthenticated`、`logout` 等）
   - 清理 AuthGate 和其他组件中对旧 auth 工具函数的 import 和调用
   - 确保 sessionStorage 中不再残留旧的认证标记，全面切换到 Supabase Session 机制
   - 端到端验证：注册 → 登录 → 数据隔离 → 登出 → 会话恢复 全流程可用
   - _需求：全部需求的集成验证_