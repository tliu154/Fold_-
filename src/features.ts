/**
 * 模块注册表（阶段 0 实做骨架）
 * - 所有功能模块在此登记；新功能先登记、再走澄清门（3.3）
 * - GET /api/features 直接读取本表
 * - enabled: false 的模块不执行任何逻辑
 */

export type FeatureStatus = "implemented" | "placeholder" | "pending_clarify";

export interface FeatureModule {
  id: string;
  name: string;
  enabled: boolean;
  status: FeatureStatus;
  /** 归属的数据源适配器 id（仅数据源类模块） */
  owner_adapter?: string;
  note?: string;
}

export const features: FeatureModule[] = [
  // ---- 已敲定，阶段 0 实做 ----
  {
    id: "framework",
    name: "项目框架 / 建表 / 鉴权 / 配置 / PWA 壳",
    enabled: true,
    status: "implemented",
  },
  {
    id: "ui-base",
    name: "简约 UI 基底 + 空状态",
    enabled: true,
    status: "implemented",
  },
  {
    id: "module-registry",
    name: "模块开关 features.ts / 数据源适配器接口 / MODULES.md",
    enabled: true,
    status: "implemented",
  },

  // ---- 阶段 1 实装 ----
  {
    id: "sync",
    name: "op 同步闭环 / 审批台 / 快照 / 审计",
    enabled: true,
    status: "implemented",
    note: "阶段 1 实装（2026-11-19 规格确认）：行级 JSON 快照、幂等、冲突人工解决、批量批准",
  },

  // ---- 方向已敲定，占位（实现前先走澄清门） ----
  {
    id: "inbox",
    name: "统一收件箱 + LLM 分类路由",
    enabled: false,
    status: "placeholder",
    note: "方向已敲定，细节待澄清；轻视图「记一条」固定 note 已随阶段 1 落地",
  },
  {
    id: "ai-chat",
    name: "AI 对话 + 记忆分层",
    enabled: false,
    status: "placeholder",
    note: "方向已敲定，细节待澄清",
  },
  {
    id: "save-answer",
    name: "对话「存为笔记」按钮",
    enabled: false,
    status: "placeholder",
    note: "已敲定（见提示词 9.1）；实现前仍先问一次",
  },

  // ---- 未敲定 / 细节待澄清，留空占位 ----
  {
    id: "daily-push",
    name: "每日推送 / 任务到期提醒",
    enabled: false,
    status: "pending_clarify",
  },
  {
    id: "weekly-report",
    name: "周报草稿 / 人工批准发布 / 反思建议",
    enabled: false,
    status: "pending_clarify",
    note: "大方向已定，细节待澄清",
  },
  {
    id: "notes",
    name: "日记随笔 / 笔记管理",
    enabled: false,
    status: "pending_clarify",
  },
  {
    id: "obsidian-tidy",
    name: "Obsidian「整理新笔记」按钮",
    enabled: false,
    status: "pending_clarify",
    note: "松耦合方向已定（见提示词 9.2），细节待澄清",
  },
  {
    id: "expense",
    name: "收支统计 / 账单导入",
    enabled: false,
    status: "pending_clarify",
  },
  {
    id: "rss",
    name: "RSS / 资讯聚合",
    enabled: false,
    status: "pending_clarify",
  },
  {
    id: "ocr",
    name: "手写笔记 OCR",
    enabled: false,
    status: "pending_clarify",
  },
  {
    id: "outlook",
    name: "Outlook 日历 / 邮件",
    enabled: false,
    status: "pending_clarify",
    owner_adapter: "outlook", // 仅预留适配器位置
  },
  {
    id: "wechat-qq",
    name: "微信 / QQ 内容转发接收",
    enabled: false,
    status: "pending_clarify",
    owner_adapter: "wechat-qq", // 仅预留适配器位置；不做群消息自动接入
  },
  {
    id: "goal-board",
    name: "目标看板 / 进度汇总",
    enabled: false,
    status: "pending_clarify",
  },
];

export function listFeatures(): FeatureModule[] {
  return features;
}
