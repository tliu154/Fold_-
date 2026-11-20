/**
 * 测试库固定种子（用户 2026-11-20：「测试库的临时数据就不用删了，留着后面测试用嘛」）
 *
 * 为什么是「验收前清、验收后重建」，而不是改 e2e 清场逻辑：
 * - e2e-tidy / proposals / reports 的前置清场会清空整个测试库，且它们的
 *   「脏工作区」「文件总数」断言都以空库为基线。若中途放回 15 个种子文件，
 *   种子会变成未跟踪文件 → 整理被判脏工作区、总数断言错位 → 连锁假失败。
 * - 因此**已验收的 e2e 脚本一行不改**：只在整轮验收开始前 clearSeed()，
 *   全部跑完后 ensureSeed() 重建。平时种子常驻，网页随时有内容可看。
 *
 * 用法：
 *   node scripts/seed-vault.mjs            # 幂等补齐全 15 个模拟文件（不覆盖已存在的）
 *   node scripts/seed-vault.mjs --clear    # 只删这 15 个种子文件（验收前用）
 *   node scripts/seed-vault.mjs --check    # 打印种子完整度 / 额外残留
 *   import { ensureSeed, clearSeed, vaultStatus } from "./seed-vault.mjs"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TEST_VAULT = "D:/我的知识库测试";
const B = "\\"; // 避免 JS 字符串把 \{ 吃掉
const L = (...lines) => lines.join("\n") + "\n";

export const SEED_DIRS = [
  "未整理", "笔记", "课件和教材", "资源库",
  "项目库/Fold_归匣", "项目库/机器学习教程",
  "项目库/高等微积分复习", "项目库/尚未建状态的项目",
];

export const SEED_FILES = {
  "README_测试库说明.md": L(
    "---", "tags:", '  - "#type/资料"', '  - "#source/网页AI"', "created: 2026-11-20", "---", "",
    "# 测试库说明（模拟内容）", "",
    "这里是 Fold_归匣 开发阶段的测试沙盘，不是日常在用的 Obsidian 主库。",
    "目录、笔记、项目状态、未整理文件都是造出来给网页演示用的，可以随便改、随便删。", "",
    "网页「知识库 / 文件浏览」读的就是这个目录，由 `data/libraries.json` 的 `knowledgeDirs` 指定。",
  ),
  "未整理/待归类_英语EAP.md": L(
    "---", "tags:", '  - "#course/英语EAP"', '  - "#type/笔记"', "created: 2026-11-20", "---", "",
    "# 待归类：英语 EAP 课堂记录", "",
    "带 `#course/` 前缀，整理预览时按 dirMap 优先级最高命中「课件和教材」目录。",
  ),
  "未整理/待归类_量子力学笔记.md": L(
    "---", "tags:", '  - "#topic/量子力学"', '  - "#type/笔记"', "created: 2026-11-20", "---", "",
    "# 待归类：量子力学笔记", "",
    "放在未整理区，用来演示「整理新笔记」的预览：标签里没有 course/topic 前缀能精确命中的映射，",
    "按 dirMap 兜底会落到「笔记」目录。",
  ),
  "未整理/扫描件.pdf": L("%PDF-1.4 FAKE-SCAN-FOR-DEMO-ONLY"),
  "笔记/Python 数据分析小结.md": L(
    "---", "tags:", '  - "#course/计算机"', '  - "#topic/数据分析"', '  - "#type/笔记"',
    "created: 2026-11-19", "---", "",
    "# Python 数据分析小结", "",
    "三件套的分工：numpy 管数组与向量化，pandas 管表格与分组，matplotlib 管画图。", "",
    "练习模板统一是 TODO + assert + region 折叠答案，跑一遍 assert 就知道自己写没写对。", "",
    "- 先把数据形状搞清楚，再谈运算", "- groupby 之后想清楚要的是 Series 还是 DataFrame",
  ),
  "笔记/极限与连续.md": L(
    "---", "tags:", '  - "#course/微积分"', '  - "#topic/极限"', '  - "#type/笔记"',
    "created: 2026-11-18", "---", "",
    "# 极限与连续", "",
    "数列 $" + B + "{x_n}" + B + "$ 收敛到 $L$ 的意思是：不管你给多小的距离，总有一项之后全都落在 $L$ 附近。", "",
    "夹逼定理最好用的地方是「中间那项不好算，但两边都往同一个数跑」。", "",
    "- 柯西準則：不先猜极限值也能判断收敛", "- 單調收斂定理：有界 + 单调 ⇒ 收敛",
  ),
  "课件和教材/微积分 第3章 讲义.md": L(
    "---", "tags:", '  - "#course/微积分"', '  - "#type/资料"', "created: 2026-11-16", "---", "",
    "# 微积分 第3章 讲义", "",
    "对应《Honors Calculus 高等微積分》正文第 3 章，证明细节在附录 A。", "",
    "记号沿用教材：数列写 $" + B + "{x_n}" + B + "$，审敛法、柯西準則、夾逼定理。",
  ),
  "资源库/导出的页面.html": L(
    "<!doctype html>", '<html lang="zh-CN">',
    '<head><meta charset="utf-8"><title>导出的页面（模拟）</title></head>',
    "<body>", "<h1>导出的页面</h1>",
    "<p>这是一个模拟的 HTML 文件，用来演示文件浏览能列出非 Markdown 格式。</p>",
    "</body>", "</html>",
  ),
  "资源库/常用配色参考.md": L(
    "---", "tags:", '  - "#source/官方文档"', '  - "#type/资料"', "created: 2026-11-15", "---", "",
    "# 常用配色参考", "",
    "界面强调色墨青 `#2C5F5D`，用于按钮选中态和进度条填充。", "",
    "标签颜色按类别区分：course 偏蓝、topic 偏绿、type 偏灰、source 偏紫。",
  ),
  "资源库/示意图.png": L("PNG-FAKE-BINARY-CONTENT-FOR-DEMO-ONLY"),
  "资源库/课程表.pdf": L("%PDF-1.4 FAKE-BINARY-CONTENT-FOR-DEMO-ONLY"),
  "随手记.docx": L("DOCX-FAKE-BINARY-CONTENT-FOR-DEMO-ONLY"),
  "项目库/Fold_归匣/STATUS.md": L(
    "# Fold_归匣 项目状态", "", "progress: 72%", "", "## 任务清单", "",
    "- [x] 一期 A0~A10 基础功能", "- [x] 二期 B1 文件浏览与进度看板", "- [x] 二期 B2 Obsidian 跳转",
    "- [x] 二期 B3 暂存区整理", "- [x] 三期 C1 定时任务与站内消息", "- [x] 三期 C2 审批闸门",
    "- [x] 三期 C3 第 1 轮 内部库与 HTML 周报", "- [ ] 三期 C3 第 2 轮 AI 个性化设置通道",
    "- [ ] 全库扫描（先读目录结构）", "",
    "> 本文件是模拟数据，用于演示项目进度看板只解析 `progress: N%` 和 checkbox，不猜 README。",
  ),
  "项目库/机器学习教程/STATUS.md": L(
    "# 机器学习教程 项目状态", "", "progress: 45%", "", "## 章节进度", "",
    "- [x] 第 1 篇 数学与工具准备", "- [x] 1.3 numpy / 1.4 pandas / 1.5 matplotlib 收录",
    "- [x] NOTATION.md 符号表", "- [ ] 第 2 篇 回归模型", "- [ ] 第 3 篇 分类模型",
    "- [ ] 第 4 篇 模型评估", "- [ ] 每章 assert 练习补齐",
  ),
  "项目库/高等微积分复习/STATUS.md": L(
    "# 高等微积分复习 项目状态", "", "progress: 20%", "", "## 复习清单", "",
    "- [x] 极限定义与柯西準則", "- [ ] 夾逼定理与审敛法", "- [ ] 连续性、一致连续",
    "- [ ] 导数与中值定理", "- [ ] 附录 A 证明精读",
  ),
};

/** 幂等补齐：只创建缺失文件，绝不覆盖用户/其它脚本改过的内容 */
export function ensureSeed(root = TEST_VAULT) {
  for (const d of SEED_DIRS) fs.mkdirSync(path.join(root, d), { recursive: true });
  let created = 0;
  for (const [rel, content] of Object.entries(SEED_FILES)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    if (!fs.existsSync(p)) { fs.writeFileSync(p, content, "utf-8"); created++; }
  }
  return { created, total: Object.keys(SEED_FILES).length };
}

/** 只删种子清单里的 15 个文件（不碰别的、不碰 .git） */
export function clearSeed(root = TEST_VAULT) {
  let removed = 0;
  for (const rel of Object.keys(SEED_FILES)) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) continue;
    try { fs.unlinkSync(p); removed++; }
    catch { try { fs.rmSync(p, { force: true }); removed++; } catch { /* ignore */ } }
  }
  return removed;
}

function walk(dir, out) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return; }
  for (const n of names) {
    if (n === ".git" || n.startsWith(".trash")) continue;
    const p = path.join(dir, n);
    let st; try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out); else out.push(p);
  }
}

/** 种子完整度 + 额外残留（排除 .git 等运行时目录） */
export function vaultStatus(root = TEST_VAULT) {
  const files = [];
  walk(root, files);
  const seeds = new Set(Object.keys(SEED_FILES).map((r) => path.resolve(path.join(root, r)).toLowerCase()));
  const extra = files.filter((f) => !seeds.has(path.resolve(f).toLowerCase()));
  const missing = Object.keys(SEED_FILES).filter((r) => !fs.existsSync(path.join(root, r)));
  return {
    seedTotal: Object.keys(SEED_FILES).length,
    seedPresent: Object.keys(SEED_FILES).length - missing.length,
    missing, extra: extra.slice(0, 20), extraCount: extra.length,
    clean: missing.length === 0 && extra.length === 0,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const mode = process.argv[2] ?? "--ensure";
  if (mode === "--clear") console.log("已清除种子文件：", clearSeed());
  else if (mode === "--check") console.log(JSON.stringify(vaultStatus(), null, 2));
  else console.log("种子已就绪：", ensureSeed(), vaultStatus());
}
