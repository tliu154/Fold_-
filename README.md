# Fold_归匣

> Local-First 个人中枢平台 · **阶段 0：项目框架与占位**（不含任何业务逻辑）
> 笔记本是唯一主库、唯一写入者；移动端只是「轻量缓存 + 提案者」。

## 当前状态

阶段 0 已交付：项目骨架、建表、登录鉴权、模块注册表、API 路由骨架（占位返回 501）、
PWA 壳、简约 UI 基底（含空状态与占位按钮）。**所有用户可见的业务功能均未实现**，
补实前必须逐个走「功能澄清门」。

模块状态见 [MODULES.md](./MODULES.md)。

## 技术栈

- Node.js + TypeScript + Next.js（App Router，页面与 `/api/*` 同一项目）
- SQLite（`better-sqlite3`，主库文件在 `data/` 下，绝不进 Git / 文件同步工具）
- PWA（manifest + 最小 Service Worker，仅缓存壳资源、绝不缓存 API 数据）
- 定时任务 `node-cron`（当前仅占位空调度）
- 依赖保持最少：无重型 UI 库，样式用 CSS 变量集中在 `src/app/globals.css`

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

## 局域网 HTTPS（手机同 WiFi 访问 / PWA 安装）

PWA 与 Service Worker 需要安全上下文（HTTPS 或 localhost）。两种方式任选：

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
├── src/
│   ├── features.ts        # 模块注册表（新功能先登记，再走澄清门）
│   ├── adapters/          # DataSourceAdapter 接口 + 空注册表
│   ├── lib/               # db / config / auth / rate-limit / cron
│   ├── instrumentation.ts # 启动时注册定时任务占位
│   ├── app/
│   │   ├── api/           # 18 个路由：3 个实做 + 15 个 501 占位
│   │   ├── page.tsx       # 响应式外壳（桌面侧栏 / 移动底部导航）
│   │   └── login/         # 登录页
│   └── components/        # AppShell / PlaceholderButton / EmptyState
└── public/                # PWA：manifest / sw.js / icon.svg
```

## 开发纪律（摘自开发提示词 v2）

- 一次只推进一个功能，顺序由用户指定
- 用户可见行为的功能：开工前先问清 → 复述确认 → 实现 → 回问是否符合预期
- 未敲定功能只允许：类型/接口、501 路由占位、features.ts 注册、UI 占位按钮
- 新数据源一律走 `DataSourceAdapter` 接口，不改 `items` 主表结构
