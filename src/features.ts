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
    id: "module-registry",
    name: "模块开关 / 适配器接口 / MODULES.md",
    enabled: true,
    status: "implemented",
    phase: "骨架",
  },

  // ---- 一期 ----
  {
    id: "dashboard",
    name: "首页仪表盘（待办 / 日程 / 打卡 / 长期目标）",
    enabled: false,
    status: "placeholder",
    phase: "一期",
    note: "数据网站自建主库；长期目标存本地配置手填",
  },
  {
    id: "ai-chat",
    name: "AI 对话（管家 + 普通 / 三层记忆 / 检索工具 / 结构化输出）",
    enabled: false,
    status: "placeholder",
    phase: "一期",
    note: "一期先 DeepSeek 一家；三层记忆按功能映射、function calling 查 .md 实时索引",
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
