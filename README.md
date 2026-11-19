# Fold_归匣

> Local-First 个人中枢平台 · **阶段 1：op 同步闭环已实装**
> 笔记本是唯一主库、唯一写入者；移动端只是「轻量缓存 + 提案者」。

## 当前状态

- 阶段 0（框架与占位）✅：骨架、建表、登录鉴权、模块注册表、PWA 壳、简约 UI 基底
- 阶段 1（op 同步闭环）✅：移动端记录 → push → 审批 → 快照/审计/version+1 → 拉快照对齐
- 其余功能仍为占位（501 / 占位按钮），补实前逐个走「功能澄清门」

模块状态见 [MODULES.md](./MODULES.md)。

## 技术栈

- Node.js + TypeScript + Next.js（App Router，页面与 `/api/*` 同一项目）
- SQLite（`better-sqlite3`，主库文件在 `data/` 下，绝不进 Git / 文件同步工具）
- PWA（manifest + 最小 Service Worker，仅缓存壳资源、绝不缓存 API 数据）
- 定时任务 `node-cron`（当前仅占位空调度）
- 依赖保持最少：无重型 UI 库，样式用 CSS 变量集中在 `src/app/globals.css`

## ⚠️ Node 版本（务必先看，否则所有 API 报 500）

`better-sqlite3` 是原生模块，`.node` 二进制跟 **Node 的 ABI** 绑定。装依赖时用哪个 Node 版本编译，
运行时就必须用同一个版本。本机装了**两个 Node**：系统 `v24`（在用）和 WorkBuddy 内置 `v22`。
如果 API 返回 `NODE_MODULE_VERSION 127 vs 137` 的错误，就是版本错配。

**统一用系统 Node 24**（你日常终端默认的那个）。启动前确认：

```bash
node -v     # 必须 v24.x，若是 v22.x 请换用系统 Node
```

若已用错版本装过依赖，重新用 Node 24 编译一次即可（无需 Visual Studio，走预编译包）：

```bash
# Windows / Git Bash：把系统 Node 放到 PATH 最前
export PATH="/d/Program Files/nodejs:$PATH"
npm rebuild better-sqlite3        # 看到 prebuild-install 成功即可
node -e "require('better-sqlite3'); console.log('OK')"
```

> `package.json` 里已加 `engines.node >= 24`，npm install 时用错版本会给出警告。

## 快速开始

```bash
npm install

# 配置环境变量（密钥绝不进 Git）
cp .env.example .env
# 编辑 .env：至少设置 AUTH_PASSWORD 和 SESSION_SECRET

npm run dev
# 打开 http://localhost:3000
```

首次访问任意页面会自动跳登录页；首次访问 `/api/health` 时自动建表（幂等）。

## 阶段 0 验收步骤（逐条可手动执行）

1. `npm run dev` 可正常启动
2. 未登录访问 `curl http://localhost:3000/api/items` → **401**
3. `curl http://localhost:3000/api/health` → `{"status":"ok","db":"ready",...}`
4. 登录：`curl -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"password":"你的密码"}'` → 200 + token
5. 携带 token 访问 `curl -H "Authorization: Bearer <token>" http://localhost:3000/api/features` → 列出全部模块及 `implemented / placeholder / pending_clarify` 状态
6. 登录后访问任一占位路由（如 `/api/items`）→ **501** + 中文提示
7. 页面上点任意占位按钮（记一条 / 发送 / 整理新笔记 / 生成周报草稿）→ 提示「该功能待定义」
8. 视图归属：手机 / 平板（移动 UA 或触摸设备，含鸿蒙、iPad）→ 轻视图 + 底部导航 4 项（记录 / 对话 / 周报 / 我的），无审批台入口；笔记本 → 侧栏 + 工作台 + 审批台。测试方法：浏览器开发者工具切设备模拟（如 iPhone / 平板 UA）刷新即见轻视图
9. `MODULES.md` 与 `src/features.ts` 状态一致

## 阶段 1 · op 同步闭环（已实装）

### 同步协议（已确认规格）

- 移动端「记一条」固定 `type=note`（LLM 分类路由留给阶段 2）
- 联网自动 push + 打开 app 自动 pull 一次 + 手动「同步」按钮兜底
- `op_id` 幂等（重复返回 duplicate）；非 create 类 `base_version` 过期 → conflict，禁止自动合并
- create/update 人工批准（`AUTO_APPROVE_CREATE` 默认 false）；delete 永远人工批准
- 批准执行顺序（不可调换）：行级 JSON 快照 → 应用 → `applied_ops` 审计 → version+1
- 全库版本号存 `memory` 表（`scope='system'`），未新增表
- 驳回后移动端草稿留本地不自动重投；拉快照整体替换缓存（排除软删除条目）
- 审批台（笔记本端）：逐条 + 批量批准；冲突可用「以主库为准 / 以移动端为准」快捷按钮

### 阶段 1 验收步骤（手机 + 笔记本）

1. 笔记本 `npm run dev`，手机同 WiFi 访问（见下方 HTTPS 配置）并登录
2. 手机「记录」页输入一条 → 点「记一条」→ 列表出现该条（灰色 + 「未同步」标签）
3. 联网时自动投递 → 标签变「已提交 · 待审批」
4. 笔记本打开「审批台」→ 看到该 op → **批准前**主库无变化（收件箱只读列表不出现该条）
5. 点「批准」→ 库版本 +1；`data/snapshots/<日期>/` 下出现快照 JSON；
   收件箱只读列表出现该条
6. 手机点「同步」→ 列表该条变正常条目（本地草稿态消失）
7. 重复 push 同一 op_id → 返回 `duplicate`
8. 制造冲突：手机离线改一条（update op 基于旧版本）→ 联网 push → 审批台「冲突」区出现，
   选「以主库为准」或「以移动端为准」
9. 手机删除一条 → push → 笔记本审批台批准 → 条目软删除（`deleted_at` 非空），
   快照文件可恢复

### 笔记本上单机测试（无需手机）

浏览器访问 `http://localhost:3000/?view=light` 强制轻视图模拟手机端，
再开普通窗口（桌面视图）用审批台，即可单机走完整个闭环。
移动端本地数据在浏览器 IndexedDB（`fold-local` 库），清站点数据即重置。

### 阶段 1 API 清单

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/sync/push` | `{device_id, ops[]}` → 逐条 status + snapshot_version |
| GET | `/api/sync/snapshot?device_id=` | 只读快照（排除软删除），整体替换缓存 |
| GET | `/api/ops/pending?status=` | 审批台列表（附目标条目信息） |
| GET | `/api/ops/conflicts` | 冲突列表（客户端 payload vs 主库当前） |
| POST | `/api/ops/:op_id/approve` | 快照→应用→审计→version+1 |
| POST | `/api/ops/:op_id/reject` | 驳回并记录原因 |
| POST | `/api/ops/:op_id/resolve` | 冲突解决：`{resolution: server\|client}` |
| POST | `/api/ops/batch-approve` | `{op_ids[]}` 批量批准 |

## 局域网 HTTPS（手机同 WiFi 访问 / PWA 安装）PWA 与 Service Worker 需要安全上下文（HTTPS 或 localhost）。两种方式任选：

### 方式一：mkcert 自签证书（局域网）

```bash
# 安装 mkcert 后（choco install mkcert / scoop install mkcert）
mkcert -install
mkcert fold.local 192.168.x.x   # 换成笔记本的局域网 IP
# 得到 fold.local+2.pem / fold.local+2-key.pem
```

以自定义 server 启动（阶段 0 可先用反向代理，如 caddy/nginx 指向 localhost:3000），
或者用 Tailscale（见方式二）。手机浏览器访问 `https://192.168.x.x:3000`。

### 方式二：Tailscale HTTPS（推荐，免自签管理）

```bash
# 安装 Tailscale 并开启 HTTPS 证书
tailscale cert <你的机器名>.<tailnet>.ts.net
```

服务只监听 Tailscale / 局域网接口，**不开放公网端口、不做端口映射**。

## 安全须知

- 所有 `/api/*`（除 `/api/health`）必须鉴权；密钥只放服务端 `.env`
- `data/` 目录（SQLite 主库）已在 `.gitignore` 中，**绝对不要放进任何文件同步工具**
  （含 Syncthing、网盘同步、Obsidian 同步等）
- 同步 ≠ 备份：阶段 1 起每次 apply 前做快照；每周加密备份（占位中）

## 目录结构

```
Fold_/
├── db/schema.sql          # 8 张表建表 SQL（幂等）
├── data/                  # SQLite 主库 + snapshots/（不进 Git、不进同步工具）
├── src/
│   ├── features.ts        # 模块注册表（新功能先登记，再走澄清门）
│   ├── adapters/          # DataSourceAdapter 接口 + 空注册表
│   ├── lib/               # db / config / auth / rate-limit / cron / sync / localDb / syncClient
│   ├── instrumentation.ts # 启动时注册定时任务占位
│   ├── app/
│   │   ├── api/           # health / auth / features 实做；sync+ops 实做（阶段1）；其余 501 占位
│   │   ├── page.tsx       # 响应式外壳（轻视图 / 工作台，?view= 可覆盖）
│   │   └── login/         # 登录页
│   └── components/        # AppShell / InboxView / ApproveView / PlaceholderButton / EmptyState
└── public/                # PWA：manifest / sw.js / icon.svg
```

## 开发纪律（摘自开发提示词 v2）

- 一次只推进一个功能，顺序由用户指定
- 用户可见行为的功能：开工前先问清 → 复述确认 → 实现 → 回问是否符合预期
- 未敲定功能只允许：类型/接口、501 路由占位、features.ts 注册、UI 占位按钮
- 新数据源一律走 `DataSourceAdapter` 接口，不改 `items` 主表结构
