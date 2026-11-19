# Fold_归匣 · 模块清单（MODULES.md）

> 需求权威源：`个人AI枢纽网站_需求对齐清单_v0.6.md`（定稿，纯需求）
> 模块状态权威源：`src/features.ts`（`GET /api/features` 直接读取），本文件与之保持一致。
> 状态：`implemented` 已实做 ｜ `placeholder` 方向已定、占位 ｜ `pending_clarify` 细节待澄清、留空
> 分期见 [PROJECT_PLAN.md](./PROJECT_PLAN.md)。

## 骨架（已实做）

| 模块 | 状态 | enabled | 代码位置 | 说明 |
|---|---|---|---|---|
| 项目框架 / 建表 / 鉴权 / 配置 / PWA 壳 | implemented | true | `src/lib/*`、`db/schema.sql`、`public/` | 4 张表；登录 HMAC Cookie + Bearer |
| 简约 UI 基底（右侧栏 / 点击切页 / 空状态） | implemented | true | `src/app/globals.css`、`src/components/AppShell.tsx` | 清单第七节：侧栏在右、点击切页 |
| 模块开关 / 适配器接口 / MODULES.md | implemented | true | `src/features.ts`、`src/adapters/` | 扩展点机制 |

## 一期

| 模块 | 状态 | enabled | 代码位置 | 待澄清 / 说明 |
|---|---|---|---|---|
| API 探针 | placeholder | false | `scripts/probe-api.mjs` | 开工第一步，已实测 5/5 过；model id 纠正为 deepseek-flash |
| 待办（网站自建主库 CRUD） | implemented | true | `src/lib/todos.ts`、`src/app/api/todos/*`、`src/components/TodoView.tsx` | A2 已实做：标题/截止/标签/备注 + 完成切换 + 筛选 + 软删除/恢复；`items` 表 `type=todo`，无新增表；e2e 15/15 过 |
| 首页仪表盘（日程/打卡/长期目标） | placeholder | false | `src/components/AppShell.tsx`（骨架卡） | 待办卡已可点击进入；其余骨架占位；长期目标存本地配置手填 |
| AI 对话（管家+普通/三层记忆/检索工具/结构化输出） | placeholder | false | — | 一期先 DeepSeek；三层记忆映射 + function calling 查 .md 索引 |
| 「记下来」按钮 | placeholder | false | — | 存网站主库 + `#source/网页AI`；绝不自动/批量 |

## 二期

| 模块 | 状态 | enabled | 说明 |
|---|---|---|---|
| 知识库 / 项目库 + 文件浏览器 + `obsidian://` 跳转 | pending_clarify | false | 项目进度读 `STATUS.md`；不做 OCR |
| 暂存区整理（git）+ Obsidian「整理新笔记」按钮 | pending_clarify | false | 一次整理一次提交；Obsidian 松耦合、审批后执行可逆操作 |

## 三期

| 模块 | 状态 | enabled | 说明 |
|---|---|---|---|
| 定时任务 + 审批闸门 + 站内消息 | pending_clarify | false | 常驻后台、错过不补跑；提案→批准才执行（限打标签/移动/重命名） |
| 周报草稿 + 数据源开关面板 | pending_clarify | false | 模板骨架 + 程序填数 + AI 评述 |
| 资讯订阅（Qwen 内置联网） | pending_clarify | false | 一期不做 RSS；资讯只走 Qwen |
| GLM / Qwen 接入（三模型路由补齐） | pending_clarify | false | 二/三期验证后插 |

## 四期

| 模块 | 状态 | enabled | 说明 |
|---|---|---|---|
| 安卓浏览器兼容 | pending_clarify | false | Tailscale/局域网 + 认证；一期只电脑端；鸿蒙平板不做 |
| 外部数据（Outlook / 本地目录） | pending_clarify | false | `owner_adapter: outlook`；微信/QQ 不做 |

## 五期（🔮）

| 模块 | 状态 | enabled | 说明 |
|---|---|---|---|
| 图片库（资源库，与知识库/项目库平级） | pending_clarify | false | 配置里可增删资源库类型 |
| 收支统计（手动录入最简版） | pending_clarify | false | 自动获取支付宝/微信不可行 |

## 数据源适配器注册表（空）

| adapter id | 名称 | 状态 |
|---|---|---|
| _(阶段 0 无任何真实适配器，接入前先走澄清门)_ | | |

## 变更记录

- 2026-11-19（一期 A2 待办）：待办实做并推送。`items` 表 `type=todo`（标准四字段 + 完成态），
  `scripts/e2e-todos.mjs` 15 项断言全过。features.ts 新增 `todos` 模块（implemented）。
- 2026-11-19（v0.6 转向）：按需求清单 v0.6 重写。删除 Atlas v2 的 op 同步闭环 / 移动端轻视图 /
  旧占位路由，仅保留最底层骨架；模块按清单第九节五期重分类。
- 2026-11-19（阶段 1）：op 同步闭环实装并推送（已删除，见上）。
- 2026-11-19：阶段 0 建立本清单。
