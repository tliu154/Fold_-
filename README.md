# Fold_归匣

> 📌 **施工依据（唯一权威）是 [PRD.md](./PRD.md)**（2026-11-20 用户拍板）。
> 本文件只保留启动 / 环境 / 安全说明；进度、规格、纪律、决策一律以 PRD 为准。
> `PROJECT_PLAN.md` 与 `MODULES.md` 已冻结为历史存档，勿据其判断进度。
>
> Local-First 个人 AI 指挥台 · **v0.6 骨架**
> 本机运行，价值 = 整合 + 调度 + 自动化；不是内容平台 / 笔记编辑器（Obsidian 干那个）。
> 需求原始定稿见《个人AI枢纽网站_需求对齐清单_v0.6.md》。

## 当前状态（一期进行中）

底层骨架：
- Next.js 15 + TypeScript + better-sqlite3 + zod，PWA 壳
- 建表（4 张：items / memory / ai_messages / ai_usage）、登录鉴权（HMAC Cookie + Bearer）
- 实做路由：`/api/health`、`/api/auth/login`、`/api/auth/logout`、`/api/features`、`/api/todos/*`、`/api/events/*`、`/api/habits/*`、`/api/checkins/*`、`/api/goals/*`、`/api/chat/*`、`/api/memory/*`、`/api/index/*`、`/api/butler/ask`、`/api/capture/*`、`/api/libraries/*`
- **一期 A2 待办 / A3 日程 / A4 打卡已实做**：存 `items` 表（`type=todo` / `event` / `habit` / `checkin`），增删改查 + 软删除/回收站恢复
- **A5 长期目标已实做**：存本地配置 `data/goals.json`，**不进 SQLite 主库**（清单 P13 手填）
- **A6 AI 对话基础已实做**：DeepSeek-Flash 一次性返回；临时模式 Stateless 不落库、普通模式多会话 + 最近 10 轮上下文；会话壳存 `memory` 表、消息存 `ai_messages`，不新增表
- **A7 三层记忆 + 映射表已实做**：基础身份 / 功能记忆 / 临时上下文（复用对话历史）；预设模板 + 设置页编辑；映射表 TS 常量 + 可覆盖；A6 普通模式自动注入、临时模式不注入；记忆带标签可筛选；复用 `memory` 表不新增表
- **A8 function calling 检索工具已实做**：只索引 `.md` 元数据（不读正文）、白名单设置页可配（**2026-11-20 起默认 `D:\我的知识库测试`，不碰真实库**）；三个只读函数 `search_notes` / `get_note` / `stats`；A6 普通模式两阶段调用链（最多 3 轮）、临时模式不挂；内存索引不新增表
- **A9 AI 管家独立页已实做**：管家/秘书身份只处理站内问题、超范围婉拒；4 快捷按钮填入输入框；简单问答无状态不落库、复杂任务复用 A6 会话壳；assistant 映射 + A8 工具；不新增表
- **A10「记下来」已实做（收窄版）**：对话/管家页按轮次勾选、一键存主库 `items`（type=note）；AI 建议标题+标签；幂等+回填 `saved_as_item_id`；会话内待分类列表、手动整理、预览确认后导出 `.md` 到可配置知识库（默认测试库 `D:\我的知识库测试`，不碰真实库）；绝不自动/批量；不新增表
- **首页改版**：单列从上到下 5 个实内容分区（待办 / 日程 / 打卡 / 长期目标 / 备忘录占位），垂直滚动；每区最多 5 条 + 「查看全部 →」跳 tab；标题旁 **+ 号**弹框新增、**点条目**弹框编辑并带删除按钮；打卡弹框内两 tab（新建习惯 / 随手记一条）
- **二期 B1 已实做**：知识库/项目库页（只读文件浏览：类型/目录筛选 + `.md` 元数据；项目库 `STATUS.md` 进度看板）；统一资源配置 `data/libraries.json`（收敛 A8 检索白名单与 A10 导出，首次从旧配置迁移不删旧文件）；默认全指向 `D:\我的知识库测试`，真实库零接触；不做 git/OCR/编辑正文
- **二期 B2 `obsidian://` 跳转已实做**：`data/libraries.json` 加 `obsidianVault`（库名，**默认留空 → 链接禁用并提示**）；文件浏览每行「在 Obsidian 打开」链接，按最长匹配根算库内相对路径、`.md` 省略扩展名、分段 URL 编码，越权/排除规则返回 null；纯只读，不写文件、不 init git、不调模型。**库名需你先在 Obsidian 里把测试库注册为 vault 后自行填写**（网站不改 `obsidian.json`）；点击能否打开需浏览器手动验证，脚本只校验链接文本
- **入口架构**：侧栏「记录与规划」一个导航项，内部五 tab 切 待办 / 日程 / 打卡 / 备忘录 / **长期目标**（保留不动）；侧栏另有独立「AI 对话」/「AI 管家」/「知识库」项
- 简约 UI：右侧栏 + 点击切页（侧栏），首页内部为滚动分区
- 模块注册表 `features.ts`（按 v0.6 分期）+ 数据源适配器接口 + `MODULES.md`
- API 探针脚本 `scripts/probe-api.mjs`（开工第一步，已实测通过）

**用户可见功能按需求清单分期、逐个走「功能澄清门」补实**；尚未实现的一律占位或空状态。
模块状态见 [MODULES.md](./MODULES.md)，分期与顺序见 [PROJECT_PLAN.md](./PROJECT_PLAN.md)。

> 历史说明：初版曾按 Atlas v2 做过「op 同步闭环 / 移动端轻视图」，与 v0.6 需求不符，
> 已于 2026-11-19 全部删除，仅保留最底层骨架。旧代码在 Git 历史中可随时找回。

## ⚠️ Node 版本（务必先看，否则所有 API 报 500）

`better-sqlite3` 是原生模块，`.node` 二进制跟 **Node 的 ABI** 绑定。本机有两个 Node：
系统 `v24`（日常在用，ABI 137）和 WorkBuddy 内置 `v22`（ABI 127）。API 若报
`NODE_MODULE_VERSION 127 vs 137` 就是版本错配。**统一用系统 Node 24**：

```bash
node -v     # 必须 v24.x
```

若用错版本装过依赖，用 Node 24 重编译一次（无需 VS，走预编译包）：

```bash
export PATH="/d/Program Files/nodejs:$PATH"
npm rebuild better-sqlite3
node -e "require('better-sqlite3'); console.log('OK')"
```

> `package.json` 已加 `engines.node >= 24`。

## 快速开始

```bash
npm install
cp .env.example .env
# 编辑 .env：设置 AUTH_PASSWORD / SESSION_SECRET；一期填 DEEPSEEK_API_KEY
npm run dev
# 打开 http://localhost:3000
```

首次访问页面自动跳登录；首次访问 `/api/health` 时自动建表（幂等）。

## 开工第一步：API 探针

验证 DeepSeek 的 model id / OpenAI 兼容 / 结构化输出 / function calling 四项：

```bash
node scripts/probe-api.mjs
```

> 清单里的型号名是核实快照，不能直接当配置；以探针实测结果为准（真实可用 `deepseek-flash` / `deepseek-v4-pro`）。
> API key 只从 `.env` 读取，绝不进代码 / Git / 前端。

## 一期验收

服务启动后跑：

```bash
node scripts/e2e-todos.mjs     # 待办 15 项
node scripts/e2e-events.mjs    # 日程 15 项
node scripts/e2e-checkins.mjs  # 打卡 25 项
node scripts/e2e-goals.mjs     # 长期目标 16 项
node scripts/e2e-chat.mjs      # AI 对话 25 项（⚠️ 会真实调用 DeepSeek，少量费用）
node scripts/e2e-home.mjs      # 首页链路 25 项（无模型费用）
node scripts/e2e-memory.mjs    # 三层记忆 29 项（含 1 次真实模型调用）
node scripts/e2e-index.mjs     # 检索工具 24 项（含真实模型调用工具）
node scripts/e2e-butler.mjs    # AI 管家 14 项（含真实模型调用）
node scripts/e2e-capture.mjs   # 记下来 39 项（含 2 次真实模型调用；写测试库测完清理）
node scripts/e2e-libraries.mjs # 知识库/项目库 28 项（只操作测试库，测完清理）
node scripts/e2e-obsidian.mjs  # obsidian:// 跳转 33 项（只操作测试库，无模型费用）
```

注意：登录限流 10 次/60 秒，**不要一口气连跑十几个脚本**，否则后面的会因 429 假失败。

覆盖未登录 401 / 新增 / 字段回读 / 完成切换或日期分组或连续天数 / 筛选 / 编辑 /
软删除 / 回收站 / 恢复 / 参数校验 / 配置文件落盘 / 会话隔离与上下文 /
首页 5 个分区的并行加载与新增→编辑→删除链路。
`e2e-home.mjs` 只覆盖 API 链路，浏览器里的点击交互需手动验证。

## 配置（v0.6）

- 认证：`AUTH_PASSWORD` / `SESSION_SECRET`
- 数据目录：`DATA_DIR`（SQLite 主库 + `goals.json` 长期目标配置；**绝不放进任何文件同步工具**）
- 长期目标：`data/goals.json` 是本地配置文件，不进主库；外部手改需刷新页面（无 watcher）
- AI 路由：一期 `DEEPSEEK_API_KEY / BASE_URL / MODEL`；二/三期 `QWEN_*`、`REASONING_*` 留空
- 预算：`AI_MONTHLY_BUDGET`（元，0 = 不限）
- Obsidian：`OBSIDIAN_VAULT_PATH`（二期，留空不影响其它功能）

## 定时任务与常驻（三期 C1）

- **调度跑在 Next.js 进程内**：`src/instrumentation.ts` 启动时注册 `node-cron`，每 60 秒盘点一次。
  任务配置 `data/scheduler.json`、运行态 `data/scheduler-state.json`（`data/` 不进 Git）。
- **不写任何系统启动项**：本项目不建注册表项、不建 Windows 任务计划、不装服务、不放开权限。
  服务没开就不跑；重新打开后按「错过不补跑」规则只累计次数，并生成一条站内消息汇总。
- **手动启动**：先 `npm run build`（需系统 Node 24），再双击 `scripts/start-server.bat`
  或在项目根目录 `npm run start`。窗口关掉 / 电脑重启后服务就停了，这是预期行为。
- 想自己实现开机自启：把 `scripts/start-server.bat` 的快捷方式放进
  `shell:startup`（Win+R 输入）。这是用户手动操作，本项目不会代做。
- **站内消息**在侧栏「站内消息」页：未读计数、全部/未读筛选、标记已读、删除；
  同页下方是定时任务配置（增删改、立即运行、结构化选时、自然语言解析预览→确认才保存）。
- 自然语言解析会调 **1 次** DeepSeek 结构化输出；模型不可用时会明确提示改用结构化选时，
  不会假装成功。三个内置任务本身纯程序填数，**不调用模型**；AI 评述留到周报轮次。
- 验收脚本：`node scripts/e2e-scheduler.mjs`（需先启动服务）。

## 分期（v0.6 第九节）

| 期 | 范围 |
|---|---|
| 一期 | 本机骨架 + 右侧栏多页 + 首页仪表盘 + AI 对话（管家+普通、三层记忆、检索工具、DeepSeek） |
| 二期 | 知识库/项目库 + 文件浏览 + `obsidian://` 跳转 + git 整理 + Obsidian 按钮 |
| 三期 | 定时任务 + 周报 + 审批闸门 + Qwen 资讯 + 数据源开关 + GLM/Qwen 接入 |
| 四期 | 安卓浏览器兼容 + 外部数据（Outlook / 本地目录） |
| 五期 | 图片库 / 收支统计（🔮） |

## 安全

- 所有 `/api/*`（除 health）必须鉴权；密钥只在服务端 `.env`，`.env` 已进 `.gitignore`
- 服务只监听局域网，不开公网端口、不做端口映射
- SQLite 数据文件、锁文件绝不进 Git / 文件同步工具

## 开发纪律（清单 3.1）

- **完整且最新的纪律见 [PRD.md](./PRD.md) §6**；本节仅摘要，冲突时以 PRD 为准。
- 用户可见功能开工前先问清 → 等回答 → 复述确认 → 实现 → 回问是否符合预期
- **每轮推进几个功能不设死限制，哪样效率高哪样来**（2026-11-20 放宽，取代旧「一次只推进一个功能」）；技术选型由助手决定
- 新数据源走 `DataSourceAdapter` 接口，不改 items 主表；新增表必须先问用户
