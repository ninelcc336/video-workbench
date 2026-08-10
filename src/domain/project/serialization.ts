import type { EffectClip } from "./model";

/** 中文注释：历史片段没有起始样式时的稳定来源标记，不代表任何新版起始样式。 */
export const LEGACY_DEFAULT_STARTING_STYLE_ID = "legacy-default";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** 中文注释：读取已存在的放置声明；不识别的新版形状直接失败，避免把转场误当普通范围片段。 */
function readPlacement(value: unknown): EffectClip["placement"] {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("特效片段放置声明无效");
  }

  if (value.type === "range") {
    return { type: "range" };
  }

  if (
    value.type === "boundary" &&
    isNonEmptyString(value.beforeVideoClipId) &&
    isNonEmptyString(value.afterVideoClipId)
  ) {
    return {
      type: "boundary",
      beforeVideoClipId: value.beforeVideoClipId,
      afterVideoClipId: value.afterVideoClipId,
    };
  }

  throw new Error("特效片段放置类型不受支持");
}

/**
 * 中文注释：将旧版特效片段 JSON 读取为当前内存模型。
 * 只补齐兼容元数据，不迁移模板版本、特效族或渲染参数；字段非法时抛错交给仓储转成可展示的损坏项目错误。
 */
export function deserializeEffectClip(value: unknown): EffectClip {
  if (!isRecord(value)) {
    throw new Error("特效片段数据不是对象");
  }

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.templateId) ||
    !isPositiveInteger(value.templateVersion) ||
    !isNonEmptyString(value.trackId) ||
    !isNonNegativeInteger(value.fromFrame) ||
    !isPositiveInteger(value.durationInFrames) ||
    !isRecord(value.params)
  ) {
    throw new Error("特效片段数据格式无效");
  }

  const startingStyleId =
    value.startingStyleId === undefined
      ? LEGACY_DEFAULT_STARTING_STYLE_ID
      : value.startingStyleId;
  if (!isNonEmptyString(startingStyleId)) {
    throw new Error("特效片段起始样式 ID 无效");
  }

  const clip: EffectClip = {
    id: value.id,
    templateId: value.templateId,
    templateVersion: value.templateVersion,
    trackId: value.trackId,
    fromFrame: value.fromFrame,
    durationInFrames: value.durationInFrames,
    params: structuredClone(value.params),
    startingStyleId,
    placement: value.placement === undefined ? { type: "range" } : readPlacement(value.placement),
  };
  if (value.effectFamilyId !== undefined) {
    if (!isNonEmptyString(value.effectFamilyId)) {
      throw new Error("特效片段特效族 ID 无效");
    }
    clip.effectFamilyId = value.effectFamilyId;
  }

  return clip;
}
