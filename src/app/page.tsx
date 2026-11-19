import AppShell from "@/components/AppShell";

/**
 * 首页（阶段 0）
 * 响应式外壳：桌面 = 窄侧栏 + 主工作区 + 审批台；移动 = 轻视图 + 底部导航 4 项
 * 未登录自动跳转 /login
 */
export default function HomePage() {
  return <AppShell />;
}
