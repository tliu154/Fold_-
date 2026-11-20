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
| 首页分区视图（就地新增 / 编辑 / 删除） | implemented | true | `src/components/HomeDashboard.tsx`、`src/components/Modal.tsx` | 用户要求改版：单列从上到下 5 分区、垂直滚动、每区最多 5 条 + 查看全部跳 tab；+ 号弹框新增、点条目编辑带删除；打卡弹框内两 tab；侧栏「记录与规划」保留不动；`e2e-home.mjs` 25/25 过 |
| 模块开关 / 适配器接口 / MODULES.md | implemented | true | `src/features.ts`、`src/adapters/` | 扩展点机制 |

## 一期

| 模块 | 状态 | enabled | 代码位置 | 待澄清 / 说明 |
|---|---|---|---|---|
| API 探针 | placeholder | false | `scripts/probe-api.mjs` | 开工第一步，已实测 5/5 过；model id 纠正为 deepseek-flash |
| 待办（网站自建主库 CRUD） | implemented | true | `src/lib/todos.ts`、`src/app/api/todos/*`、`src/components/TodoView.tsx` | A2 已实做：标题/截止/标签/备注 + 完成切换 + 筛选 + 软删除/恢复；`items` 表 `type=todo`，无新增表；e2e 15/15 过 |
| 日程（按日期分组） | implemented | true | `src/lib/events.ts`、`src/app/api/events/*`、`src/components/EventView.tsx` | A3 已实做：标题/日期/起止时间/地点/备注/标签 + 今天/明天/本周/更远/已过去分组 + 软删除/恢复；`items` 表 `type=event`；e2e 15/15 过 |
| 打卡（习惯 + 随手记 / 连续天数） | implemented | true | `src/lib/checkins.ts`、`src/app/api/habits/*`、`src/app/api/checkins/*`、`src/components/CheckinView.tsx` | A4 已实做：习惯定义+每日打卡(可补记)+随手记一条、同习惯同日幂等、连续天数(今天没打从昨天算)、习惯软删除保留记录；`items` 表 `type=habit`/`type=checkin`；e2e 25/25 过 |
| 长期目标（本地配置手填） | implemented | true | `src/lib/goals.ts`、`src/app/api/goals/*`、`src/components/GoalView.tsx` | A5 已实做：五项字段(标题/描述/目标日期/状态/进度手填)，存 `data/goals.json` **不进 SQLite 主库**（清单 P13）；独立不联动；删除直接移除；「规划」tab 改名「长期目标」；e2e 16/16 过 |
| 首页仪表盘（备忘录占位） | placeholder | false | `src/components/AppShell.tsx` | **入口架构**：侧栏「记录与规划」一个导航项 + 内部**五 tab**（待办/日程/打卡/备忘录/长期目标，用户确认，保留）；首页已改版为单列滚动分区，「查看全部 →」跳对应 tab；仅备忘录 tab 仍占位 |
| AI 对话基础（普通对话两模式 / 多会话） | implemented | true | `src/lib/chat.ts`、`src/app/api/chat/*`、`src/components/ChatView.tsx` | A6 已实做：DeepSeek-Flash 一次性返回；临时模式 Stateless 不落库、普通模式多会话(新建/切换/重命名/删除/清空)+最近 10 轮上下文；会话壳存 `memory` 表 `scope=chat_session`、消息存 `ai_messages`，**不新增表**；侧栏新增「AI 对话」项；结构化输出仅预留 `callStructured` 不落地；不做 SSE/记账/预算/AI 限流（v0.6 未要求）；e2e 25/25 过（含真实模型调用） |
| 三层记忆 + 功能映射表 | implemented | true | `src/lib/memory.ts`、`src/app/api/memory/*`、`src/components/MemorySettings.tsx` | A7 已实做：三层=基础身份(profile)/功能记忆(feature:chat)/临时上下文(复用 A6 最近10轮)；预设模板懒初始化 + 设置页编辑；映射表 TS 常量默认 + `memory` 表覆盖供设置页改；记忆带 tags 可按标签筛选；普通模式按 chat 映射注入 system、临时模式不注入；与 `chat_session` scope 隔离，**不新增表**；本期仅 chat 生效，assistant/capture/report 留预留条目；e2e 29/29 过 |
| function calling 检索工具（.md 索引） | implemented | true | `src/lib/indexer.ts`、`src/app/api/index/*`、`src/components/IndexSettings.tsx` | A8 已实做：只索引 `.md` 元数据(路径/标题/标签/mtime，不读正文)，只读前4KB；白名单存 `data/index-config.json` 设置页可改，默认 `D:\我的知识库`；排除密钥文件/隐藏目录/项目自身；内存索引启动建一次+手动刷新；三只读函数 `search_notes`/`get_note`/`stats`；普通模式两阶段调用链(最多3轮)、临时模式不挂；**不新增表**；e2e 24/24 过（含真实模型调用工具） |
| AI 管家独立页 | implemented | true | `src/lib/butler.ts`、`src/app/api/butler/ask`、`src/components/ButlerView.tsx` | A9 已实做：管家/秘书身份只处理站内问题、超范围婉拒；4 快捷按钮(填入输入框不自动发)；简单问答 Stateless 不落库、复杂任务「开会话」复用 A6 `chat_session` 带上下文；assistant 功能记忆映射 + A8 三工具；`sendMessage` 加 `butlerSystem` 开关(A6 行为不变)；**不新增表**；e2e 14/14 过（含真实模型调用） |
| 「记下来」按钮（收窄版） | implemented | true | `src/lib/capture.ts`、`src/app/api/capture/*`、`src/components/CapturePanel.tsx` | A10 已实做：对话/管家页按轮次勾选、一键存主库 `items`(`type=note`，不新增表)；点记下来时调一次 AI 出标题+标签建议；固定 `#type/笔记`+`#source/网页AI`；同会话+同批消息幂等、回填 `saved_as_item_id`；会话内展开待分类列表、手动整理转 done；导出前预览确认后写 `.md`，知识库根可配(默认 `D:\我的知识库测试`)，不碰真实库；绝不自动/批量；e2e 39/39 过 |

## 二期

| 模块 | 状态 | enabled | 说明 |
|---|---|---|---|
| 知识库/项目库 文件浏览 + 进度看板（B1） | implemented | true | `src/lib/libraries.ts`/`files.ts`/`projects.ts`、`src/app/api/libraries/*`、`KnowledgeView.tsx` | B1 已实做：统一资源库配置 `data/libraries.json`(收敛 A8 检索白名单与 A10 导出，首次从旧配置迁移不删旧文件)；只读文件浏览(类型/目录筛选、md 前4KB取标题标签、排除密钥/隐藏、上限5000)；项目库 `STATUS.md` 进度看板(progress%+checkbox 只读、不猜 README)；**默认全指向 `D:\我的知识库测试`，零接触真实库**；不新增表；e2e 28/28 过 |
| `obsidian://` 跳转（B2） | implemented | true | `src/lib/files.ts`(buildObsidianUri)、`src/lib/libraries.ts`(obsidianVault)、`KnowledgeView.tsx` | B2 已实做：库名可配(默认空→链接禁用并提示)、`.md` 省略扩展名、URL 编码、按最长匹配根算库内相对路径、越权/排除返回 null；files 与 meta 返回 `obsidian_uri`；纯只读不写文件、零接触真实库；`e2e-obsidian.mjs` 33/33 过 |
| 暂存区整理（git）+ Obsidian「整理新笔记」按钮 | pending_clarify | false | 下一轮：一次整理一次提交；B2 澄清门已定「只在测试库 git init」+「变更预览→点确认才执行」(本功能内弹框，非三期审批闸门)；Obsidian 松耦合；不做 OCR |

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

- 2026-11-20（二期 B2 `obsidian://` 跳转）：开工前按纪律读 plan/MODULES 确认无重复实现；
  澄清门四项：本轮只做跳转（用户定）、测试库 git init 与变更确认弹框留下一轮、
  **库名由用户手动在 Obsidian 注册后填写**（AI 不改 `obsidian.json`）。
  实现：`libraries.json` 加 `obsidianVault`(默认空)、`buildObsidianUri` 纯函数
  (最长匹配根算相对路径 / `.md` 省略扩展名 / 分段 URL 编码 / 越权与排除返回 null)、
  files 与 meta 返回 `obsidian_uri`、知识库页库名输入框 + 链接禁用提示。
  纯只读：不写文件、不 init git、不调模型、零接触真实库。
  `e2e-obsidian.mjs` 33/33 过；十一套既有回归分两批跑全过（避开登录限流）。
  顺手合并二期表里两行重复的 git 整理 placeholder。
- 2026-11-20（二期 B1 知识库/项目库 文件浏览+进度看板）：按用户要求先全改测试库
  （A8 白名单→`D:\我的知识库测试`；三份配置全指向测试库，真实库零接触）；统一资源库配置
  收敛 A8/A10；只读文件浏览 + STATUS.md 进度看板。`e2e-libraries.mjs` 28/28 过，
  十套既有回归全过。**用户一度要迁移项目到 D:/+放开权限，最终决定不迁移不放权。**
- 2026-11-20（一期 A10「记下来」收窄版）：按轮次勾选+一键存主库+AI建议+幂等回填+
  待分类列表+手动整理+预览导出 .md 到测试知识库；e2e 39/39 过、九套回归全过。
  **期间踩坑**：① `npm run build && npm run start` 串联时 build 被沙箱 safe-delete 拦下
  但 start 仍起旧 .next → 断言假失败，须分开 build/start 且 build 用越权；
  ② `resolveExportDir` 按 tags 遍历导致固定 `type/笔记` 抢先命中，改为按 dirMap 优先级；
  ③ 文件名 slice 截出半截分钟，改为显式 YYYYMMDD_HHMM。
- 2026-11-20（一期 A9 AI 管家独立页）：开工前先读 plan 确认无重复实现；实做管家身份+
  范围婉拒、4 快捷按钮、Stateless/会话双模式(复用 A6 壳)、assistant 映射+A8 工具。
  `e2e-butler.mjs` 14/14 过；八套回归全过。
- 2026-11-20（一期 A8 function calling 检索工具）：索引 + 白名单 + 设置页 + 三只读函数
  （已有实现）+ 本轮接入 `chat.ts` 两阶段调用链（最多3轮、tools_used）。`e2e-index.mjs`
  24/24 过；七套回归全过。**教训：开工前必须先读 `PROJECT_PLAN.md`，本轮因未读导致
  A8 被并行写了两套实现，已删重复的一套；此纪律已写入 PROJECT_PLAN.md。**
- 2026-11-19（一期 A7 三层记忆 + 映射表）：实做三层记忆与功能映射，A6 普通模式接入注入、
  临时模式保持不注入；复用 `memory` 表不新增表；设置页新增「记忆与映射」区。
  `scripts/e2e-memory.mjs` 29/29 过；六套回归 15/15、15/15、27/27、16/16、25/25、25/25 过。
- 2026-11-19（首页 UI 改版，插队于 A7 之前）：首页从「卡片跳 tab」改为单列从上到下
  5 个实内容分区 + 垂直滚动 + 就地 + 号弹框编辑；新增 `HomeDashboard.tsx`/`Modal.tsx`；
  补 `PATCH /api/checkins/[id]` 让随手记可编辑（仅自由记录，习惯打卡不可编辑）。
  `scripts/e2e-home.mjs` 25/25 过；五套既有 e2e 回归 15/15、15/15、27/27、16/16、25/25 过。
  **A7 三层记忆已过完澄清门但暂停**，等这次改版后再开工。
- 2026-11-19（一期 A6 AI 对话基础）：实做普通对话两模式 + 多会话，DeepSeek-Flash 一次性返回；
  临时模式不落库；**不新增表**（会话壳用 memory、消息用 ai_messages）。侧栏新增「AI 对话」项，
  「AI 管家」保留占位。`scripts/e2e-chat.mjs` 25/25 过（含真实模型调用），
  待办/日程/打卡/长期目标回归 15/15、15/15、25/25、16/16 过。
- 2026-11-19（一期 A5 长期目标）：实做本地配置方案（`data/goals.json`，不进主库），
  五项字段、独立不联动；「规划」tab 改名「长期目标」。`scripts/e2e-goals.mjs` 16/16 过，
  待办/日程/打卡回归 15/15、15/15、25/25 过。
- 2026-11-19（一期 A4 打卡）：打卡实做（`items` 表 `type=habit`/`type=checkin`，连续天数、
  幂等、补记、自由记录隔离、软删除保留记录）；新增「打卡」第五 tab + 首页补回打卡卡。
  `scripts/e2e-checkins.mjs` 25/25 过，待办/日程回归各 15/15 过。
- 2026-11-19（一期 A3 日程 + 入口重构）：日程实做（`items` 表 `type=event`，按日期分组，
  `scripts/e2e-events.mjs` 15/15 过）；入口按用户确认收敛为「记录与规划」单一导航项 + 四个 tab，
  待办并入 tab（复用 TodoView）。修复时间字段空值校验。待办 e2e 回归 15/15 过。
- 2026-11-19（一期 A2 待办）：待办实做并推送。`items` 表 `type=todo`（标准四字段 + 完成态），
  `scripts/e2e-todos.mjs` 15 项断言全过。features.ts 新增 `todos` 模块（implemented）。
- 2026-11-19（v0.6 转向）：按需求清单 v0.6 重写。删除 Atlas v2 的 op 同步闭环 / 移动端轻视图 /
  旧占位路由，仅保留最底层骨架；模块按清单第九节五期重分类。
- 2026-11-19（阶段 1）：op 同步闭环实装并推送（已删除，见上）。
- 2026-11-19：阶段 0 建立本清单。
