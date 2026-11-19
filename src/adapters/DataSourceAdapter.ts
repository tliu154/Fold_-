/**
 * 数据源适配器统一接口（阶段 0：仅接口定义 + 空注册表）
 * 扩展协议（3.3）：
 * - 新数据源一律实现本接口，不改 items 主表结构
 * - 新类型用 items.type + payload 扩展
 * - 阶段 0 不写任何真实适配器
 */

/** 归一化后的条目（写入 items 表前的中间形态） */
export interface NormalizedItem {
  type: string; // note|idea|task|diary|expense|event|feed|goal（可扩展）
  title?: string;
  content?: string;
  payload?: Record<string, unknown>;
}

export interface IncrementalResult {
  items: NormalizedItem[];
  cursor?: string; // 增量游标，下次从这里继续
}

export interface HealthResult {
  ok: boolean;
  message?: string;
}

export interface DataSourceAdapter {
  /** 适配器唯一 id（与 features.ts 的 owner_adapter 对应） */
  id: string;
  /** 展示名 */
  name: string;
  /** 拉取自上次游标以来的增量数据 */
  fetchIncremental(cursor?: string): Promise<IncrementalResult>;
  /** 把原始数据归一化为 NormalizedItem */
  normalizeToItem(raw: unknown): NormalizedItem;
  /** 数据源可用性检查 */
  healthCheck(): Promise<HealthResult>;
}

/**
 * 空注册表（阶段 0）
 * TODO: 待澄清后实现——新数据源接入时在此登记
 */
export const adapterRegistry = new Map<string, DataSourceAdapter>();

export function listAdapters(): { id: string; name: string }[] {
  return Array.from(adapterRegistry.values()).map((a) => ({ id: a.id, name: a.name }));
}
