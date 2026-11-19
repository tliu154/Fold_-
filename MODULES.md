# Fold_归匣 · 模块清单（MODULES.md）

> 模块状态唯一权威源：`src/features.ts`（`GET /api/features` 直接读取）。
> 每次扩展（新功能 / 新数据源）后必须更新本文件与 features.ts，保持一致。
> 状态：`implemented` 已实做 ｜ `placeholder` 方向已敲定、占位 ｜ `pending_clarify` 细节待澄清、留空

| 模块 | 状态 | enabled | 代码位置 | 阶段 0 动作 / 待澄清项 |
|---|---|---|---|---|
| 项目框架 / 建表 / 鉴权 / 配置 / PWA 壳 | implemented | true | `src/lib/*`、`db/schema.sql`、`public/` | 实做 |
| 简约 UI 基底 + 空状态 | implemented | true | `src/app/globals.css`、`src/components/*` | 实做 |
| 模块开关 / 适配器接口 / MODULES.md | implemented | true | `src/features.ts`、`src/adapters/` | 实做骨架 |
| op 同步闭环 / 审批台 / 快照 / 审计 | implemented | true | `src/lib/sync.ts`、`api/sync/*`、`api/ops/*`、`src/lib/localDb.ts`、`src/lib/syncClient.ts`、`InboxView`、`ApproveView` | 阶段 1 实装（2026-11-19 规格确认：自动同步+手动兜底、人工批 create、行级 JSON 快照、冲突快捷按钮、批量批准） |
| 统一收件箱 + LLM 分类路由 | placeholder | false | `src/app/api/capture/` | 占位；分类枚举等细节不提前写死；轻视图「记一条」固定 note 已随阶段 1 落地 |
| AI 对话 + 记忆分层 | placeholder | false | `src/app/api/ai/chat/` | 占位；模型/预算/记忆沉淀细节待澄清 |
| 对话「存为笔记」按钮 | placeholder | false | `src/app/api/ai/save-answer/` | 占位；已敲定（提示词 9.1），实现前仍先问一次 |
| 每日推送 / 任务到期提醒 | pending_clarify | false | `src/lib/cron.ts`（空调度占位） | 留空占位 |
| 周报草稿 / 人工批准发布 / 反思建议 | pending_clarify | false | `src/app/api/weekly-report/*` | 留空占位；细节待澄清 |
| 日记随笔 / 笔记管理 | pending_clarify | false | — | 留空占位 |
| Obsidian「整理新笔记」按钮 | pending_clarify | false | `src/app/api/obsidian/tidy/` | 留空占位；松耦合（提示词 9.2），判定口径等待澄清 |
| 收支统计 / 账单导入 | pending_clarify | false | — | 留空占位 |
| RSS / 资讯聚合 | pending_clarify | false | — | 留空占位 |
| 手写笔记 OCR | pending_clarify | false | — | 留空占位 |
| Outlook 日历 / 邮件 | pending_clarify | false | 适配器位置预留（`owner_adapter: outlook`） | 留空占位 |
| 微信 / QQ 内容转发接收 | pending_clarify | false | 适配器位置预留（`owner_adapter: wechat-qq`） | 不做群消息自动接入 |
| 目标看板 / 进度汇总 | pending_clarify | false | — | 留空占位 |

## 数据源适配器注册表（空）

| adapter id | 名称 | 状态 |
|---|---|---|
| _（阶段 0 无任何真实适配器，接入前先走澄清门）_ | | |

## 变更记录

- 2026-11-19（阶段 1）：op 同步闭环实装并推送。规格 8 条经用户确认；
  新增路由 `/api/ops/:op_id/resolve`（冲突解决）与 `/api/ops/batch-approve`（批量批准），
  均属已确认规格第 6 条范围。
- 2026-11-19：阶段 0 建立本清单，与 features.ts 初始状态一致。
