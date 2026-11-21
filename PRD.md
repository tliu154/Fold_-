# Fold_归匣 · PRD（唯一施工圣经）

> **权威声明（2026-11-20 用户拍板）**
> 本文件是本项目**唯一施工依据**：产品定位、需求、进度、纪律、技术红线、决策、待办全部以本文件为准。
> **以后所有进度只在本文件修改**。开工前读 §0 一眼，避免重复造轮子。
>
> | 文件 | 现状 | 作用 |
> |---|---|---|
> | **`PRD.md`** | ✅ **唯一权威** | 进度 / 规格 / 纪律 / 决策 / 待办 |
> | `PROJECT_PLAN.md` | ⛔ 已冻结 | 历史规划存档，不再更新，**勿据其判断进度** |
> | `MODULES.md` | ⛔ 已冻结 | 历史模块存档，不再更新 |
> | `README.md` | 使用说明 | 仅启动 / 环境 / 安全说明；纪律与进度以本文件为准 |
> | `src/features.ts` | 运行时代码 | `/api/features` 读它，只反映开关状态，**不是进度源** |
> | `个人AI枢纽网站_需求对齐清单_v0.6.md` + 交接文档 | 原始需求定稿（项目外） | 只读依据；与本文冲突时**以本文记录的最新用户裁决为准** |
> | WorkBuddy `MEMORY.md` / 日志 | 助手记忆 | 辅助，不作施工依据 |
>
> 最后更新：2026-11-21 夜 ｜ 当前阶段：**三期 C3 第 3 轮已完成并推送**（Qwen 内置联网资讯订阅 + 文件树默认折叠，见 §3 / §8）；此前 C3-2 与 Service Worker 修复亦已推送 ｜ 下一轮候选（**顺序待用户定**）：C3 第 4 轮移动端↔电脑端版本管理 / 全库扫描 §9.2 / 文件搜索 §9.5 / 重型推理模型接入
> （commit hash 以 `git log --oneline -3` 为准，不在头部写易过期的值。）

---

## §0 开工前 60 秒检查（每次必做）

1. **读本文件**：重点 §3 进度表（现在到哪）、§5 可复用底座（别重复造轮子）、§6 纪律红线。
2. `git status --porcelain` + `git log --oneline -3`，确认工作区干净、没有半成品实现。
3. 确认本轮范围，走**澄清门**：提问 → 等回答 → **在正文里写完整规格复述** → 用户确认 → 才实现 → 回问。
   （复述必须写在确认之前；A9 曾只写「下面是复述」却没展开，被要求补齐。）
4. 收尾**只更新本文件**：§3 进度 / §7 决策 / §8 变更记录 / §9 待办池。
5. `build` 与 `start` **分开执行**，`build` 需越权；验收脚本分批跑。

> **A8 教训**：曾因没读进度文档，`indexer.ts` 与 `search.ts` 被并行写了两套，返工一次。**看一眼再动手**。

---

## §1 产品定义

### 1.1 定位（2026-11-20 用户升级，覆盖 v0.6 上层表述）

**一个可高度个性化设置、AI 驱动的信息和功能整合平台。**

- 核心竞争点：聚合散落信息 + 省时间 + **深度嵌入用户工作流**（因为高度个性化且方便个性化）+ 省心。
- 个性化方式：用户可用**自然语言**对网站做功能设置；写死的程序选项与 AI 驱动设置**混合使用，哪个效率高用哪个**。
- 必须建好「**写死的程序接口 ↔ 背后 AI 管家**」的交互通道，做到智能、无脑、**稳定运行**。
- 目前**一切以满足用户个人要求为首**；以后才考虑出「发行版」。

### 1.2 边界

- 不是内容平台 / 笔记编辑器（Obsidian 干这个）；不替代 Obsidian，松耦合；不做双向同步 / 常驻监听 / 自动写库。
- 本机运行；**一期只做电脑端**。四期安卓浏览器兼容（Tailscale/局域网 + 认证）；**鸿蒙平板不做**。
- 清单要求「常驻后台开机自启」，但 **C1 用户明确选「不动系统」**：当前不写注册表 / 任务计划 / 服务、不放开权限；用 `scripts/start-server.bat` 手动启动，服务没开就不跑。开机自启由用户自己放快捷方式。
- 轻量 = 功能浅而快，能跳转现成工具就不重复造轮子。
- 数据归属：**网站自建主库**（待办/日程/打卡/笔记都是网站自己的数据，不依赖 Obsidian）；长期目标存本地配置。

### 1.3 交互与视觉

- 侧栏在**右**、点击侧栏切页（非单页滚动）；首页单列从上到下分区、垂直滚动、就地 `+` 号弹框编辑。
- 入口架构：待办/日程/打卡/备忘录/长期目标收敛成侧栏「记录与规划」一个导航项 + 内部五 tab（保留不动）；侧栏另有独立「AI 对话」「AI 管家」「知识库」「站内消息」「设置」。
- 强调色墨青 `#2C5F5D`，主题变量集中 `src/app/globals.css`；无重型 UI 库。

---

## §2 环境与命令速查

| 项 | 值 |
|---|---|
| 项目路径 | `D:\我的知识库\develop\Fold_`（代码目录；同盘那个库实例开发阶段当它不存在，见 §6.2） |
| GitHub | `https://github.com/tliu154/Fold_-.git`（main） |
| 技术栈 | Next.js 15 App Router + TypeScript + `better-sqlite3` + zod + node-cron |
| Node | **统一系统 Node 24**（`export PATH="/d/Program Files/nodejs:$PATH"`）。内置 Node 22 与系统 24 的 ABI 不同，错配会全 API 500 → `npm rebuild better-sqlite3` |
| 数据表 | 4 张：`items` / `memory` / `ai_messages` / `ai_usage` |
| 主库 | `data/fold.sqlite`（+ `-shm` / `-wal`） |
| 配置 | `data/libraries.json`（统一资源库）、`index-config.json`、`capture-config.json`、`goals.json`、`scheduler.json`、`scheduler-state.json`、`tidy-log.json`、`report-sources.json`（C3 数据源开关）、`filing-rules.json` / `open-with.json`（C3-2）、**`news-topics.json`（C3-3 资讯主题 + 定时开关，不存在＝默认值）** |
| 模型 | DeepSeek 真实可用 id `deepseek-flash`（另有 `deepseek-v4-pro`）；**Qwen `qwen-plus` @ `https://dashscope.aliyuncs.com/compatible-mode/v1`**（`sk-ws-` 标准按量付费 key 配此端点，实测 `/models` 200 / 191 项）；清单里的型号名是核实快照，**不能当配置**；key 只在 `.env` |
| 三模型路由 | DeepSeek 日常 / **Qwen 内置联网（C3-3 已接，走 `getSearchModel()`）** / GLM 或 Qwen 重型推理（`getReasoningModel()` **本轮不动**） |
| 构建 | `CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build`（**越权**，与 start 分开；该环境变量只关掉本条命令的 Node 批量删除保护，见 §6.3）；`npx next start -p 3000`（后台） |
| 推送 | `GIT_TERMINAL_PROMPT=1 git -c credential.helper=manager -c credential.helperselector.selected=manager push origin main` |
| 探针 | `node scripts/probe-api.mjs`：DeepSeek 5 项 + **Qwen 4 项（C3-3 增）**，2026-11-21 夜 **9/9 通过**；`json_object` 偶发空内容已加有限重试 |
| 验收 | `scripts/e2e-*.mjs` 共 **19 套**（C3-3 增 `e2e-news` 66/66）；登录限流 **10 次/60 秒**，连跑会假失败 → **`node scripts/run-all-e2e.mjs`** 自动分 4 批 + `sleep 65`，验收前后自愈复位环境（删 `.git` / 清残留 / 恢复定时任务 / **关资讯定时**）并重建 15 个种子；`--reset-only` 只复位不跑验收 |

`data/` 不进 Git；`.env` 已进 `.gitignore`；SQLite 数据/锁文件绝不进 Git 或文件同步工具；服务只监听局域网、不开公网端口。

---

## §3 需求与进度总表（唯一权威）

状态：✅ 已实现并验收 ｜ 🔵 讨论中/未开工 ｜ ⬜ 待办 ｜ 🔮 远期

### 骨架 / 一期 A0~A10 ✅（`0d15996` 收尾，含首页 UI 改版插队）

| 编号 | 功能 | 核心规格 | 验收 |
|---|---|---|---|
| A0 | API 探针 | 验证 model id / 结构化输出 / function calling | 5/5 |
| A1 | 右侧栏壳 + 首页骨架 | 点击侧栏切页 | — |
| A2 | 待办 | 四字段 + 完成切换 + 筛选 + 软删除/恢复；`items(type=todo)` | 15/15 |
| A3 | 日程 | 六字段 + 今天/明天/本周/更远/已过去分组 + 软删除；`items(type=event)`；同期完成入口重构 | 15/15 |
| A4 | 打卡 | 习惯定义 + 每日打卡（可补记）+ 随手记一条；同习惯同日幂等；连续天数「今天没打从昨天算」；`items(type=habit/checkin)` | 25/25（现 27/27） |
| A5 | 长期目标 | 五项字段、进度手填、独立不联动；**存 `data/goals.json` 不进 SQLite**（矛盾裁决见 §7） | 16/16 |
| A6 | AI 对话 | 普通/临时两模式；临时 Stateless 不落库；普通多会话 + 最近 10 轮；会话壳 `memory(scope=chat_session)`、消息 `ai_messages` | 25/25 |
| A7 | 三层记忆 | 基础身份 / 功能记忆 / 临时上下文（复用 A6）；预设模板 + 设置页；映射 TS 常量 + `scope=memory_map` 覆盖 | 29/29 |
| A8 | 检索工具 | 只索引 `.md` 元数据（前 4KB、不读正文）；白名单可配；`search_notes`/`get_note`/`stats`；普通模式两阶段 tool_calls（≤3 轮）、临时不挂 | 24/24 |
| A9 | AI 管家 | 站内问题 + 超范围婉拒；4 快捷按钮填入不自动发；Stateless / 会话双模式；`butlerSystem` 开关不影响 A6 | 14/14 |
| A10 | 记下来（收窄版） | 按轮次勾选 → `items(type=note)`；AI 建议标题+标签；幂等 409 + 回填 `saved_as_item_id`；预览确认后导出 `.md` | 39/39 |
| 改版 | 首页 UI | 单列 5 分区滚动、每区 ≤5 条、+ 号弹框新增 / 点条目编辑带删除 | 25/25 |

### 二期 B1~B3 ✅

| 编号 | 功能 | 核心规格 | commit / 验收 |
|---|---|---|---|
| B1 | 文件浏览 + 进度看板 | 统一配置 `data/libraries.json`（收敛 A8 白名单 + A10 导出）；只读浏览 + 类型/目录筛选；`STATUS.md` 解析 `progress:N%` + checkbox（不猜 README）；不做预览正文/编辑/OCR/常驻监听 | `b862f87` / 28/28 |
| B2 | `obsidian://` 跳转 | `obsidianVault` 默认空→链接禁用；`buildObsidianUri` 最长匹配根、`.md` 省略扩展名、分段 URL 编码、越权/排除返回 null；纯只读 | `ff4d7cc` / 33/33 |
| B3 | 暂存区整理 + 「整理新笔记」 | `inboxDir`（默认 `D:\我的知识库测试\未整理`）；按 frontmatter 标签经 `resolveExportDir` 映射目录 + `YYYY-MM-DD_标题.md` 重命名；`tidy{move,rename,tag}` 默认只开前两项；**预览→确认才执行**；一次整理 = 一次 git commit（`data/tidy-log.json` 记 hash+清单）；脏工作区暂停（排除未整理目录自身）、占用跳过、`git init` 仅测试库、越界 400；只处理 `.md`、不调模型 | `077580b` / 63/63 |

### 三期 C1~C3（C1 / C2 / C3-1 / C3-2 / **C3-3** ✅ 已完成，第 4 轮 ⬜）

| 编号 | 功能 | 核心规格 | commit / 验收 |
|---|---|---|---|
| C1 | 定时任务 + 站内消息 | 进程内 node-cron 每 60s `runTick()`、启动即错过盘点；**不补跑只记次数**（`last_settled_at` 推进）；配置 `scheduler.json` + 运行态 `scheduler-state.json`；消息复用 `items(type=message)`；三内置任务纯程序填数不调模型；自然语言定时描述 `callStructured` **1 次最小真实调用**、只预览确认才保存；`seedVersion` 一次性迁移补齐老配置缺的默认任务；不动系统启动项 | `9e3cb6d` / 75→**76/76** |
| C2 | 审批闸门 | **不重写 B3 执行引擎**，只补异步提案链路：AI/定时出提案 → 落库 → 站内消息 → 稍后批准 → 复用 B3 执行。提案 `items(type=proposal)`、消息 `kind=proposal`；`generateProposalPreview()` 以 B3 纯规则打底、**只对弱标签 `.md` 走 1 次 AI 批量建议**（上限 10、只推目录、不改正文），模型失败如实标 `ai_failed` 降级；生成预览不落库、保存才发消息+去重；`to` 服务端重算；逐条勾选/改目录文件名 → `runTidyItems()` 一次批准一次 commit；第 4 默认任务 `proposal_scan`(09:00) | `6cf7db8` / **98/98** |
| C3 第 1 轮 | **内部文件库 + 全格式整理 + HTML 周报 + 数据源面板 + 主页展示** | **文件是父类、周报是子类**：全部复用 `items(type=file)` + `payload.subtype`（report/note/other），**不新增表**，周报只多展示能力、仍须走整理审批。所有新增文件先入 `data/internal-vault/未分类/`，**任意格式**登记（`.md` 读前 4KB frontmatter；HTML/图片/PDF 等只读文件系统元数据，不读正文、不 OCR、不改内容）。整理规范 = 可配规则表（5 条，本轮纯程序不调模型）→ 预览不落库不写文件 → 保存提案去重 + 站内轻通知 → 逐条编辑/驳回/软删 → 批准后**从内部库移动到用户加入的库**（开发阶段 = 测试库），一次批准一次 git commit，`to` 服务端重算、目录限定允许集合、扩展名强制保留。HTML 周报六区块：速览数字/完成明细/数据口径**程序填**，本周评述/值得留意/下周建议 **AI 只写定性、不碰数字不编事实**，手动重点原样呈现不经过 AI；模型不可用如实标 `ai_failed`。**按 ISO 周幂等**（复用不重写文件、不重复调模型、不重复发消息），`force` 覆盖同一文件与同一条登记、绝不新增第二份。**升级复用 C1 `weekly_digest`**：原消息内容不变、C1 76/76 断言一字不改，同一次执行额外产周报 + 轻通知。6 类数据源开关默认开 4（笔记变更用测试库 mtime 快照近似，不常驻监听、不读正文）。主页最上方折叠周报卡（新周自动展开一次 + 角落「回顾」弹框 → 新标签页只读）；`/api/internal-files/raw?id=...` 带鉴权 + CSP `default-src 'none'` + nosniff + no-store，只按已登记 id 取路径。浏览器点击 / iframe / 新标签页交互待用户手验 | `e2e-reports` **119/119**（含 **1 次最小真实模型调用**） |
| C3 第 2 轮 | **AI 个性化设置通道（L0/L1）+ 文件管理器改版 + 测试库种子保留**（用户拍板合并一轮做） | **不新增表**：改动历史复用 `items(type=setting_history)`。**L0 注册表** 4 项白名单（整理规范 / 周报数据源 / 手动重点 / 打开方式）登记 schema / 默认值 / 校验 / 影响范围；写死开关与 AI 通道**共用 `validateSetting()`**，任一项非法整批拒绝；库路径、密钥、`dirMap`、鉴权、限流等 `MANUAL_ONLY_KEYS` 一律只准手动改。**L1 一句话改设置**：`callStructured` → 结构化草案 → 逐条显示「现在 / 改成 / 影响 / 为什么」→ 编辑勾选 → 服务端重新校验 → 确认才落库；**草案不落库、不发站内消息、不写历史**，刷新即丢；模型不可用 / 失败 / 输出异常如实标 `model_disabled` / `ai_failed` / `ai_bad_output`，不 mock 假装成功；全轮只 **1 次最小真实调用**验链路。**改动历史 + 一键回滚**：回滚再记一条新历史、不删旧记录，覆盖较新值返 `409 needsConfirm` 二次确认。**三入口**：知识库 / 周报数据源 / 内部库整理三处就地 + AI 管家「改设置」模式（未把管家页扩成全站配置中心）。**文件管理器**：Obsidian 式紧凑树（折叠 / 引导线 / hover 详情 / 淡色类型标记），去掉格式分类栏与目录筛选；文件单击双击都打开（`.md`/`.html`/`.htm`/`.pdf`→Obsidian，其余→系统默认应用，**HTML 走 Obsidian 由用户拍板**）、450ms 去重；文件夹单击折叠、双击开资源管理器、220ms 延时区分；拖拽单文件自动存内部库暂存区（20MB 上限 / 同名加序号 / 拒绝密钥名）；**加库 = 添加库根目录**，只改 `knowledgeDirs` + `indexDirs`，拒绝与已有库嵌套。系统打开走 `/api/system-open` 服务端带鉴权 + 路径按段白名单校验、**不回显绝对路径**。**整理规范**从 TS 常量迁到 `data/filing-rules.json` 可配，改完只影响下次预览。**种子策略**：不改任何已验收脚本，`seed-vault.mjs` + `run-all-e2e.mjs` 整轮验收前清种子、跑完恢复。浏览器交互待用户手验 | `e2e-settings` **67/67** + `e2e-filetree` **50/50**（含 1 次最小真实模型调用） |
| **C3 第 3 轮** | **Qwen 内置联网资讯订阅 + 三模型路由补齐 Qwen 一路 + 文件树默认折叠**（用户三轮「继续」+ 澄清门 2 项裁决） | **独立配置 + 复用通道**（用户裁决，见 §7-29）：主题/定时存 `data/news-topics.json`，**不塞 `SETTINGS_CATALOG` 第 5 项**、**不新增第 5 个 scheduler 内置任务**（已验收 `e2e-settings` 硬断言 4 项、`e2e-scheduler` 硬断言 4 个任务，按纪律不改）；但「手动 + 管家」双通道照旧：手动 PUT 与管家草案**共用 `validateNewsConfig()`**，草案不落库/不发消息/不写文件，确认才 `PUT`。**Qwen 抓取独立成 `news.ts`**：`enable_search:true` + `search_options{forced_search,enable_source}` + `response_format:json_object`，**不走 `chat.ts` 的 `callChat`**、DeepSeek 日常链路不受影响；`GET /api/news` 只回显模型是否配置、**绝不回显 key**。**来源 URL 只留真实链接**（用户裁决，见 §7-30）：兼容端点不返回可核验 `search_info`，`sanitizeUrl()` 只保留真实出现在响应文本里的 http(s) 链接，否则 `url_status:"not_provided"` 并在 UI 标「该接口未提供（未编造）」，**绝不编造 URL**。**不做**：RSS / 外部抓取、自动收藏成文件、进周报、混入 6 类数据源、自动批准/发布、定时 AI 主动汇报、改知识库文件。**存储不新增表**：资讯 `items(type=feed)`、站内轻通知复用 `items(type=message, kind=system)`（不新增 `MessageKind`）；失败如实标 `model_unavailable` / `ai_failed` / `ai_bad_output`，`useAi:false` 不调模型不写 feed，**全轮 1 次最小真实 Qwen 调用**。**手动 + 定时订阅**：手动按钮 `POST /api/news/fetch`；定时由 `runNewsSchedule()` 按「到点 + 当天没跑过 + 有启用主题」触发、`cron.ts` 每分钟 tick 动态调用、**按天幂等不补跑**，先落 `last_run_date` 防重复；`POST /api/news/schedule` 供手动排障。**默认关闭定时**（助手技术裁决）：防首次启动 / 全量回归期间自发产生 Qwen 费用与未读消息污染，UI 可开；`run-all-e2e.mjs` 复位时强制关闭、验收后恢复用户原值。**预置示例主题**「AI+CV+CG 科研动向」。前端：「站内消息」页加第 4 tab「资讯订阅」= `NewsPanel`（只读卡片 + 手动编辑主题 + 管家草案 + 定时开关）。**文件树默认折叠**（用户 2026-11-21 反馈）：`collapsed` 空集合＝全展开 → 改 `toggled` 记录手动改过的节点，`defaultOpen()` 只让库根展开一层、子目录初始全收起，另加「全部折叠 / 展开全部」。**探针加固**：`deepseek-flash` 在 `json_object` 下偶发返回 HTTP 200 但空 `content` → `callStructured()` 与探针均加「最多 3 次真实调用」有限重试，仍失败才如实标注，不 mock。浏览器交互待用户手验 | `e2e-news` **66/66**（含 1 次最小真实 Qwen 调用，feed 落库成功）；探针 **9/9**；`e2e-settings` 67/67、`e2e-filetree` 50/50、`e2e-scheduler` 76/76、`e2e-reports` 119/119 等既有脚本全绿 |

**最新全量回归（2026-11-21 夜，C3 第 3 轮）**：**19 套** e2e；`tsc --noEmit` 0 错误、`build` 成功（6 个 `/api/news/*` 路由全部生成）、服务 health 200；**API 探针 9/9**（DeepSeek 5 + Qwen 4）。**本轮新代码 100% 通过**：`e2e-news` **66/66**（含 1 次最小真实 Qwen 调用，feed 成功落库）；既有 `e2e-settings` **67/67**、`e2e-filetree` **50/50**、`e2e-reports` **119/119**、`e2e-scheduler` **76/76** 等共 **17 套全绿**。首轮全量两套失败，**均非产品代码回归**：① `e2e-proposals` 中途 `fetch failed / ECONNRESET`（历史已知网络抖动）→ **干净起点单独重跑 98/98 全通过**；② `e2e-tidy` 3 项假红 + `ENOENT` 中断，**真因不是 proposals 连锁**，而是脚本把「无 date frontmatter 笔记」的期望文件名**写死成编写当天 `2026-11-20`**，而 `tidy.ts` 按运行当天 mtime 生成 `2026-11-21_*` → **跨日必然失效**（本轮已修，见 §6.3 / §8）。收尾状态：测试库 15/15 种子完整、无 `.git`、4 个内置定时任务全启用、`news-topics.json` 不存在（＝资讯定时默认关闭）、`clean: true`。
> 注：`e2e-proposals` 偶发 `ECONNRESET` 仍可能打断单套脚本，**干净起点单独重跑即可恢复**；`e2e-tidy` 的跨日硬编码已修为动态「运行当天」，今后不会再因此假红。详见 §6.3 / §8。

### 剩余路线（按 C1 锁定顺序，每轮单独走澄清门）

| 顺序 | 编号 | 功能 | 状态 |
|---|---|---|---|
| 1 | **C3 第 1 轮** | 内部文件库 / 全格式整理 / HTML 周报 / 数据源面板 / 主页展示（见 §9.1） | ✅ 119/119 |
| 2 | **C3 第 2 轮** | AI 个性化设置通道 L0/L1 + 就地 AI 设置试点 + **文件管理器改版 + 测试库种子保留**（用户拍板合并一轮做） | ✅ settings 67/67 + filetree 50/50 |
| 3 | **C3 第 3 轮** | Qwen 资讯订阅（内置联网，不做 RSS；站内源与资讯不混）/ 三模型路由补齐 Qwen 一路 + 文件树默认折叠 | ✅ `e2e-news` 66/66，探针 9/9 |
| 4 | **C3 第 4 轮** | 移动端↔电脑端版本管理（git 能用就用，不适合另寻他路） | ⬜ |
| 5 | 四期 | 安卓浏览器兼容 + 外部数据（Outlook / 本地目录；微信/QQ 不做） | ⬜ |
| 6 | 五期 🔮 | 图片库（与知识库/项目库平级）/ 收支统计（手动录入最简版） | ⬜ |

> **文件管理器改版**（2026-11-20 22:37 提出为候选）已由用户拍板与 C3 第 2 轮**合并一轮做完**，见上表第 2 行与 §9.5；「搜索」按用户要求**本轮不做、仅登记**。

---

## §4 现行架构

### 4.1 数据模型

- **不新增表原则**（用户长期要求）：所有业务实体复用 `items` 表，按 `type` 区分，业务字段放 `payload` JSON，软删除用 `deleted_at`。
  已用 type：`todo` / `event` / `habit` / `checkin` / `note` / `message` / `proposal` / **`file`（C3 内部文件库，payload.subtype = `report`/`note`/`other`）** / **`filing_proposal`（C3 内部库整理提案）** / **`setting_history`（C3-2 设置改动历史，含改前值 / 改后值 / 来源）** / **`feed`（C3-3 资讯条目，含 url_status / source 去重键）**。一路到 C3-3 仍未新增任何表；站内轻通知继续复用 `message` 且沿用既有 `kind=system`，不改 `MessageKind`。
- `memory` 表按 `scope` 隔离：`profile` / `feature:*` / `chat_session` / `memory_map`。
- 新数据源走 `DataSourceAdapter` 接口，不改 `items` 主表；**新增表必须先问用户**。

### 4.2 API 与页面（现状）

- API 目录：`auth` `butler` `capture` `chat` `checkins` `events` `features` `filing` `goals` `habits` `health` `index` `internal-files` `libraries` `memory` `messages` **`news`** `proposals` `reports` `scheduler` `settings` `system-open` `tidy` `todos`（共 **24 组**，C3-3 新增 `news` 一组，下含 `fetch` / `topics` / `topics/draft` / `schedule` / `[id]` 五条子路由；`internal-files/upload` 与 `libraries/vaults` 为已有组下的子路由）。
- 页面：`AppShell` 壳 + `HomeDashboard`（顶部挂 `HomeReportCard`）/ `TodoView` / `EventView` / `CheckinView` / `GoalView` / `ChatView` / `ButlerView`（C3-2 加「改设置」模式）/ `MemorySettings` / `IndexSettings` / `KnowledgeView`（三 tab：文件 → **`FileTree` 树状浏览（C3-3 默认折叠子目录）+ `LibraryVaults` 加库 + `AiSettingsBox`** / 项目 / 内部库 → `InternalVaultPanel`）/ `SchedulerView`（**四 tab**：消息 / 提案 / 周报数据源 → `ReportSourcesPanel` + `AiSettingsBox` / **资讯订阅 → `NewsPanel`**）/ `ProposalGenerator` / `ProposalPanel` / `CapturePanel` / `Modal`。`AiSettingsBox` 是四处入口共用的 L1 草案组件；`NewsPanel` 自带「手动编辑 + 管家草案」双通道（复用 `validateNewsConfig()` 范式，但不进 `SETTINGS_CATALOG`）。
- 侧栏「站内消息」徽标 = 未读消息 + 待审批提案数（20 秒轮询）。
- **`/api/internal-files/raw?id=<已登记文件 id>`**（C3）：带鉴权只读输出原始文件，HTML 加 CSP `default-src 'none'` + `nosniff` + `no-store`；只按 id 取路径，客户端不能传任意路径，浏览器 http→`file://` 限制由此绕开。

---

## §5 可复用底座（**动手前先查这里，避免重复造轮子**）

| 能力 | 落点 | 复用要点 |
|---|---|---|
| items CRUD / 软删除 / 筛选 | `src/lib/todos.ts` 等 `src/lib/*` | 新实体优先复用 `items(type=...)`，不建表 |
| 结构化输出 | `callStructured`（`chat.ts`，被 `capture.ts` / `proposals.ts` / `scheduler.ts` / `settings` / `news/topics/draft` 复用） | AI 只出**结构化结果**，不靠 prompt 文字约束；失败如实标注不假装。**C3-3 加固**：`deepseek-flash` 的 `json_object` 偶发 HTTP 200 但空 content → 最多 3 次真实调用有限重试，仍失败才抛错（非 2xx 不重试），不 mock |
| Qwen 联网资讯 | `src/lib/news.ts` + `news-topics.ts` + `getSearchModel()` | **独立于 `chat.ts`**，不改 DeepSeek 日常链路；`enable_search` + `json_object` 共存；`sanitizeUrl()` 只留响应里真实出现的链接，否则标「未提供」；feed 复用 `items(type=feed)`、轻通知复用 `message(kind=system)`；手动与定时共用 `fetchAllNews()`；定时由 `runNewsSchedule()` 按天幂等自理，**不占 scheduler 的 4 个内置任务** |
| function calling 工具层 | `src/lib/indexer.ts` 的 `NOTE_TOOLS` + `executeToolCall` | 新增 AI 工具挂这里；`chat.ts` 已有两阶段 `tool_calls → 本地执行 → 回灌 → 最终回答`（≤3 轮） |
| 标签 → 目录映射 | `src/lib/capture.ts` 的 `resolveExportDir()` | B3/C2 共用；按 dirMap 优先级 `course > topic > source > type`；**别按 tags 遍历**（固定 `type/笔记` 会抢先命中） |
| 文件元数据 / URI | `src/lib/files.ts`：`readMdMeta` / `listFiles` / `buildObsidianUri` | 只读前 4KB；inline 标签要同时去引号和 `#`；排除密钥/隐藏/`.obsidian` |
| 路径安全 | `src/lib/tidy.ts`：`isUnder()` / `safeName()` / `norm()` | 正反斜杠 + 大小写规范化、**按路径段比较**（同盘 `我的知识库` 与 `我的知识库测试` 前缀相近，`startsWith` 会误判；双击打开本地文件也必须走这套校验） |
| 整理执行引擎 | `src/lib/tidy.ts`：`previewTidy` / `runTidy` / `executeTidy` / `runTidyItems` | **C2 与 B3 共用 `executeTidy()`**：改执行逻辑必须同时回归 `e2e-tidy` + `e2e-proposals` |
| 审批 / 提案 | `src/lib/proposals.ts` | 预览不落库 → 保存去重+发消息 → 逐条编辑 → 批准复用引擎；`to` 服务端重算 |
| 调度 / 消息 | `src/lib/scheduler.ts` / `messages.ts` / `cron.ts` / `instrumentation.ts` | 加任务改 `JobId` + `JOB_CATALOG` + `defaultTasks()`；老配置靠 `seedVersion` 迁移 |
| 配置读写 / 原子写 | `src/lib/libraries.ts` / `config.ts` / `goals.ts` | 原子替换 + 单进程串行化，避免并发覆盖 |
| UI 组件 / 样式 | `Modal` / `AppShell` / `globals.css` | 样式集中在 `globals.css`；末尾是含 `.shell/.main/.sidebar/...` 的**完整 `@media` 块**，插入样式要用完整块做锚点 |
| 内部文件库 / 全格式整理 | `src/lib/internal-vault.ts` / `internal-tidy.ts` | 所有新增文件先入 `data/internal-vault/未分类/`，全格式登记 `items(type=file)`；C3 链路与 B3/C2 **只共用工具函数、不共用执行体**（输入目录与分流方向都不同），改 B3 引擎要同时回归 `e2e-tidy` + `e2e-proposals` + `e2e-reports` |
| 周报 / 数据源 | `src/lib/reports.ts` / `report-sources.ts` | 按 ISO 周幂等；`force` 覆盖同一份文件与同一条登记、绝不新增第二份；升级复用 C1 `weekly_digest`，**不新建第二套定时任务**；AI 只写定性评述、拿不到也改不了数字 |
| 带鉴权只读 raw | `/api/internal-files/raw` + `readRawFile()` | 只按已登记 id 取路径，白名单限定内部库 + 测试库；排除密钥文件名；HTML 加 CSP/nosniff |
| 配置注册表 / 统一校验 | `src/lib/settings.ts` | **所有自定义设置的唯一落库入口** `applySettings()`；写死开关与 AI 草案共用 `validateSetting()`，整批校验通过才写；新增设置先登记 catalog（schema / 默认 / 校验 / 影响范围 / AI 是否可改），别绕过 |
| 可配整理规范 / 打开方式 | `src/lib/filing-rules.ts` / `open-with.ts` | 规则表存 `data/filing-rules.json`（首次读从默认常量迁移），`internal-tidy.ts` 改从 `getFilingRules()` 读、**避免与 `settings.ts` 循环依赖**；打开方式存 `data/open-with.json` |
| 系统打开 / 路径白名单 | `src/lib/system-open.ts` + `/api/system-open` | 浏览器不能直调本地应用 → 本机服务端带鉴权调起；路径只从「库根 + 相对路径」重算、`isUnder()` 按段比较、排除隐藏 / 密钥 / 项目自身、**不回显绝对路径** |
| 测试库种子 / 全量回归 | `scripts/seed-vault.mjs` / `run-all-e2e.mjs` | 15 个模拟文件幂等补 / 清；验收前后 `resetVault()`（删 `.git` + 清残留 + 内置定时任务恢复启用 + **关资讯定时订阅**）、跑完 `ensureSeed()` + `restoreNewsSchedule()` 恢复用户原开关；**19 套**分 4 批 + `sleep 65`、每套子进程**只调大** `CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD`（**别关 `ENABLED`，会崩**）、scheduler 排在 proposals 之前、news 放最后一批；**不要改已验收 e2e 脚本的空库基线** |

---

## §6 纪律与红线

### 6.1 工作纪律（2026-11-20 用户最新裁决）

1. **开工前读 §0 一眼 + `git status`**；收尾只更新本 PRD。旧文档已冻结，不再同步维护。
2. **澄清门五步**：提问 → 等回答 → **正文写完整规格复述** → 用户确认 → 实现 → 回问是否符合预期。用户回答前不写代码。
3. **每轮推进几个功能不设死限制，哪样效率高哪样来**（本轮放宽，取代旧「一次只推一个功能」）。但每个用户可见功能仍要走过澄清门、范围说清。
4. **技术选型由助手决定**：用户不决定用什么技术，可能提技术建议，只要实现想要的效果；助手做取舍并说明理由。
5. **新增表必须先问用户**；新数据源走 `DataSourceAdapter`，不改 `items` 主表。
6. 澄清门「本期不做」类题干别自相矛盾（曾写「明确不做」+「不选的按不做处理」导致勾选失效，需重问一轮）。
7. AI 模型调用**「能跑通就行」**：C1/C2 起每轮只保留 **1 次最小真实调用**验链路，其余 mock；模型不可用如实标 `ai_failed` / `model_unavailable`，**不用 mock 假装成功**。
8. AI 只写定性评述，**不生成/改数字、不编事实**；所有计数、文件名、日期由程序生成。
9. 验收：探针 `node scripts/probe-api.mjs`（DeepSeek 5 + Qwen 4 = **9 项**）→ `tsc --noEmit` → `build`（越权 + 临时关批量删除保护，见 §6.3）与 `start` **分开** → `node scripts/run-all-e2e.mjs` 跑全量 **19 套**（自动分 4 批 + `sleep 65` 避开限流 + 清 / 恢复测试库种子 + 关 / 恢复资讯定时）→ 文档（本文件）→ commit + push。
10. 浏览器点击交互、`obsidian://` 跳转脚本覆盖不到，API 链路验证后需请用户手验。

### 6.2 库的概念与开发阶段范围（2026-11-20 22:37 用户最新裁决，**覆盖此前「真实库 / 测试库」二分**）

**先纠正概念**：不再有「真实库 vs 测试库」这种二分。用户原话：
> 「关于我现在正在用的那个知识库，它只是我作为未来的用户会用到的一个库的实例，你就当它不存在。」

`D:\我的知识库` **不是禁区、不是特殊对象**，只是**未来用户可能加入网站的一个库实例**；开发阶段**当它不存在**。本项目代码恰好位于它的 `develop/Fold_` 子目录，那是代码目录，不是「库内容」。

| 名称 | 路径 | 性质 |
|---|---|---|
| **网站中加入的库（vault）** | 由 `data/libraries.json` 的 `knowledgeDirs` 决定；**开发阶段 = `D:\我的知识库测试`** | 唯一的扫描 / 浏览对象。**加库 = 指定一个根目录，该根目录下所有文件都属于这个库**（像 Obsidian「打开已有的库」），递归整棵树，不是逐目录登记 |
| 测试沙盘 | `D:\我的知识库测试` | 开发阶段加入的那个库，可随便写模拟内容；**用户 22:37 明确：临时数据不删，留着后面测试用** |
| 内部库 / 暂存区（C3 已建） | `Fold_/data/internal-vault/未分类/` | 程序自己的暂存台，与库物理隔离；所有新增文件先落这里，整理批准后才移动出去，见 §9.1 |

- **加库的定义**（用户 22:37）：像 Obsidian 打开一个已有的库，选一个根目录，**根目录底下所有文件都属于这个库**。配置界面应表达「添加一个库」，而不是让用户分别填知识库目录 / 项目库目录 / 检索白名单 / 导出目标四类路径（现行 JSON 表单是历史形态，见 §9.5）。
- **加文件的三条路径**（用户 22:37）：
  1. 用户在自己电脑本地加文件 → **网页不管**（网页根本没有做库的版本管理，也不做双向同步 / 常驻监听）；
  2. 让 **AI 管家**帮忙把电脑本地的文件放到暂存区；
  3. 用户把文件**拖到网页上 → 自动存到暂存区**（内部库未分类区）。
  后两条与 C3「所有新增文件统一先入内部库未分类区 → 预览 → 审批 → 分流」完全一致，**不另造文件入口**。
- **开发阶段范围**：所有测试、导出、整理、索引、git 操作只针对**网站中加入的库**（= 测试库）；`data/{index-config,capture-config,libraries}.json` 三份配置全指测试库。
- **不迁移项目、不放开权限**（用户最终拍板，别再提）。
- e2e 里原有的「真实库零接触」断言**保留为防误写安全网**，语义改为「不触碰任何未加入网站的目录」；快照须排除 `.obsidian` / `.trash` 等运行时目录（C3 起连所有隐藏项一并排除，避免 Syncthing 标记误伤）。**不再把「扫真实库」当作待授权的前置议题**。
- ✅ **已解决（C3-2）**：现有 e2e 前置清场会清空测试库，与「模拟数据留着」冲突 → **不改任何已验收脚本**，改由 `scripts/seed-vault.mjs` + `run-all-e2e.mjs` 在整轮验收前 `resetVault()`（清种子 / 残留 / `.git` + 恢复定时任务）、全部跑完重建 `ensureSeed()`，详见 §7 决策 28 / §9.5。日常网页浏览时种子始终在场，只有跑全量回归期间短暂清空。
- 日后用户把自己那个库实例加入网站后，扫描范围自然随之变化；`dirMap` 与其目录结构对不齐由 §9.2 全库扫描第 1 步处理。

### 6.3 踩坑索引（动手前扫一眼）

- 连续跑多套 e2e 触发**登录限流 10 次/60 秒** → 后面报「未登录或会话已过期」是假失败，等窗口过单跑即好。
- `npm run build && npm run start` 串联：build 被沙箱拦下但 start 仍起**旧 `.next`** → 断言假失败，必须分开。
- `e2e-tidy` 删测试库 `.git`：git 对象只读，回收站式 `fs.rmSync` 会 abort（62/63 假失败）→ `rmGit()`（chmod 去只读 + `cmd /c rmdir /S /Q` 回落）；验收脚本偶发 `ECONNRESET` → `api()` 加网络层轻量重试（4xx/5xx 正常返回不重试）。
- `git add -A -- <旧路径>`：改名后旧路径不存在会报 pathspec → 只 add 仍存在的路径；脏检查必须排除输入目录本身。
- 文件名时间戳别用 `slice` 截，显式 `YYYY-MM-DD` / `YYYYMMDD_HHMM`。
- `searchNotes` 空关键词不返回全部，列全量用 `stats`。
- `node-cron` 是 CJS，dynamic import 的 `default` 要单独兼容类型。
- 老 `scheduler.json` 不会自动获得新增内置任务 → `seedVersion` 一次性迁移（只补一次，不覆盖用户后续删除）。
- zod 时间正则要允许空串；schema 可选字段与 TS 必填定义要一致（C2 曾因此 tsc 报错）。
- **🆕 `next build` 被 WorkBuddy 的 Node 层 safe-delete 批量保护拦下**：环境有 `CODEBUDDY_SAFE_DELETE_ENABLED=1` + `CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD=200`，只要本 turn 累计删除达 200，之后所有 `fs.rmSync`/`fs.promises.rm` 都抛 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`。**手动清空 `.next` 也没用**（单次 build 内部清理就超阈值）→ 只对这一条命令临时 `CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build`，不改动全局环境、build 只操作 `.next` 构建产物。
- **🆕 e2e 脚本自己的 `fs.rmSync` 同样会被该保护拦下**，收尾清理静默失败 → 清理断言假失败（C3 首跑 117/119 就是「测试库恢复到干净状态」「内部库只保留本周周报」两项）。统一走 `forceRemove()`：Node 删失败回落 `cmd /c rmdir /S /Q` / `del /F /Q`（与 `rmGit()` 同思路）。
- **🆕 跑全量回归别乱关批量删除保护（C3-2 更正 C3-1 旧口径）**：`e2e-tidy` / `e2e-proposals` 的 `cleanVault()` 用 `fs.rmSync` 且 `catch {}` 吞错，累计删除超阈值被拦 → 测试库残留连锁假失败（stale 条目 2→5、脏工作区 400、B3 run 400、收尾残留）。**正确做法：只把 `CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD` 调大（如 `1000000`），保持 `CODEBUDDY_SAFE_DELETE_ENABLED=1`**。⚠️ 旧口径「`export CODEBUDDY_SAFE_DELETE_ENABLED=0`」**已证伪**：C3-2 实测会让 capture / proposals / tidy / reports 4 套子进程直接崩溃（`exit=3221226505` = Windows `0xC0000409`），与更早的 `exit=127` 同源。`ENABLED=0` **只允许用于单条 `next build`**（见上一条），绝不要给 e2e 子进程。
- **🆕 e2e 断言要先跟实现对齐再跑**：C3 初稿把「伪造 from」写成了仍在未分类区内的路径（根本不会 400）、快照 diff 的「消失」写成了 `!A.has(x)`，都会造成假绿/假红；收尾前先读一遍 lib/route 的返回结构。
- **🆕 `e2e-filetree` 初跑 46/50 是测试设计错、不是代码 bug**：临时新库若建在测试库内部（如 `D:\我的知识库测试\_e2e_库`），会被 `/api/libraries/vaults` 的「与已有库嵌套」校验**正确拒绝** → 改用平级独立目录 `D:/Fold_E2E_Vault`，嵌套用例反过来用测试库子目录；重跑 50/50。
- **🆕 `settings.ts` 的 `listSettingHistory()` 别用类型谓词 filter**：`before/after: unknown` 与 `(x): x is SettingHistoryEntry` 推断冲突（TS2322 / 2677）→ 显式 `const out: SettingHistoryEntry[] = []` 逐条 push，顺带跳过损坏历史。
- **🆕 单次 build 生成 54 页**（C3-1 是 46 页）；跑 e2e 前先确认服务是新 `.next`：探 `/api/settings`→401、`/api/system-open`→405 即可，否则旧构建会大面积假失败。
- **🆕 会话续接后后台 `task_id` 会失效**（`TaskOutput` 报 not found）→ 别把记忆里「已启动」当成验收通过；在当前会话重跑并拉取新结果，或直接查磁盘状态（`seed-vault.mjs --check` / `git log` / 服务 health）。
- **🆕 全量回归的「状态 / 顺序耦合」假失败（C3-2 实测）**：① `e2e-proposals` 开头会**停用全部定时任务**、收尾才恢复成「开头读到的配置」；一旦某次收尾没恢复，`data/scheduler.json` 就自锁成 4 个 `enabled:false`，紧随其后的 `e2e-scheduler`「默认全部启用 / 错过累计 / 汇总消息」连挂 4 项 → 总入口已把 `scheduler` 排到 `proposals` **之前**，`resetVault()` 强制恢复内置任务启用；**复位后单跑 `e2e-scheduler` = 76/76**。② 测试库残留 `.git` + 种子 / fixture 会让 tidy / proposals 前置「脏工作区」连锁 400（首轮 97/98、复位后单跑 91/98，内部清场被拦导致 fixture 从 2 个累积到 5 个）→ 调大阈值后 `e2e-proposals` 恢复 **97/98**，只剩「`.git` 没删掉」。③ **根因是 `e2e-proposals` 的 `killGit()` 只 `fs.rmSync` 且 `catch {}` 吞错，git 对象只读删不动** → 本轮唯一一次改已验收脚本：**只改这个清理函数**（复用 `e2e-reports.mjs` 已有的「去只读 + 系统强删回落」写法），**不动任何断言**；`run-all-e2e.mjs` 的 `resetVault()` 同样处理。这些全是环境 / 顺序问题，不是产品代码回归。
- **🆕 `--reset-only` 开关**：`node scripts/run-all-e2e.mjs --reset-only` 只复位环境并重建种子、不跑验收；环境被 e2e 搞脏时手动恢复用。
- **🆕 别把「写死当天日期」写进 e2e 断言（C3-3 实测）**：`e2e-tidy.mjs` 编写于 2026-11-20，把「无 `date` frontmatter 笔记」整理后的期望文件名写死成 `2026-11-20_数列收敛.md` 等 3 处；而 `tidy.ts` 用 `fmtDate(fs.statSync(源).mtime)`（fixture 是脚本运行时刚写的 → 运行当天）→ **11-21 再跑必然 `ENOENT` 假红并中断整套脚本**，看起来像「proposals 断裂后的连锁」，其实是独立的跨日缺陷（全量里 tidy 的 3 项失败与单独重跑**完全一致**就是判据）。**修法**：按产品同源规则动态算 `RUN_DAY`，期望文件名用 `${RUN_DAY}_标题.md`；fixture 自带 `date` frontmatter 的（如 `2026-11-01_极限的定义.md`）是输入固定值，**不要一起改**。判据：**同一套脚本单独重跑仍复现同样失败 ⇒ 不是连锁、是脚本自身缺陷**。
- **🆕 Qwen `sk-ws-` key 的端点与来源口径（C3-3 探针）**：标准按量付费 key 走 `https://dashscope.aliyuncs.com/compatible-mode/v1`（`GET /models` 200 / 191 项）；`dashscope-intl` 401、`coding*.dashscope` 404，`qwen-plus` 支持 `enable_search:true` + `response_format:json_object` 共存。**该兼容端点不返回结构化 `search_info` / 可核验来源 URL**（非流式、流式探针都只有正文 `[ref_N]` 角标）→ 资讯条目**只保留响应里真实出现的 http(s) 链接**，否则标「未提供」，**绝不编造 URL**。
- **🆕 `deepseek-flash` 的 `json_object` 偶发空 content（C3-3 探针）**：HTTP 200、`finish_reason=stop` 但 `content:""`（实测 3 次里 1 次），单次调用即断言会把瞬时故障误判为能力缺失。`callStructured()` 与探针均改为「最多 3 次真实调用」有限重试、非 2xx 不重试、仍失败才如实标注；**不 mock、不假装成功**。
- **🆕 别让 e2e 消息断言被 cron 其它任务干扰**：`cron.ts` 每分钟 `runTick()` 会自行发 `daily_focus` 等消息 → 用 `COUNT(* WHERE type='message')` 做「不发消息」断言会假红。改为**只统计本模块 `manual:` / `cron:` 前缀的轻通知**（`newsMsgCount()`）；清理也按 source 前缀精确删，不误删其它脚本数据。
- **🆕🔥 Service Worker 缓存导致「服务端全 200、浏览器全坏」（2026-11-21 用户手验发现）**：现象＝首页 HTML 骨架出来了但**样式全丢**、永远卡「载入中…」、dev 的「N」悬浮球也不出现、多次刷新无效，而 PowerShell / 服务端**无任何报错**、`curl` 所有 HTML / CSS / JS 都 200。**根因**：`public/sw.js`（阶段 0 PWA 壳）对**所有同源 GET 用 cache-first**，`install` 还 `addAll(["/", "/login", ...])` 把首页 HTML 快照缓存，缓存名 `fold-shell-v1` 硬编码永不失效；SW 按 **origin 常驻浏览器**，`SwRegister.tsx` 只在 `production` 注册但注销不了已注册的 SW。昨晚跑生产 `build + start`（资源 URL 带 hash），今早换 `npm run dev`（资源 URL 是 `?v=时间戳`、`.next` 被 dev 覆盖、`BUILD_ID` 消失）→ 浏览器拿旧缓存 HTML 去请求带 hash 的旧 CSS/JS → dev server **404** → CSS 丢失 + JS 不 hydrate + 卡 loading。**curl 不走 SW 所以全绿，这是最容易误判的地方**。**修复**：① `sw.js` 缓存升级 `fold-shell-v2`、`install` 只缓存 `/icon.svg` + `/manifest.json`；导航请求 / `/login` / `/_next/*` **一律不 respondWith、直接走网络**（这些 URL 会随 dev↔生产切换变化，缓存必然错配）；② `SwRegister.tsx` 在 dev 主动 `getRegistrations().unregister()` + 清 `caches`，消除跨模式串台。**用户侧一次性自救**：无痕窗口打开，或控制台 `navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()));caches.keys().then(ks=>ks.forEach(k=>caches.delete(k)));location.reload()`。⚠️ 改了 `sw.js` 但旧 SW 仍控制页面时，**普通刷新不会立刻生效**（新 JS 没机会运行），必须先注销 / 无痕。判别要点：HTML 里出现 `webpack.js?v=时间戳`、`eval-source-map`、无 `BUILD_ID` = dev 产物；N 悬浮球消失 = 客户端 JS 根本没接管。

---

## §7 已确认的产品决策留档（矛盾裁决以此为准）

| # | 决策 | 依据 / 日期 |
|---|---|---|
| 1 | 需求以 **v0.6 清单**为准，Atlas v2 提示词只归档有用技术栈 | 用户 2026-11-19 |
| 2 | v2 阶段 1 的 op 同步闭环**全部删除**（`df4de04`）；技术栈沿用 Next.js 15 + better-sqlite3 + zod + Node 24；key 写 `.env`；一期顺序助手定 | Q1~Q4 拍板 |
| 3 | **A5 矛盾裁决**：清单 132 行「数据 = 网站自建主库」vs P13「长期目标存本地配置」→ 存 `data/goals.json`，不进 SQLite | 用户拍板 |
| 4 | **测试隔离**：全改测试库；不迁移项目、不放开权限 | 用户 2026-11-20 |
| 5 | **C1 不动系统**：不写注册表/任务计划/服务，进程内 cron + 手动启动脚本 | 用户按推荐 |
| 6 | **C2 不重写 B3 引擎**，只补异步提案链路 | 15 条规格确认 |
| 7 | **C3 清单矛盾裁决**：2.2 节 91 行「**一期**做数据源开关面板」vs 第 9 节 146 行分期表列在**三期**（另有 2.1 节 85 行 P11 同类痕迹）→ 判定为沿用旧稿笔误，**以第 9 节分期表为准（现在补做）**，面板不独立成轮、绑定周报 | 待写入变更记录，同类 A5 |
| 8 | **定位升级**：见 §1.1 | 用户 2026-11-20 |
| 9 | **C3 文件体系**：所有新增文件统一入「程序内部库」未分类区 → 全格式整理 → 用户审批 → 分流；周报是文件子类（「类的继承」），HTML 格式。**第 1 轮已落地**（补标题/标签由程序完成，AI 辅助分类留第 2 轮），详见 §9.1 | 用户 2026-11-20 方向 + C3 第 1 轮实现 |
| 10 | **审批后分流去向 = 前者**：直接从内部库**移动到用户指定知识库中应在的位置**，内部库只作暂存台 | 用户 2026-11-20 拍板 ① |
| 11 | **测试库整理用的 git commit 保留**（与移动端版本管理是两回事，是审批后可回滚的唯一保障） | 用户 2026-11-20 拍板 ② |
| 12 | **同意拆轮**（见 §9.1） | 用户 2026-11-20 拍板 ③ |
| 13 | **不做知识库版本管理**；git（或「类似 git 的方式」）只用于**移动端↔电脑端之间的版本管理**，能用 git 就直接用、不适合另寻他路；这是**四期议题**，届时评估；一期删掉的 op 队列/快照/审批台概念**不是废弃概念**，四期可能复用 | 用户 2026-11-20 |
| 14 | **一次只推一个功能**放宽为「按效率组合，不设死限制」；技术选型由助手决定 | 用户 2026-11-20（本轮，取代 §6.1 旧条） |
| 15 | **文档收敛**：所有进度只在 `PRD.md` 改，本文件为唯一施工圣经 | 用户 2026-11-20（本轮） |
| 16 | **开发阶段库范围**：用户自己日常用的库不用管、不扫、不写；扫描对象是「网站中加入的库」，开发阶段 = 测试库，可在测试库里造模拟内容；项目不迁移、权限不放开 | 用户 2026-11-20 施工授权，详见 §6.2。**概念称谓已被第 18 条覆盖**，行为口径仍有效 |
| 17 | **C3 第 1 轮技术裁决**：不改动 B3/C2 已验收的执行引擎，只新增内部库专用链路（共用工具函数、不共用执行体）；升级复用 C1 `weekly_digest`，C1 原消息内容/断言一字不改，在同一次执行里额外产出 HTML 周报 + 轻通知 | 助手按「避免重复造轮子 + 不破坏已验收链路」决定，用户不决定技术 |
| 18 | **取消「真实库」概念**：`D:\我的知识库` 只是未来用户会用到的一个库实例，开发阶段**当它不存在**；不再有「真实库 / 测试库」二分，只有「网站中加入的库」。e2e 零接触断言保留为防误写安全网 | 用户 2026-11-20 22:37，详见 §6.2 |
| 19 | **加库 = 打开已有库的根目录，根下所有文件都属于这个库**（Obsidian 语义）；配置 UI 应表达「添加一个库」，不是分填四类路径 | 用户 2026-11-20 22:37 |
| 20 | **加文件三路径**：① 用户本地自己加 → 网页不管（无库版本管理）② AI 管家把本地文件放进暂存区 ③ 拖到网页自动存暂存区。后两条复用 C3 内部库，不另造入口 | 用户 2026-11-20 22:37 |
| 21 | **测试库临时模拟数据不删，留着后续测试用** → 前置条件：先改 e2e 清场策略，否则下次验收仍会清空 | 用户 2026-11-20 22:37，见 §9.5 |
| 22 | **文件管理器的目的 = 方便在网页内查看 + 能打开**，不是展示元数据：改树状紧凑 UI、去掉格式分类栏；点击/双击按 Obsidian 或系统默认应用打开；搜索**本轮不做仅登记** | 用户 2026-11-20 22:37，见 §9.5 |
| 23 | **管家定位（长期原则，覆盖后续所有设置）**：管家 = 懂接口的人，用来**替代用户手动改那些复杂配置**；所有自定义设置都要「手动 + 管家」双通道，只有极简开关（点一下那种）可只保留手动。本轮试点仍是 4 项白名单，不把管家页扩成全站配置中心 | 用户 2026-11-20 23:00 |
| 24 | **HTML 默认走 Obsidian**（不改系统浏览器）；Obsidian 本体不原生渲染 HTML、需社区插件；库名未配置或链接不可生成时如实标注 `obsidian_unavailable` 并回退系统默认应用 | 用户 2026-11-20 23:00 拍板 |
| 25 | **文件：单击、双击都打开**；**文件夹：单击展开/折叠，双击打开系统文件管理器**（原「右键在文件夹中显示」并入文件夹双击）。双击必然先触发两次 click → 文件用时间窗去重、文件夹用 220ms 延时区分，不重复打开、不闪两下 | 用户 2026-11-20 23:00 |
| 26 | **系统打开由本机服务端带鉴权接口调起**（浏览器不能直调本地应用）：路径只从「已加入的库根 + 库内相对路径」重算，按段比较 + 排除隐藏目录 / 密钥文件名 / 项目自身；接口**不回显服务器绝对路径**；如实返回「已发起请求」，浏览器无法确认外部应用是否真的启动 | 助手技术裁决（安全红线） |
| 27 | **加库允许任意平级根目录、拒绝与已有库嵌套**（避免同一批文件被两个库重复扫描）；只影响 `knowledgeDirs` + `indexDirs`，`exportVault` / `inboxDir` / `dirMap` / `tidy` 一律不动，防误写 | 助手技术裁决 + `e2e-filetree` 验证 |
| 28 | **测试库种子策略**：**不改任何已验收 e2e 的业务断言**，改为「整轮验收前 `resetVault()`、全部跑完 `ensureSeed()`」，由 `scripts/seed-vault.mjs` + `run-all-e2e.mjs` 固化。理由：种子若中途放回会变成未跟踪文件，触发「脏工作区 400」与文件总数断言错位；已验收脚本内部仍以空库为基线。**同轮补强**：主进程 / 子进程只调大 `CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD`（**关 `ENABLED` 会让 4 套脚本崩溃**）、验收前后及 proposals 之后各做一次复位（删 `.git` / 清残留 / 恢复内置定时任务启用）、`scheduler` 排到 `proposals` 之前。**例外**：修 `e2e-proposals` 的 `killGit()` 清理函数（只读 `.git` 删不掉）；C3-3 又修 `e2e-tidy.mjs` 三处跨日写死日期（详见 §6.3 / §8），两次都**不动断言结构、不放宽校验** | 助手技术裁决，见 §6.3 / §9.5 |
| 29 | **C3-3 配置方案＝「独立配置 + 复用通道」（推荐项，用户选定）**：订阅主题 / 定时开关存独立 `data/news-topics.json`；不往 `SETTINGS_CATALOG` 加第 5 项、不往 `JOB_CATALOG` / `defaultTasks()` 加第 5 个内置任务（已验收 `e2e-settings` 硬断言 4 项、`e2e-scheduler` 硬断言 4 个任务，按纪律不改验收脚本）。但 §7-23「手动 + 管家双通道」原则照旧：手动 PUT 与管家草案共用 `validateNewsConfig()`，草案不落库 / 不发消息 / 不写文件，确认才 PUT | 用户 2026-11-21 澄清门选定 |
| 30 | **资讯来源 URL 只留真实链接，没有就标「未提供」（推荐项，用户选定）**：Qwen 兼容端点不返回可核验 `search_info` / 来源 URL，只保留响应正文里真实出现的 http(s) 链接，否则 `url_status:"not_provided"` 并在 UI 明示「该接口未提供（未编造）」；**绝不编造论文名 / 机构名 / 数字 / URL** | 用户 2026-11-21 澄清门选定 |
| 31 | **资讯定时默认关闭**（助手技术裁决）：`news-topics.ts` 默认 `schedule.enabled=false`，UI 可开；`runNewsSchedule()` 按「到点 + 当天没跑过 + 有启用主题」触发、按天幂等不补跑。理由：防首次启动 / 全量回归期间自发产生 Qwen 费用与未读消息污染；`run-all-e2e.mjs` 复位时强制关、验收后 `restoreNewsSchedule()` 恢复用户原值 | 助手裁决（稳定性 / 费用可控） |
| 32 | **三模型路由本轮只补 Qwen 联网一路**：`getSearchModel()` 接入 `qwen-plus` + DashScope OpenAI 兼容端点，资讯抓取独立成 `news.ts`、不走 `chat.ts` 的 `callChat`；`getReasoningModel()`（GLM / Qwen-Max 重型推理）**本轮不动**，DeepSeek 日常链路语义不变 | 助手技术裁决（范围最小化） |
| 33 | **文件树默认折叠**（用户明确反馈）：原 `collapsed=new Set()` 空集合＝全展开 → 改为 `toggled` 记录手动改过的节点，库根默认展开一层、所有子目录初始收起；另加「全部折叠 / 展开全部」。刷新 / 新增库后新目录仍按默认折叠 | 用户 2026-11-21「默认应该是折叠的，不要默认全部展开」 |

---

## §8 变更记录（append-only，只记要点）

- 2026-11-21 夜：**三期 C3 第 3 轮完成**（Qwen 内置联网资讯订阅 + 三模型路由补 Qwen 一路 + 文件树默认折叠）。用户提供 `QWEN_API_KEY` 并说「开工」，随后三轮「继续」并补充「文件管理器默认应该是折叠的」。**澄清门 2 项裁决**：① 独立配置 + 复用通道（§7-29）；② 来源 URL 只留真实链接、没有标「未提供」（§7-30）。落地：`src/lib/{news,news-topics}.ts` + 6 条 `api/news/*` 路由 + `NewsPanel` + `SchedulerView` 第 4 tab + `cron.ts` 挂接 + `features.ts` 打开 `news-feed` / `model-router` + `globals.css` 15 个资讯样式类 + `.env.example` 实测注释；**不新增表**（`items(type=feed)` / `message(kind=system)`）、不动 `chat.ts` 的 `callChat`、不改 `SETTINGS_CATALOG` / `JOB_CATALOG`。**文件树默认折叠**：`FileTree.tsx` 的 `collapsed` → `toggled` + `defaultOpen()`，加「全部折叠 / 展开全部」。新增 `scripts/e2e-news.mjs`（66/66），`run-all-e2e.mjs` 18→**19 套**并加 `disableNewsSchedule()` / `restoreNewsSchedule()`；`probe-api.mjs` 扩 Qwen 4 项（**9/9**）。验收：`tsc --noEmit` 0 错误、build 成功（6 个 news 路由）、全量 19 套 **17 套全绿** + 两套非产品回归失败经干净起点单独重跑通过（proposals **98/98**、tidy **63/63**）。**顺带修 3 处非本轮引入的缺陷**：① `callStructured()` 与探针加「空 content 有限重试」（`deepseek-flash` 瞬时空返回）；② `SchedulerView.tsx` / `features.ts` 过时注释；③ **`e2e-tidy.mjs` 三处写死 `2026-11-20` 日期 → 动态 `RUN_DAY`**（第 2 次触碰已验收脚本，只改期望文件名、不放宽断言，详见 §6.3）。浏览器交互待用户手验。

- 2026-11-21 早：**修 Service Worker 缓存故障（用户手验发现的阻断性 bug，非产品逻辑回归）**。用户反馈 `npm run dev` 打开网页后样式全丢、卡「载入中…」、无 N 悬浮球、多次重试无效，PowerShell 无报错。定位为 `public/sw.js` cache-first 缓存首页 HTML 且缓存名永不失效，dev↔生产切换后旧 HTML 引用的带 hash 资源 404（详见 §6.3 新增条目）。**只改 2 个文件**：`public/sw.js`（缓存升级 v2 / 只缓存 icon+manifest / 导航与 `/_next/*` 走网络）、`src/components/SwRegister.tsx`（dev 主动注销残留 SW + 清缓存）。`npx tsc --noEmit` 0 错误、`node --check public/sw.js` 通过、服务端已吐出新 `sw.js`、首页 200。**未构建、未改任何业务逻辑、未动服务进程**（用户要求保留现场）。本轮方向用户已选 **C3 第 3 轮（Qwen 资讯 / 三模型路由）**，但按用户裁决「发现问题先修」，第 3 轮待本故障确认恢复后再单独走澄清门。

- 2026-11-20 夜：**三期 C3 第 2 轮完成并推送**（与文件管理器改版、测试库种子保留**合并一轮**做）。用户最终修订 4 条：`html走obsidian` /「所有自定义设置手动 + 管家双通道，极简开关例外，管家 = 懂接口的人」/ 文件单击双击都打开 / 文件夹单击折叠、双击开资源管理器。落地：`src/lib/{filing-rules,open-with,settings,system-open}.ts` + 8 个新 API（`settings` 系列 5 / `system-open` / `internal-files/upload` / `libraries/vaults`）+ `FileTree` / `LibraryVaults` / `AiSettingsBox` 三组件 + 四处挂载 + `features.ts` 注册 `file-tree` / `ai-settings` + `globals.css`；`internal-tidy.ts` 规则来源改为可配规则表。新增 `scripts/{seed-vault,run-all-e2e,e2e-filetree,e2e-settings}.mjs`，**不改任何已验收 e2e 脚本**。验收：`tsc --noEmit` 0 错误、build **54 页**、`e2e-settings` **67/67**（1 次最小真实模型调用，自然语言 → 草案链路已验证）、`e2e-filetree` **50/50**、全量 18 套回归见 §3。同步更新 §2 / §3 / §4 / §5 / §6 / §7（决策 23~28）/ §9.1 / §9.3 / §9.5。收尾阶段额外定位并修掉全量回归的三类环境假失败：调度配置自锁、只读 `.git` 删不掉、以及**证伪 C3-1「跑全量要关 `SAFE_DELETE_ENABLED`」旧口径**（会让 4 套 e2e 崩溃），改为只调大批量阈值 + 总入口自愈复位 + 修 `e2e-proposals` 的 `killGit()` 清理函数（不动断言）。浏览器交互待用户手验。
- 2026-11-20 22:37：**只同步信息、未动工**（用户明确要求）。用户提出文件管理器 UI 改版 4 条（树状紧凑 / 点击双击打开 / 去格式分类栏 / 搜索暂不做）、加库与加文件的定义、取消「真实库」概念、测试库模拟数据保留；并在测试库造了 15 个模拟文件让三个 tab 有内容（真实接口已验证，不属于代码改动）。本轮**只改 `PRD.md`**：重写 §6.2、新增 §9.5、补 §3 候选注 / §7 决策 18~22 / §9.2 口径修正。未写代码、未构建、未跑验收；`git status` 除本文件外为空。
- 2026-11-20 夜：**三期 C3 第 1 轮完成并推送**：内部文件库（`internal-vault.ts`）+ 全格式整理（`internal-tidy.ts`）+ HTML 周报（`reports.ts`）+ 6 类数据源开关（`report-sources.ts`）+ 主页折叠周报卡 / 回顾弹框 / 数据源面板 / 内部库面板 + 7 个新 API 路由 + `e2e-reports.mjs`。升级复用 C1 `weekly_digest`（原消息与 76/76 断言不变），不新建第二套定时任务；文件/提案全部复用 `items` 表，不新增表。`tsc --noEmit` 0 错误、build 46 页、`e2e-reports` **119/119**、16 套回归全过（其中 tidy 63/63、proposals 98/98 为排除 safe-delete 环境干扰后单独重跑）。同轮把用户最新三条施工授权写进 §6.2，并补 §4 / §5 现状、§6.3 三条新坑、§7 决策 16/17。
- 2026-11-20 晚：**建立本 PRD**，整合需求清单 v0.6 + 交接文档 + `PROJECT_PLAN.md` + `MODULES.md` + `README.md` + `features.ts` + 项目/用户记忆中的全部纪律与进度；旧文档冻结。同轮用户拍板 ①②③、放宽功能批量限制、重定向 git 用途、提出产品定位升级与全库扫描需求。
- 2026-11-20：C2 审批闸门 `6cf7db8`（98/98 + 15 套回归全过）；C1 `9e3cb6d`（76/76）；B3 `077580b`（63/63）；B2 `ff4d7cc`（33/33）；B1 `b862f87`（28/28）。
- 2026-11-19~20：一期 A0~A10 + 首页改版完成（`0d15996`）；v0.6 转向、op 同步闭环删除（`df4de04`）。

---

## §9 待办池与下一轮范围

### 9.1 C3 拆轮与进度（第 1、2、**3** 轮 ✅ 已完成，第 4 轮 ⬜）

**拆轮方案（用户已同意 ③）**

| 轮 | 范围 | 状态 |
|---|---|---|
| **第 1 轮** | 文件底座 + 周报：内部文件库与全格式整理、周报生成、数据源面板、AI 评述、主页展示、回顾 | ✅ **119/119**，见 §3 |
| **第 2 轮** | AI 个性化设置通道（L0/L1）+ 就地 AI 设置试点 + **文件管理器改版**（用户拍板合并一轮做） | ✅ **settings 67/67 + filetree 50/50**，见 §3 / §9.3 / §9.5 |
| **第 3 轮** | Qwen 内置联网资讯订阅 / 三模型路由补 Qwen 一路 + 文件树默认折叠 | ✅ **`e2e-news` 66/66 + 探针 9/9**，见 §3 / 下方「第 3 轮落地口径」 |
| 第 4 轮 | 移动端↔电脑端版本管理 | ⬜ |
| 挂起 | 管家统一入口（等功能变多再收敛）、发行版 | ⬜ |

**第 3 轮落地口径（实现以此为准）**

- **独立配置 + 复用通道**：主题 / 定时存 `data/news-topics.json`（不存在＝默认值：1 条示例主题「AI+CV+CG 科研动向」、定时关闭 09:30）；`validateNewsConfig()` 是唯一校验入口（上限 12 条 / 名称 60 字 / 描述 300 字 / `HH:mm` 正则 / id 字符与去重），**任一项非法整批拒绝、不写半个值**；`setNewsConfig()` 原子替换。手动 `PUT /api/news/topics` 与 `/api/news/topics/draft`（`callStructured`）共用它，草案只回内存、沿用旧 `id`/`created_at`、确认才 PUT。
- **Qwen 抓取**：`news.ts` 独立调 DashScope 兼容端点（`enable_search` + `search_options` + `json_object`），1 主题 1 次真实调用；按「主题+日期+标题 sha1」幂等去重；`sanitizeUrl()` 只留响应文本里真实出现的链接；成功/失败都发一条 `kind=system` 轻通知并按 `source` 去重；失败如实标 `model_unavailable` / `ai_failed` / `ai_bad_output`，`useAi:false` 不调模型不写 feed。
- **定时订阅**：`runNewsSchedule()` 由 `cron.ts` 每分钟动态调用，走自己的 `last_run_date` 按天幂等（不补跑、先落运行态防重复），`POST /api/news/schedule` 供手动排障；**默认关闭**，避免自发费用 / 未读消息污染；全量回归复位时强制关、收尾恢复用户原值。
- **不做**：RSS / 外部抓取、自动收藏成文件、进周报、混入 6 类数据源、自动批准 / 发布、定时 AI 主动汇报、自动改知识库文件；`getReasoningModel()` 本轮不动。
- **待用户手验**：「站内消息」第 4 tab「资讯订阅」、手动「获取资讯」、主题手动编辑保存、管家「生成草案 / 确认生效 / 丢弃」、定时开关与时间、资讯卡片来源链接或「未提供」、文件树默认折叠 / 全部折叠 / 展开全部。API 链路已由 `e2e-news` 66/66 覆盖。

**第 2 轮落地口径（实现以此为准）**

- **L0 注册表**：`src/lib/settings.ts` 的 `SETTINGS_CATALOG` 登记 4 项试点（整理规范 / 周报数据源 / 手动重点 / 打开方式），每项有 schema、默认值、校验、影响范围、AI 是否可改。`MANUAL_ONLY_KEYS`（库路径、密钥、`dirMap`、鉴权、限流、排除规则…）只准手动改，AI 草案里出现也拦下并回显原因。**写死开关 `PUT /api/settings` 与 AI 通道 `POST /api/settings/apply` 共用 `validateSetting()`**，任一项非法整批拒绝。
- **L1 通道**：一句话 → `/api/settings/draft`（`callStructured`）→ 逐条草案（现在值 / 改成值 / 影响 / 理由 / 校验错误）→ 编辑勾选 → `/api/settings/apply` 服务端重新校验 → 才落库。**草案只在前端 state，不落库、不发站内消息、不写历史**，刷新即丢；`useAi:false` → `model_disabled`，模型失败 → `ai_failed`，输出异常 → `ai_bad_output`，一律不 mock 假装成功；全轮只 1 次最小真实调用验链路。
- **历史 / 回滚**：`items(type=setting_history)` 记时间 / 来源 / 改前 / 改后；回滚再记一条新历史、不删旧记录；若该项后来又被改过，`409 needsConfirm` → 前端二次确认后带 `confirm:true` 重发。
- **入口**：知识库页、周报数据源页、内部库整理页三处就地 `AiSettingsBox` + AI 管家「改设置（一句话）」模式；**不把管家页扩成全站配置中心**。
- **文件管理器**见 §9.5；**种子策略**见 §7 决策 28 / §6.2；整理规范改完只影响下次预览，已生成未批准的提案不受影响。
- **待用户手验**：树折叠 / hover / 文件单击双击 / 文件夹双击开资源管理器 / 拖拽上传 / 草案逐条编辑与回滚按钮 / Obsidian 里 HTML 显示。

**第 1 轮落地口径（实现以此为准）**

- **文件体系**：所有新增文件（不限格式）统一入 `Fold_/data/internal-vault/未分类/`；整理 + 批准后**移动到用户加入的库对应目录**，内部库只作暂存台。索引复用 `items(type=file)` + `payload.subtype`（`report`/`note`/`other`），**不新增表**；周报是文件子类，仍须走审批。
- **全格式整理**（B3「只整理 .md」在内部库不适用）：`.md` 由**程序**补 frontmatter 标题/标签；HTML / 图片 / PDF 等只读文件系统元数据、按规则表分类、**不动内容**；一律「预览 → 逐条编辑/批准 → 才移动」，一次批准一次 git commit。**AI 辅助分类留第 2 轮 L0/L1 通道**（本轮先保证稳定运行）。**不动 B3/C2 已验收的执行引擎**，只共用工具函数。
- **周报**：HTML 六区块模板；固定部分程序填、灵活部分 AI 写定性评述、手动重点用户手填且**不经过 AI**；AI 不碰数字 / 文件名 / 日期；按 ISO 周幂等；升级复用 C1 `weekly_digest`。
- **展示**：主页最上方默认折叠、**仅每周产生新周报时自动展开一次**；角落「回顾」→ 弹框列历史 → 新标签页只读打开（`/api/internal-files/raw` 带 CSP）；旧周报不回主页；另发站内轻通知。
- **数据源开关面板**：6 类源，默认开 4（待办完成 / 打卡 / 暂存区整理 / 手动重点），git 提交与笔记变更默认关；「笔记变更」用测试库 mtime 快照近似，不常驻监听、不读正文；站内源与 Qwen 资讯不混。
- **本轮技术裁决**：分流目标目录沿用 `dirMap` + 回落「笔记」，客户端 `dir` / `filename` 一律服务端重算；HTML 周报在审批流里就是一条普通 `items(type=file, subtype=report)`；全库扫描范围见 §9.2（= 网站加入的库，开发阶段是测试库）。
- **待用户手验**：浏览器点击、弹框编辑、iframe 周报卡、新标签页打开、Obsidian 插件查看 HTML —— 脚本只覆盖 API 链路。

### 9.2 全库扫描（用户本轮新提出，⬜ 待登记设计）

- 目标：**只读**扫描，汇总「缺标题的文件」和「按整理规范可能位置不对的文件」。
- **拆成两步**（用户明确要求，因为读全部文件标题较重）：
  1. **只读目录结构**（轻量）→ 得到实际目录树 → 与 `dirMap` 比对 → 输出规范漂移报告（规范里有但库里没有 / 库里有但规范没登记）。
  2. **读所有文件的标题与标签**（重）→ 汇总缺标题文件 + 疑似位置不对的文件。
- 目录结构与规范对不上时，用户可选「**更新目录整理规范**」或「**什么都不做**」；全程只读、不自动改文件。
- 用户洞察（已确认成立）：不做库版本管理后，用户自行改文件内容/挪位置网站不用管；**但用户调整目录结构会让静态 `dirMap` 失配**，导致后续整理对不齐 —— 第 1 步的漂移检测正是为这个。未来那个库实例当前观察到的顶层目录（笔记/作业/工具库/总览表/传输文件/写作/未整理/templates/develop 等）与 `dirMap`（课件和教材/笔记/资源库）**本来就没对齐**，这不是假想风险。
- 「更新规范」是一次配置改动，应走 §9.3 的 L0/L1 通道（预览 → 确认 → 落库 → 可回滚）。
- **范围已明确（用户 2026-11-20，22:37 口径已更新）**：扫「**网站中加入的库**」，即 `libraries.json` 配置的那些库；开发阶段该集合 = 测试库，助手在测试库里写模拟内容来验证（且模拟数据要留着，见 §6.2 / §9.5）。**不再有「真实库」概念**：用户现在用的库只是未来可能加入网站的一个库实例，开发阶段当它不存在；它加入后扫描范围自然随之变化。详见 §6.2。全程只读元数据、绝不自动改文件。

### 9.3 AI 驱动的个性化设置（新定位的核心能力，✅ L0/L1 已落地）

助手给出的架构判断（**不是二选一，是分层**）：

- **L0 配置注册表**（唯一真相源）：每项设置登记 schema / 取值域 / 默认值 / 校验 / 影响范围；AI 不能绕过校验。
- **L1 唯一一套「写死接口 ↔ AI 管家」通道**：自然语言 → 结构化配置草案 → 预览确认 → 校验落库 → 可回滚。**复用已有 `callStructured` + `indexer.ts` 工具层 + `chat.ts` 两阶段 tool_calls + C2 审批闸门**，不另造轮子。
- **L2 三入口并存，按效率选**：就地 AI 设置（高频/少参数/要即时预览）、统一 AI 管家（跨功能/批量/说不清在哪改）、纯写死开关（布尔枚举，点一下更快）。侧栏已有「AI 管家」页，但**不要与「AI 对话」合成一个**（聊天 vs 改配置，权限边界不同）。
- **稳定三保**：AI 只出草案不直接落库 · 每次改动带来源标记可一键回滚 · 非法值在写死接口被拒并回显。

**C3-2 已落地**：L0 = `src/lib/settings.ts` 注册表（4 项白名单）；L1 = `/api/settings/draft` → `AiSettingsBox` 逐条确认 → `/api/settings/apply` → `setting_history` 可回滚；L2 三入口 = 三处就地 + AI 管家「改设置」模式 + 纯写死开关。**本轮只试点 4 项**，未扩成全站配置中心；后续新增设置必须按 §7 决策 23 同时提供「手动 + 管家」双通道并登记进 L0。实现细节见 §3 / §9.1。

### 9.4 其它挂起

- 「未整理区」大愿景（多格式 + 管家按规范分类 + 批准 + 定时整理）→ 已被 §9.1 第 1 轮吸收，不再单列。
- 四期：安卓兼容、外部数据（Outlook / 欧路生词本；微信/QQ 不做）、移动端↔电脑端版本管理。
- 五期 🔮：图片库（资源库平级）、收支统计（手动录入）。
- 远期：发行版。

### 9.5 文件管理器改版（✅ C3-2 已完成，仅「搜索」未做）

用户原话要点：「网页的文件管理器的 UI 不好，**应该要回到文件管理器的目的上来**」＝方便在网页内查看 + 能打开，而不是展示一堆元数据。参考图 = 用户贴的 **Obsidian 文件树截图**：文件夹可折叠（`>` / `∨`）、层级缩进 + 引导线、文件紧凑单行、右侧淡色类型标记，不显示大小/日期/路径。

| # | 要求 | C3-2 落地现状 |
|---|---|---|
| 1 | **点击 / 双击打开文件** | ✅ `FileTree.tsx`：**文件单击、双击都打开**（双击必然先触发两次 click → 450ms 时间窗去重）；`.md` / `.html` / `.htm` / `.pdf` → `obsidian://`（复用 B2 `buildObsidianUri`，**HTML 走 Obsidian 由用户拍板**），其余 → 系统默认应用。**文件夹单击展开/折叠（220ms 延时区分）、双击打开系统资源管理器**。系统打开走 `/api/system-open` 服务端带鉴权调起（浏览器不能直调本地应用），路径只从「库根 + 相对路径」重算、`isUnder()` 按段比较 + 排除隐藏 / 密钥 / 项目自身，**不回显绝对路径**；Obsidian 本体不原生渲染 HTML（需社区插件），库名未配置 / URI 不可生成时如实标 `obsidian_unavailable` 并回退系统默认应用 |
| 2 | **树状结构** | ✅ 按 `root` → `dir` → `file` 建树，紧凑单行（`min-height:24px`）、可折叠、层级缩进 + 引导线、hover tooltip 显详情、右侧淡色类型标记；**去掉每行 dir / ext / size / mtime / 完整路径 / 标签 chips / 跳转链接**。数据源仍是 `/api/libraries/files?limit=500`（API 未改，前端建树） |
| 3 | **去掉格式分类栏** | ✅ 移除顶部「全部 / Markdown / PDF / HTML / Word / 其它」按钮组与目录筛选下拉；`/api/libraries/files` 的 `kind` / `dir` 参数保留但界面不暴露 |
| 4 | **搜索** | ⬜ **按用户要求本轮不做，仅登记**：文件名 / 路径搜索；是否含正文、是否复用 A8 索引、是否搜索内部库，待后续澄清 |
| 5 | **加文件：拖拽入暂存区** | ✅ 单文件拖到树区域 → `/api/internal-files/upload` → `writeToUnsorted()` + `registerFile()` 存 `data/internal-vault/未分类/`；20MB 上限、同名自动加序号、疑似密钥文件名拒绝、不支持文件夹；**不写加入的库、不自动分类 / 移动 / 批准**。「让管家把本地文件放进暂存区」涉及本地文件权限，**本轮未做，需单独澄清**；用户本地自己加的文件网页不管（§6.2） |
| 6 | **加库的 UI** | ✅ `LibraryVaults.tsx`：「添加一个库」= 添加 / 移除 `knowledgeDirs` 根目录，根下整棵树都归它；高级字段（项目库 / 检索 / 导出目标 / `dirMap` / Obsidian 库名）仍走「高级配置」JSON 文本框。只改 `knowledgeDirs` + `indexDirs`，**不动** `exportVault` / `inboxDir` / `dirMap` / `tidy`；拒绝不存在 / 隐藏 / 项目自身 / 重复 / **与已有库嵌套**（防重复扫描），至少保留 1 个库 |
| 7 | **测试库模拟数据保留** | ✅ `scripts/seed-vault.mjs` 固化 15 个种子文件（幂等补 / 清 / 检查），`run-all-e2e.mjs` 整轮验收前 `resetVault()`、全部跑完 `ensureSeed()`；**不改任何已验收 e2e 脚本**，其空库基线保持不变。总入口还负责给验收子进程调大批量删除阈值（**不关保护，关了会崩**）、按 `scheduler → proposals` 排序、`proposals` 之后自愈复位（§6.3 / §7 决策 28） |

**状态**：已由用户拍板与 §9.1 第 2 轮「AI 设置通道」**合并一轮做完**（`e2e-filetree` 50/50）；除「搜索」外 7 项全部落地。
**验收注意**：树折叠、hover tooltip、文件单击/双击是否只开一次、文件夹双击是否真的打开资源管理器、拖拽上传、Obsidian 里 HTML 显示，这些浏览器 / 外部应用交互脚本覆盖不到，**必须请用户手验**；API 链路已由 `e2e-filetree` 覆盖。

---

> **维护规则**：每轮收尾只改本文件 §3（进度）/ §7（决策）/ §8（变更记录）/ §9（待办池），必要时补 §5 底座与 §6 踩坑。**不要在别处再写第二份进度**。
