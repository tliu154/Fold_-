/**
 * 空状态（简约 UI 基底 · 阶段 0）
 * 空列表必须有明确文案，不出空白页
 */
export default function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <p>{text}</p>
    </div>
  );
}
