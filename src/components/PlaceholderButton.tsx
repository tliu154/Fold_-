"use client";

/**
 * 占位按钮（留空规则 3.2 · UI 占位）
 * 按钮可见，点击提示「该功能待定义」
 */
import { useState } from "react";

export default function PlaceholderButton({
  label,
  hint = "该功能待定义",
  primary = false,
}: {
  label: string;
  hint?: string;
  primary?: boolean;
}) {
  const [shown, setShown] = useState(false);

  function handleClick() {
    setShown(true);
    window.setTimeout(() => setShown(false), 2000);
  }

  return (
    <span className="placeholder-btn">
      <button
        type="button"
        className={primary ? "btn btn-primary" : "btn"}
        onClick={handleClick}
      >
        {label}
      </button>
      {shown && (
        <span className="placeholder-hint" role="status">
          {hint}
        </span>
      )}
    </span>
  );
}
