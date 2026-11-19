# Fold_归匣

> Local-First 个人 AI 指挥台 · **v0.6 骨架**
> 本机运行，价值 = 整合 + 调度 + 自动化；不是内容平台 / 笔记编辑器（Obsidian 干那个）。
> 需求以《个人AI枢纽网站_需求对齐清单_v0.6.md》为准；开发规划见 [PROJECT_PLAN.md](./PROJECT_PLAN.md)。

## 当前状态（骨架）

已保留的底层骨架：
- Next.js 15 + TypeScript + better-sqlite3 + zod，PWA 壳
- 建表（4 张：items / memory / ai_messages / ai_usage）、登录鉴权（HMAC Cookie + Bearer）
- 实做路由：`/api/health`、`/api/auth/login`、`/api/auth/logout`、`/api/features`
- 简约 UI：右侧栏 + 点击切页 + 首页仪表盘骨架（待办 / 日程 / 打卡 / 长期目标占位）
- 模块注册表 `features.ts`（按 v0.6 分期）+ 数据源适配器接口 + `MODULES.md`
- API 探针脚本 `scripts/probe-api.mjs`（开工第一步）

**所有用户可见功能均未实现**，按需求清单分期、逐个走「功能澄清门」补实。
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

> 清单里的型号名是核实快照，不能直接当配置；以探针实测结果为准。
> API key 只从 `.env` 读取，绝不进代码 / Git / 前端。

## 配置（v0.6）

- 认证：`AUTH_PASSWORD` / `SESSION_SECRET`
- 数据目录：`DATA_DIR`（SQLite 主库；**绝不放进任何文件同步工具**）
- AI 路由：一期 `DEEPSEEK_API_KEY / BASE_URL / MODEL`；二/三期 `QWEN_*`、`REASONING_*` 留空
- 预算：`AI_MONTHLY_BUDGET`（元，0 = 不限）
- Obsidian：`OBSIDIAN_VAULT_PATH`（二期，留空不影响其它功能）

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

- 用户可见功能开工前先问清 → 等回答 → 复述确认 → 实现 → 回问是否符合预期
- 一次只推进一个功能，顺序由用户指定
- 新数据源走 `DataSourceAdapter` 接口，不改 items 主表；新增表必须先问用户
