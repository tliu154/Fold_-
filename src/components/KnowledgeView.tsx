"use client";

/**
 * 知识库 / 项目库页（二期 B1，B2 增补 obsidian:// 跳转）
 * - 两 tab：文件浏览（只读列表+筛选+元数据）/ 项目进度（STATUS.md 只读看板）
 * - B2：文件行「在 Obsidian 打开」链接；库名为空则禁用并提示；顶部可填写 Obsidian 库名
 * - 下方「资源库配置」：统一配知识库目录/项目库目录，并收敛 A8 检索白名单与 A10 导出
 * - 不做：git 整理、整理新笔记按钮、OCR、编辑正文（后续轮次）
 */
import { useCallback, useEffect, useState } from "react";

interface FileEntry {
  path: string; name: string; ext: string; size: number; mtime: string;
  dir: string; root: string; title?: string; tags?: string[];
  obsidian_uri?: string | null;
}
interface Project {
  name: string; path: string; hasStatus: boolean; progress: number | null;
  tasks: { done: number; total: number }; updated_at: string | null;
}
interface Config {
  knowledgeDirs: string[];
  projectDirs: string[];
  indexDirs: string[];
  exportVault: string;
  dirMap: Record<string, string>;
  obsidianVault?: string;
}

type Tab = "files" | "projects";

export default function KnowledgeView() {
  const [tab, setTab] = useState<Tab>("files");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [dirs, setDirs] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [kind, setKind] = useState("all");
  const [dir, setDir] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [vaultInput, setVaultInput] = useState("");

  const loadFiles = useCallback(async () => {
    const q = new URLSearchParams();
    if (kind !== "all") q.set("kind", kind);
    if (dir) q.set("dir", dir);
    const res = await fetch(`/api/libraries/files?${q.toString()}`).catch(() => null);
    if (!res?.ok) return;
    const d = await res.json();
    setFiles(d.files ?? []); setDirs(d.dirs ?? []);
    setTotal(d.total ?? 0); setTruncated(Boolean(d.truncated));
  }, [kind, dir]);

  const loadProjects = useCallback(async () => {
    const res = await fetch("/api/libraries/projects").catch(() => null);
    if (!res?.ok) return;
    setProjects((await res.json()).projects ?? []);
  }, []);

  const loadConfig = useCallback(async () => {
    const res = await fetch("/api/libraries").catch(() => null);
    if (!res?.ok) return;
    setConfig((await res.json()).config ?? null);
  }, []);

  useEffect(() => { loadFiles(); loadProjects(); loadConfig(); }, [loadFiles, loadProjects, loadConfig]);
  useEffect(() => { if (config) setVaultInput(config.obsidianVault ?? ""); }, [config]);

  async function saveVault() {
    if (!config) return;
    setError(null); setNotice(null);
    const res = await fetch("/api/libraries", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        knowledgeDirs: config.knowledgeDirs,
        projectDirs: config.projectDirs,
        indexDirs: config.indexDirs,
        exportVault: config.exportVault,
        dirMap: config.dirMap,
        obsidianVault: vaultInput.trim(),
      }),
    });
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "保存失败"); return; }
    setConfig(d.config);
    setNotice("Obsidian 库名已保存，跳转链接已更新");
    loadFiles();
  }

  function startEdit() {
    if (!config) return;
    setForm(JSON.stringify({
      knowledgeDirs: config.knowledgeDirs,
      projectDirs: config.projectDirs,
      indexDirs: config.indexDirs,
      exportVault: config.exportVault,
      dirMap: config.dirMap,
      obsidianVault: config.obsidianVault ?? "",
    }, null, 2));
    setEditing(true); setError(null);
  }

  async function saveConfig() {
    let parsed: Config;
    try { parsed = JSON.parse(form) as Config; }
    catch { setError("JSON 格式不合法"); return; }
    setError(null);
    const res = await fetch("/api/libraries", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    });
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "保存失败"); return; }
    setConfig(d.config); setEditing(false); setNotice("已保存并同步检索/导出配置");
    loadFiles(); loadProjects();
  }

  function fmtSize(n: number) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <section>
      <h1 className="view-title">知识库 / 项目库</h1>
      <p className="view-desc">只读浏览知识库文件与项目进度（STATUS.md）。不预览正文、不编辑、不做 OCR；不会写入任何文件。</p>
      {config && !config.obsidianVault && (
        <p className="muted">尚未填写 Obsidian 库名，「在 Obsidian 打开」链接已禁用；请在下方填写（需先在 Obsidian 里把测试库注册为 vault）。</p>
      )}

      <div className="todo-toolbar">
        <div className="seg">
          <button type="button" className={`seg-btn ${tab === "files" ? "active" : ""}`} onClick={() => setTab("files")}>文件浏览</button>
          <button type="button" className={`seg-btn ${tab === "projects" ? "active" : ""}`} onClick={() => setTab("projects")}>项目进度</button>
        </div>
        <button type="button" className="btn btn-sm" onClick={startEdit}>配置目录</button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-notice">{notice}</p>}

      {tab === "files" && (
        <div className="panel lib-block">
          <div className="lib-obsidian-bar">
            <label className="muted" htmlFor="obsidian-vault">Obsidian 库名</label>
            <input
              id="obsidian-vault"
              className="input"
              value={vaultInput}
              onChange={(e) => setVaultInput(e.target.value)}
              placeholder="留空则禁用跳转"
              aria-label="Obsidian 库名"
            />
            <button type="button" className="btn btn-sm" onClick={saveVault}>保存库名</button>
          </div>
          <div className="lib-filters">
            <div className="seg">
              {[
                ["all", "全部"], ["md", "Markdown"], ["pdf", "PDF"], ["html", "HTML"], ["doc", "Word"], ["other", "其它"],
              ].map(([k, label]) => (
                <button key={k} type="button" className={`seg-btn ${kind === k ? "active" : ""}`} onClick={() => setKind(k)}>{label}</button>
              ))}
            </div>
            <select className="input" value={dir} onChange={(e) => setDir(e.target.value)} aria-label="目录筛选">
              <option value="">全部目录</option>
              {dirs.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <p className="muted">共 {total} 个文件{truncated ? `（显示前 ${files.length} 个）` : ""}</p>
          <div className="lib-files">
            {files.length === 0 ? <p className="muted">该范围内没有文件</p> : files.map((f) => (
              <div key={f.path} className="lib-file-row">
                <div className="lib-file-main">
                  <strong>{f.title || f.name}</strong>
                  <div className="muted">{f.dir} · {f.ext} · {fmtSize(f.size)} · {new Date(f.mtime).toLocaleDateString("zh-CN")}</div>
                  {f.tags && f.tags.length > 0 && (
                    <div className="capture-item-tags">{f.tags.map((t) => <span key={t} className="tag">#{t}</span>)}</div>
                  )}
                  {f.obsidian_uri ? (
                    <a className="lib-open-link" href={f.obsidian_uri}>在 Obsidian 打开 →</a>
                  ) : (
                    <span className="muted lib-open-disabled" title="请先填写 Obsidian 库名">未配置库名</span>
                  )}
                </div>
                <code className="muted lib-file-path">{f.path}</code>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "projects" && (
        <div className="panel lib-block">
          {projects.length === 0 ? <p className="muted">项目库目录下没有子项目</p> : projects.map((p) => (
            <div key={p.path} className="lib-project-row">
              <div className="lib-project-main">
                <strong>{p.name}</strong>
                <div className="muted">
                  {p.hasStatus
                    ? `进度 ${p.progress ?? "—"}% · checkbox ${p.tasks.done}/${p.tasks.total}`
                    : "无 STATUS.md（不猜 README）"}
                </div>
                {p.hasStatus && p.progress !== null && (
                  <span className="goal-progress"><span className="goal-progress-bar" style={{ width: 120 }}>
                    <span className="goal-progress-fill" style={{ width: `${p.progress}%` }} />
                  </span></span>
                )}
              </div>
              <code className="muted lib-file-path">{p.path}</code>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="panel lib-config">
          <h2 className="settings-h2">资源库配置（JSON）</h2>
          <p className="muted">统一配置知识库/项目库目录；保存会同步到 A8 检索白名单与 A10 导出目标。</p>
          <textarea className="input" rows={12} value={form} onChange={(e) => setForm(e.target.value)} />
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={saveConfig}>保存</button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>取消</button>
          </div>
        </div>
      )}
    </section>
  );
}
