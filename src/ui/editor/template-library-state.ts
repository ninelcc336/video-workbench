/** 中文注释：最近使用记录属于浏览器偏好，不写入视频工作区项目或其资产快照。 */
export const TEMPLATE_LIBRARY_RECENT_STORAGE_KEY = "frame-flow.template-library.recent";

const MAX_RECENT_EFFECTS = 8;

export type RecentEffectReference = {
  familyId: string;
  version: number;
  startingStyleId: string;
};

/** 中文注释：服务端渲染和浏览器隐私限制下都不访问不存在或不可用的本地存储。 */
function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 中文注释：仅接受完整的族、版本和起始样式身份，避免损坏记录污染最近入口。 */
function isRecentEffectReference(value: unknown): value is RecentEffectReference {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<RecentEffectReference>;
  return Boolean(
    typeof candidate.familyId === "string" && candidate.familyId.trim() &&
    typeof candidate.version === "number" && Number.isInteger(candidate.version) && candidate.version > 0 &&
    typeof candidate.startingStyleId === "string" && candidate.startingStyleId.trim(),
  );
}

/**
 * 中文注释：读取浏览器中的最近使用族身份；存储权限或 JSON 损坏时返回空列表，不能阻断模板库加载。
 */
export function getRecentEffectReferences(storage: Storage | null = getBrowserStorage()): RecentEffectReference[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(TEMPLATE_LIBRARY_RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentEffectReference).slice(0, MAX_RECENT_EFFECTS);
  } catch {
    return [];
  }
}

/**
 * 中文注释：把最近使用族移到列表首位并按族版本去重；只保存发现所需身份，不保存参数或工作区数据。
 */
export function rememberEffectReference(
  reference: RecentEffectReference,
  storage: Storage | null = getBrowserStorage(),
): RecentEffectReference[] {
  const current = getRecentEffectReferences(storage);
  const next = [
    reference,
    ...current.filter((item) => !(item.familyId === reference.familyId && item.version === reference.version)),
  ].slice(0, MAX_RECENT_EFFECTS);

  if (storage) {
    try {
      storage.setItem(TEMPLATE_LIBRARY_RECENT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 中文注释：浏览器存储不可写时仍返回内存结果，当前添加特效动作不能因此失败。
    }
  }
  return next;
}
