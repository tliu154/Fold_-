"use client";

/**
 * 「添加一个库」（三期 C3 第 2 轮）
 * 加库 = 像 Obsidian 打开一个已有库：选一个根目录，根下所有文件都属于这个库。
 * 只影响浏览与检索范围；整理/导出/git 的写入目标不因加库而变。
 * 高级字段（项目库 / 检索白名单 / 导出目标 / dirMap / Obsidian 库名）仍走 JSON 文本框。
 */
import { useState } from "react";

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

interface Props {
  config: Config;
  onChanged: (cfg: Config) => void;
  onEditAdvanced: () => void;
}

export default function LibraryVaults({ config, onChanged, onEditAdvanced }: Props) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(method: "POST" | "DELETE", p: string) {
    setBusy(true); setError(null); setNotice(null);
    const res = await fetch("/api/libraries/vaults", {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: p }),
    }).catch(() => null);
    const d = await res?.json().catch(() => ({})) ?? {};
    setBusy(false);
    if (!res?.ok) { setError(d.error ?? `请求失败(${res?.status ?? "网络错误"})`); return false; }
    onChanged(d.config as Config);
    setNotice(method === "POST" ? `已加入库：${d.added}` : `已移除库：${d.removed}`);
    return true;
  }

  async function add() {
    const p = input.trim();
    if (!p) return;
    if (await call("POST", p)) setInput("");
  }

  function remove(p: string) {
    if (!window.confirm(`移除库「${p}」？只影响网页浏览与检索范围，不会删除磁盘上的任何文件。`)) return;
    void call("DELETE", p);
  }

  return (
    <div className="panel lv">
      <h3 className="iv-title">已加入的库（{config.knowledgeDirs.length}）</h3>
      <p className="muted">
        一个库 = 一个根目录，根下所有文件都属于它。加库只影响网页浏览与检索范围；
        整理、导出、git 的写入目标保持锁定，不会跟着变。
      </p>
      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-notice">{notice}</p>}
      <div className="lv-list">
        {config.knowledgeDirs.map((d) => (
          <div className="lv-row" key={d}>
            <span className="lv-icon">▣</span>
            <span className="lv-path">{d}</span>
            <button type="button" className="btn btn-sm" disabled={busy || config.knowledgeDirs.length <= 1}
              onClick={() => remove(d)}>移除</button>
          </div>
        ))}
      </div>
      <div className="lv-add">
        <input
          className="input" value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="例如 D:\我的知识库测试\另一个库（目录需已存在）"
          onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
          aria-label="要加入的库根目录"
        />
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !input.trim()} onClick={add}>添加库</button>
      </div>
      <div className="lv-advanced">
        <button type="button" className="btn btn-sm" onClick={onEditAdvanced}>高级配置（JSON：项目库 / 检索 / 导出 / 目录映射 / Obsidian 库名）</button>
      </div>
    </div>
  );
}
