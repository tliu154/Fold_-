"use client";

/**
 * 知识库 / 项目库页（二期 B1，B2 增补 obsidian:// 跳转，B3 增补「整理新笔记」，C2 增补提案入口）
 * - 两 tab：文件浏览（只读列表+筛选+元数据）/ 项目进度（STATUS.md 只读看板）
 * - B2：文件行「在 Obsidian 打开」链接；库名为空则禁用并提示；顶部可填写 Obsidian 库名
 * - B3：文件浏览 tab 顶部显示未整理文件数 + 「整理新笔记」按钮；
 *       点击只出变更预览，点「确认并整理」才真正移动/重命名（一次整理 = 一次 git commit）
 * - C2：整理区并排「生成提案预览」→ 提案预览不落库 → 保存后发站内消息，等你批准才动文件
 * - C3 第 1 轮：新增「内部库」tab —— 程序内部库未分类区的全格式整理（提案 → 批准 → 分流）
 * - C3 第 2 轮：文件浏览改树状紧凑 UI（去格式分类栏/目录筛选、hover 显详情、单击双击打开、
 *   双击文件夹开资源管理器、拖拽入暂存区）；加库 = 添加库根目录；就地「用一句话改设置」
 * - 不做：OCR、编辑正文、自动整理（B3 手动确认 / C2 用户批准才执行）、搜索（已登记 PRD §9.5）
 */
import { useCallback, useEffect, useState } from "react";
import ProposalGenerator from "./ProposalGenerator";
import InternalVaultPanel from "./InternalVaultPanel";
import FileTree from "./FileTree";
import LibraryVaults from "./LibraryVaults";
import AiSettingsBox from "./AiSettingsBox";

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
  inboxDir?: string;
  tidy?: { move: boolean; rename: boolean; tag: boolean };
}
interface TidyItem {
  from: string; to: string; filename: string; dir: string;
  title: string; tags: string[]; actions: string[];
  status: "ready" | "skip"; reason?: string;
}
interface TidyStatus {
  inbox: string; inboxExists: boolean; root: string;
  options: { move: boolean; rename: boolean; tag: boolean };
  repo: boolean; hasCommit: boolean; dirty: boolean; dirtyFiles: string[];
  canRun: boolean; blockedReason: string | null;
  counts: { total: number; ready: number; skipped: number };
  last: { at: string; commit: string; count: number; message: string } | null;
}
interface TidyPreview extends TidyStatus {
  items: TidyItem[];
}

type Tab = "files" | "projects" | "internal";

export default function KnowledgeView() {
  const [tab, setTab] = useState<Tab>("files");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [dirs, setDirs] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [vaultInput, setVaultInput] = useState("");
  const [tidy, setTidy] = useState<TidyStatus | null>(null);
  const [tidyPreview, setTidyPreview] = useState<TidyPreview | null>(null);
  const [tidyBusy, setTidyBusy] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);

  const loadFiles = useCallback(async () => {
    // 树状浏览要整棵树：一次取满 500（后端上限），不再按格式/目录筛选
    const res = await fetch("/api/libraries/files?limit=500").catch(() => null);
    if (!res?.ok) return;
    const d = await res.json();
    setFiles(d.files ?? []); setDirs(d.dirs ?? []);
    setTotal(d.total ?? 0); setTruncated(Boolean(d.truncated));
  }, []);

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

  const loadTidy = useCallback(async () => {
    const res = await fetch("/api/tidy").catch(() => null);
    if (!res?.ok) return;
    setTidy(await res.json());
  }, []);

  useEffect(() => { loadFiles(); loadProjects(); loadConfig(); loadTidy(); }, [loadFiles, loadProjects, loadConfig, loadTidy]);
  useEffect(() => { if (config) setVaultInput(config.obsidianVault ?? ""); }, [config]);

  async function openTidyPreview() {
    setError(null); setNotice(null); setTidyBusy(true);
    const res = await fetch("/api/tidy/preview", { method: "POST" }).catch(() => null);
    setTidyBusy(false);
    if (!res) { setError("请求失败"); return; }
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "预览失败"); return; }
    setTidyPreview(d.preview as TidyPreview);
  }

  async function confirmTidy() {
    setError(null); setNotice(null); setTidyBusy(true);
    const res = await fetch("/api/tidy/run", { method: "POST" }).catch(() => null);
    setTidyBusy(false);
    if (!res) { setError("请求失败"); return; }
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "整理失败"); return; }
    const r = d.result as { commit: string; count: number; moved: unknown[]; skipped: { reason: string }[] };
    setNotice(`已整理 ${r.count} 个文件，已提交 git（${r.commit}）${r.skipped.length ? `，跳过 ${r.skipped.length} 个` : ""}`);
    setTidyPreview(null);
    loadFiles(); loadTidy();
  }

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
      inboxDir: config.inboxDir ?? "",
      tidy: config.tidy ?? { move: true, rename: true, tag: false },
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

  return (
    <section>
      <h1 className="view-title">知识库 / 项目库</h1>
      <p className="view-desc">浏览知识库文件与项目进度（STATUS.md）。日常浏览纯只读；「整理新笔记」会按标签把未整理目录里的 .md 移到正确目录并在知识库做一次 git 提交（可回滚）。不预览正文、不编辑、不做 OCR。</p>
      {config && !config.obsidianVault && (
        <p className="muted">尚未填写 Obsidian 库名，「在 Obsidian 打开」链接已禁用；请在下方填写（需先在 Obsidian 里把测试库注册为 vault）。</p>
      )}

      <div className="todo-toolbar">
        <div className="seg">
          <button type="button" className={`seg-btn ${tab === "files" ? "active" : ""}`} onClick={() => setTab("files")}>文件浏览</button>
          <button type="button" className={`seg-btn ${tab === "projects" ? "active" : ""}`} onClick={() => setTab("projects")}>项目进度</button>
          <button type="button" className={`seg-btn ${tab === "internal" ? "active" : ""}`} onClick={() => setTab("internal")}>内部库</button>
        </div>
        <button type="button" className="btn btn-sm" onClick={startEdit}>高级配置</button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-notice">{notice}</p>}

      {tab === "files" && (
        <div className="panel lib-block">
          <div className="lib-tidy-bar">
            <div className="lib-tidy-info">
              <strong>未整理：{tidy?.counts.total ?? 0} 个文件</strong>
              <div className="muted">
                {tidy?.inbox ?? "D:\\我的知识库测试\\未整理"}
                {tidy && ` · 移动${tidy.options.move ? "✓" : "✗"} 重命名${tidy.options.rename ? "✓" : "✗"} 打标签${tidy.options.tag ? "✓" : "✗"}`}
              </div>
              {tidy && tidy.counts.skipped > 0 && (
                <div className="muted">其中 {tidy.counts.skipped} 个将跳过（不覆盖、不猜格式）</div>
              )}
              {tidy?.last && (
                <div className="muted">上次整理：{tidy.last.count} 个文件 · commit {tidy.last.commit}</div>
              )}
            </div>
            <div className="lib-tidy-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => { setProposalOpen(false); openTidyPreview(); }}
                disabled={tidyBusy}
              >
                {tidyBusy ? "处理中…" : "整理新笔记"}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => { setTidyPreview(null); setProposalOpen(true); }}
              >
                生成提案预览
              </button>
            </div>
          </div>
          {proposalOpen && (
            <ProposalGenerator
              autoOpen
              onClose={() => setProposalOpen(false)}
              onSaved={() => { setProposalOpen(false); loadTidy(); }}
            />
          )}
          {tidy?.blockedReason && !tidyPreview && (
            <p className="muted">{tidy.blockedReason}</p>
          )}
          {tidy?.dirty && (
            <p className="form-error">
              知识库有未提交改动（如 {tidy.dirtyFiles[0]}），先提交或还原再整理，避免混进同一次 commit。
            </p>
          )}

          {tidyPreview && (
            <div className="lib-tidy-preview">
              <h2 className="settings-h2">变更预览（确认前不会改动任何文件）</h2>
              <p className="muted">
                共 {tidyPreview.counts.total} 个文件，可执行 {tidyPreview.counts.ready} 个、跳过 {tidyPreview.counts.skipped} 个。
                确认后一次性执行并做一次 git commit（可在知识库里 git revert 回滚）。
                {!tidyPreview.repo && " 该知识库还不是 git 仓库，本次会先 git init（仅测试库）。"}
              </p>
              {tidyPreview.dirty && (
                <p className="form-error">有未提交改动：{tidyPreview.dirtyFiles.slice(0, 3).join("；")}</p>
              )}
              {tidyPreview.items.length === 0 ? (
                <p className="muted">未整理目录里没有文件。</p>
              ) : (
                <div className="lib-tidy-list">
                  {tidyPreview.items.map((i) => (
                    <div key={i.from} className="lib-tidy-row">
                      <div className="lib-tidy-main">
                        <strong>{i.filename}</strong>
                        <div className="muted">
                          {i.status === "ready" ? `→ ${i.dir}` : `跳过：${i.reason}`}
                          {i.tags.length > 0 && ` · ${i.tags.map((t) => `#${t}`).join(" ")}`}
                        </div>
                        <code className="muted lib-file-path">{i.from}</code>
                      </div>
                      <div className="capture-item-tags">
                        {i.actions.map((a) => <span key={a} className="tag">{a}</span>)}
                        {i.status === "skip" && <span className="tag">跳过</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={confirmTidy}
                  disabled={!tidyPreview.canRun || tidyBusy}
                >
                  {tidyBusy ? "整理中…" : `确认并整理（${tidyPreview.counts.ready}）`}
                </button>
                <button type="button" className="btn" onClick={() => setTidyPreview(null)} disabled={tidyBusy}>取消</button>
              </div>
            </div>
          )}

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
          <FileTree files={files} total={total} truncated={truncated} onRefresh={loadFiles} />
          <AiSettingsBox
            title="用一句话改设置（打开方式 / 整理规范 / 周报数据源）"
            hint="管家懂网站的接口：可以直接说「把 PDF 改成用系统应用打开」「关掉 git 提交这个数据源」。生成草案后逐条确认才生效。"
            onApplied={loadFiles}
          />
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

      {tab === "internal" && <InternalVaultPanel />}

      {config && (
        <LibraryVaults
          config={config}
          onChanged={(c) => { setConfig(c); loadFiles(); loadProjects(); }}
          onEditAdvanced={startEdit}
        />
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
