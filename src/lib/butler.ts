/**
 * AI 管家（一期 A9）
 * - 管家/秘书身份，只处理站内问题；超出范围婉拒并引导回站内功能
 * - 简单问答无状态（不落库）；复杂任务「开会话」复用 A6 chat_session 机制带上下文
 * - 能力：基础身份 + assistant 功能记忆(A7) + A8 三个只读检索工具
 * - 不新增表：会话壳 memory 表 chat_session、消息 ai_messages
 * - 不做：SSE / 记账 / 预算 / AI 限流 / 自动沉淀 / 「记下来」(A10)
 */
import { sendMessage } from "./chat";

/** 管家身份 system：站内范围 + 婉拒规则 */
export const BUTLER_SYSTEM = [
  "你是本站的 AI 管家/秘书，服务于这个本地个人 AI 指挥台。",
  "职责范围：站内的待办、日程、打卡、长期目标、笔记检索、设置等功能的查询与建议，",
  "以及基于笔记索引回答「笔记在哪、有哪些相关笔记、有多少笔记」这类站内问题。",
  "范围外的问题（如通用百科、闲聊、写作、编程通识、实时新闻）请礼貌婉拒，",
  "并明确说明你只处理本站相关事务，引导用户使用站内功能或对应的 AI 对话。",
  "回答要简洁、直接；站内能力相关的问题优先用检索工具查实时数据，不要凭空编造。",
].join("\n");

/** 常用功能快捷按钮（点击填入输入框，不自动发送） */
export const QUICK_QUESTIONS = [
  "今天有什么待办？",
  "最近有什么日程？",
  "我的笔记里有哪些关于微积分的内容？",
  "统计一下我的笔记数量和分布。",
];

export interface ButlerAskInput {
  question: string;
  mode: "stateless" | "session";
  session_id?: string;
}

/**
 * 管家问答：
 * - stateless：临时问答，不落库、不留会话
 * - session  ：复用 A6 会话壳带上下文，落库
 */
export async function butlerAsk(input: ButlerAskInput) {
  const q = input.question.trim();
  if (!q) throw new Error("问题不能为空");
  return sendMessage({
    mode: input.mode === "stateless" ? "temp" : "normal",
    session_id: input.session_id,
    message: q,
    butlerSystem: BUTLER_SYSTEM,
  });
}
