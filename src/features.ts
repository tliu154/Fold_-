/**
 * 模块注册表（v0.6 骨架）
 * - 所有功能模块在此登记；新功能先登记、再走澄清门（清单 3.1）
 * - GET /api/features 直接读取本表
 * - enabled: false 的模块不执行任何逻辑
 * - 模块清单权威源；每次扩展同步更新 MODULES.md
 */
export type FeatureStatus = "implemented" | "placeholder" | "pending_clarify";

export interface FeatureModule {
  id: string;
  name: string;
  enabled: boolean;
  status: FeatureStatus;
  /** 归属的数据源适配器 id（仅数据源类模块） */
  owner_adapter?: string;
  /** 所属期（v0.6 第九节分期） */
  phase?: "骨架" | "一期" | "二期" | "三期" | "四期" | "五期";
  note?: string;
}

export const features: FeatureModule[] = [
  // ---- 骨架（已实做） ----
  {
    id: "framework",
    name: "项目框架 / 建表 / 鉴权 / 配置 / PWA 壳",
    enabled: true,
    status: "implemented",
    phase: "骨架",
  },
  {
    id: "ui-base",
    name: "简约 UI 基底（右侧栏 / 点击切页 / 空状态）",
    enabled: true,
    status: "implemented",
    phase: "骨架",
    note: "侧栏在右、点击切页（v0.6 第七节）",
  },
  {
    id: "home-dashboard",
    name: "首页分区视图（就地新增 / 编辑 / 删除）",
    enabled: true,
    status: "implemented",
    phase: "骨架",
    note: "用户 2026-11-19 要求：单列从上到下 5 分区、垂直滚动、每区最多 5 条 + 查看全部跳 tab；+ 号弹框新增、点条目编辑带删除；侧栏「记录与规划」保留不动",
  },
  {
    id: "module-registry",
    name: "模块开关 / 适配器接口 / MODULES.md",
    enabled: true,
    status: "implemented",
    phase: "骨架",
  },

  // ---- 一期 ----
  {
    id: "todos",
    name: "待办（网站自建主库 CRUD）",
    enabled: true,
    status: "implemented",
    phase: "一期",
    note: "A2 已实做：标准四字段 + 完成切换 + 筛选 + 软删除/恢复；items 表 type=todo",
  },
  {
    id: "events",
    name: "日程（网站自建主库，按日期分组）",
    enabled: true,
    status: "implemented",
    phase: "一期",
    note: "A3 已实做：标题/日期/起止时间/地点/备注/标签 + 今天/明天/本周/更远/已过去分组 + 软删除/恢复；items 表 type=event",
  },
  {
    id: "checkins",
    name: "打卡（习惯 + 随手记 / 连续天数）",
    enabled: true,
    status: "implemented",
    phase: "一期",
    note: "A4 已实做：习惯定义+每日打卡(可补记)+随手记一条、同习惯同日幂等、连续天数(今天没打从昨天算)、软删除保留记录；items 表 type=habit/checkin",
  },
  {
    id: "goals",
    name: "长期目标（本地配置手填）",
    enabled: true,
    status: "implemented",
    phase: "一期",
    note: "A5 已实做：五项字段(标题/描述/目标日期/状态/进度)，存 data/goals.json 不进主库；独立不联动；「规划」tab 改名为「长期目标」",
  },
  {
    id: "dashboard",
    name: "首页仪表盘（备忘录占位）",
    enabled: false,
    status: "placeholder",
    phase: "一期",
    note: "待办/日程/打卡/长期目标已实做；入口为「记录与规划」单一导航项 + 五个 tab（用户确认）；备忘录 tab 仍占位",
  },
  {
    id: "ai-chat-base",
    name: "AI 对话基础（普通对话两模式 / 多会话）",
    enabled: true,
    status: "implemented",
    phase: "一期",
    note: "A6 已实做：DeepSeek-Flash 一次性返回、临时模式不落库、普通模式多会话+最近10轮上下文、会话壳存 memory 表不新增表；不做 SSE/记账/预算/AI限流；结构化输出仅预留能力",
  },
  {
    id: "memory",
    name: "三层记忆 + 功能映射表",
    enabled: true,
    status: "implemented",
    phase: "一期",
    note: "A7 已实做：基础身份/功能记忆/临时上下文(复用 A6 最近10轮)；预设模板+设置页编辑；映射表 TS 常量+memory 表覆盖；普通模式注入、临时模式不注入；记忆带 tags；复用 memory 表不新增表",
  },
  {
    id: "ai-chat",
    name: "检索工具 / 管家页 / 记下来",
    enabled: false,
    status: "placeholder",
    phase: "一期",
    note: "A8~A10 待做：function calling 查 .md 实时索引、管家无状态问答、手动「记下来」",
  },
  {
    id: "save-note",
    name: "「记下来」按钮（存网站主库 + #source/网页AI）",
    enabled: false,
    status: "placeholder",
    phase: "一期",
    note: "手动触发，绝不自动 / 批量存",
  },
  {
    id: "api-probe",
    name: "API 探针（开工第一步，验证 model id / 结构化输出 / function calling）",
    enabled: false,
    status: "placeholder",
    phase: "一期",
    note: "脚本形式，非用户可见功能",
  },

  // ---- 二期 ----
  {
    id: "knowledge-base",
    name: "知识库 / 项目库看板 + 文件浏览器 + obsidian:// 跳转",
    enabled: false,
    status: "pending_clarify",
    phase: "二期",
    note: "项目进度读项目根 STATUS.md；不做 OCR",
  },
  {
    id: "git-tidy",
    name: "暂存区整理（git）+ Obsidian「整理新笔记」按钮",
    enabled: false,
    status: "pending_clarify",
    phase: "二期",
    note: "一次整理一次提交；Obsidian 松耦合、审批闸门后执行可逆操作",
  },

  // ---- 三期 ----
  {
    id: "scheduler",
    name: "定时任务 + 审批闸门 + 站内消息汇报",
    enabled: false,
    status: "pending_clarify",
    phase: "三期",
    note: "常驻后台；错过不补跑；AI 提案→批准才执行（限打标签/移动/重命名）",
  },
  {
    id: "weekly-report",
    name: "周报草稿 / 数据源开关面板 / 模板填数 + AI 评述",
    enabled: false,
    status: "pending_clarify",
    phase: "三期",
  },
  {
    id: "news-feed",
    name: "资讯订阅（Qwen 内置联网搜索）",
    enabled: false,
    status: "pending_clarify",
    phase: "三期",
    note: "一期不做 RSS；资讯只走 Qwen",
  },
  {
    id: "model-router",
    name: "GLM / Qwen 接入（三模型路由补齐）",
    enabled: false,
    status: "pending_clarify",
    phase: "三期",
  },

  // ---- 四期 ----
  {
    id: "mobile-web",
    name: "安卓浏览器兼容（Tailscale / 局域网 + 认证）",
    enabled: false,
    status: "pending_clarify",
    phase: "四期",
    note: "一期只做电脑端；鸿蒙平板不做",
  },
  {
    id: "external-data",
    name: "外部数据（Outlook Graph API / 本地目录如欧路生词本）",
    enabled: false,
    status: "pending_clarify",
    phase: "四期",
    owner_adapter: "outlook",
    note: "微信 / QQ 不做",
  },

  // ---- 五期（🔮） ----
  {
    id: "image-library",
    name: "图片库（与知识库 / 项目库平级的「资源库」）",
    enabled: false,
    status: "pending_clarify",
    phase: "五期",
  },
  {
    id: "expense",
    name: "收支统计（手动录入最简版）",
    enabled: false,
    status: "pending_clarify",
    phase: "五期",
    note: "🔮 先不做；自动获取支付宝/微信不可行",
  },
];

export function listFeatures(): FeatureModule[] {
  return features;
}
