"use client";

/**
 * 树状文件浏览器（三期 C3 第 2 轮）
 *
 * 回到文件管理器的目的：方便浏览 + 能打开。
 * - 按「库根 → 目录 → 文件」建树，紧凑单行、文件夹可折叠、层级引导线
 * - 详情（目录/类型/大小/时间/标签/路径）只在鼠标悬停 tooltip 里，不占版面
 * - 文件：单击、双击都打开（双击的第二次 click 被时间窗去重，不会开两遍）
 *   走 Obsidian 或系统默认应用由服务端按「打开方式映射」决定
 * - 文件夹：单击展开/折叠（220ms 延时区分双击），双击打开系统文件管理器
 * - 拖本地文件到树上 → 自动上传进内部库暂存区（不分类、不移动、不批准）
 */
import { useMemo, useRef, useState, type DragEvent } from "react";

export interface FileEntry {
  path: string; name: string; ext: string; size: number; mtime: string;
  dir: string; root: string; title?: string; tags?: string[];
  obsidian_uri?: string | null;
}

interface TreeNode {
  name: string; key: string; type: "vault" | "dir" | "file";
  rel: string; root: string; children: TreeNode[]; file?: FileEntry;
}

function buildTree(files: FileEntry[]): TreeNode[] {
  const vaults = new Map<string, TreeNode>();
  for (const f of files) {
    const root = f.root || "(未知库)";
    let v = vaults.get(root);
    if (!v) {
      v = {
        name: root.split(/[\\/]/).filter(Boolean).pop() || root,
        key: `v:${root}`, type: "vault", rel: "", root, children: [],
      };
      vaults.set(root, v);
    }
    const segs = f.dir === "(根)" || !f.dir ? [] : f.dir.split("/").filter(Boolean);
    let cur = v;
    let acc = "";
    for (const seg of segs) {
      acc = acc ? `${acc}/${seg}` : seg;
      let d = cur.children.find((c) => c.type !== "file" && c.name === seg);
      if (!d) {
        d = { name: seg, key: `d:${root}:${acc}`, type: "dir", rel: acc, root, children: [] };
        cur.children.push(d);
      }
      cur = d;
    }
    const rel = segs.length ? `${segs.join("/")}/${f.name}` : f.name;
    cur.children.push({
      name: f.title || f.name, key: `f:${f.path}`, type: "file",
      rel, root, children: [], file: f,
    });
  }
  const sort = (n: TreeNode): void => {
    n.children.sort((a, b) =>
      (a.type === "file" ? 1 : 0) - (b.type === "file" ? 1 : 0)
      || a.name.localeCompare(b.name, "zh-CN"));
    n.children.forEach(sort);
  };
  const out = [...vaults.values()];
  out.forEach(sort);
  return out;
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function tipOf(f: FileEntry): string {
  return [
    `名称：${f.name}`,
    f.title ? `标题：${f.title}` : "",
    `目录：${f.dir}`,
    `类型：${f.ext} · 大小：${fmtSize(f.size)}`,
    `修改：${new Date(f.mtime).toLocaleString("zh-CN")}`,
    f.tags?.length ? `标签：${f.tags.map((t) => `#${t}`).join(" ")}` : "",
    `路径：${f.path}`,
    "单击或双击打开；Obsidian 不支持的格式会调用系统默认应用",
  ].filter(Boolean).join("\n");
}

interface Props {
  files: FileEntry[];
  total: number;
  truncated: boolean;
  onRefresh: () => void;
  onUploaded?: () => void;
}

export default function FileTree({ files, total, truncated, onRefresh, onUploaded }: Props) {
  const tree = useMemo(() => buildTree(files), [files]);
  // 默认折叠（用户 2026-11-21）：库根只展开一层，所有子目录初始都收起，
  // 不再一进页面就把整棵树全部铺开。toggled 记录「被用户手动改过状态」的节点，
  // 这样刷新 / 新增库后新出现的目录仍按默认折叠，不会被一次性展开。
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const lastOpen = useRef<{ key: string; at: number } | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 默认展开状态：只有库根默认展开一层 */
  function defaultOpen(node: TreeNode): boolean {
    return node.type === "vault";
  }

  /** 当前是否展开 = 默认值被 toggled 取反 */
  function isOpen(node: TreeNode): boolean {
    const d = defaultOpen(node);
    return toggled.has(node.key) ? !d : d;
  }

  function toggle(node: TreeNode) {
    setToggled((s) => { const n = new Set(s); if (n.has(node.key)) n.delete(node.key); else n.add(node.key); return n; });
  }

  /** 展开全部 / 折叠全部：把「当前状态与目标不符」的节点放进 toggled */
  function setAll(open: boolean) {
    const keys = new Set<string>();
    const walk = (nodes: TreeNode[]): void => {
      for (const n of nodes) {
        if (n.type === "file") continue;
        // toggled 的语义是「与默认展开状态相反」，所以这里必须跟 defaultOpen 比，
        // 不能跟当前 isOpen 比（否则已手动展开的目录会被算错）。
        if (defaultOpen(n) !== open) keys.add(n.key);
        walk(n.children);
      }
    };
    walk(tree);
    setToggled(keys);
  }

  async function requestOpen(payload: { root: string; rel: string; kind: "file" | "folder" }) {
    const res = await fetch("/api/system-open", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    const d = await res?.json().catch(() => ({})) ?? {};
    if (!res?.ok) { setNotice(`打开失败：${d.error ?? res?.status ?? "网络错误"}`); return; }
    if (d.mode === "obsidian" && d.uri) {
      setNotice("已跳转到 Obsidian（若没反应，请确认已在 Obsidian 里注册这个库）");
      window.location.href = d.uri;
      return;
    }
    if (d.fallback === "obsidian_unavailable") {
      setNotice("Obsidian 库名未配置或链接不可用，已改用系统默认应用打开");
    } else {
      setNotice(d.launched ? `已向系统发起打开请求（${d.via ?? "系统默认应用"}）` : `打开失败：${d.error ?? "未知原因"}`);
    }
  }

  function openFile(node: TreeNode) {
    const now = Date.now();
    // 双击必然先触发两次 click → 时间窗去重，保证只打开一次
    if (lastOpen.current && lastOpen.current.key === node.key && now - lastOpen.current.at < 450) return;
    lastOpen.current = { key: node.key, at: now };
    void requestOpen({ root: node.root, rel: node.rel, kind: "file" });
  }

  function onDirClick(node: TreeNode) {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => { toggle(node); clickTimer.current = null; }, 220);
  }
  function onDirDoubleClick(node: TreeNode) {
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null; }
    void requestOpen({ root: node.root, rel: node.rel, kind: "folder" });
  }

  async function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) { setNotice("没有收到文件（本轮只支持拖单个文件，不支持拖文件夹）"); return; }
    setUploading(true); setNotice(null);
    try {
      const fd = new FormData(); fd.append("file", f);
      const res = await fetch("/api/internal-files/upload", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setNotice(`保存失败：${d.error ?? res.status}`); }
      else {
        setNotice(`已把「${d.file?.filename ?? f.name}」放进内部库暂存区，去「内部库」tab 可整理（不会自动分类或移动）`);
        onUploaded?.(); onRefresh();
      }
    } catch { setNotice("上传失败：网络错误"); }
    setUploading(false);
  }

  function renderNode(node: TreeNode, depth: number): React.ReactNode {
    const isFile = node.type === "file";
    const isCollapsed = !isOpen(node);
    const caret = isFile ? "" : isCollapsed ? "▸" : "▾";
    const badge = isFile && node.file
      ? (node.file.ext.replace(/^\./, "").toUpperCase() || "FILE") : "";
    return (
      <div key={node.key}>
        <div
          className={`ft-row ft-${node.type}`}
          style={{ paddingLeft: 10 + depth * 16, ["--ft-depth" as string]: depth }}
          title={isFile && node.file ? tipOf(node.file) : `${node.type === "vault" ? "库根目录" : "文件夹"}：${node.rel || node.root}\n单击折叠/展开，双击打开系统文件管理器`}
          onClick={isFile ? () => openFile(node) : () => onDirClick(node)}
          onDoubleClick={isFile ? () => openFile(node) : () => onDirDoubleClick(node)}
        >
          <span className="ft-caret">{caret}</span>
          <span className="ft-icon">{isFile ? "◇" : node.type === "vault" ? "▣" : "▤"}</span>
          <span className="ft-name">{node.name}</span>
          {badge && <span className="ft-badge">{badge}</span>}
        </div>
        {!isFile && !isCollapsed && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  }

  return (
    <div
      className={`ft ${dragging ? "ft-dragging" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
      onDrop={onDrop}
    >
      <div className="ft-bar">
        <span className="muted">
          共 {total} 个文件{truncated ? `（只显示前 ${files.length} 个）` : ""} · 默认折叠子目录；单击文件夹展开/折叠、双击打开资源管理器
        </span>
        <div className="ft-bar-actions">
          <button type="button" className="btn btn-sm" onClick={() => setAll(false)}>全部折叠</button>
          <button type="button" className="btn btn-sm" onClick={() => setAll(true)}>展开全部</button>
          <button type="button" className="btn btn-sm" onClick={onRefresh}>刷新</button>
        </div>
      </div>
      {notice && <p className="form-notice ft-notice">{notice}</p>}
      <div className="ft-tree">
        {tree.length === 0 ? (
          <p className="muted ft-empty">这个库里还没有文件。把本地文件拖到这里，会自动存进内部库暂存区。</p>
        ) : tree.map((v) => renderNode(v, 0))}
      </div>
      <p className="muted ft-drop-hint">
        {uploading ? "正在保存…" : "把本地文件拖到这个区域 → 存进暂存区（单文件，≤20MB；不自动分类、不自动批准）"}
      </p>
    </div>
  );
}
