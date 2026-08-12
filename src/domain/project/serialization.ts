import type { EffectClip } from "./model";

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

/** 中文注释：读取当前特效片段格式；开发期旧 JSON 缺少新模型字段时直接要求重建，不猜测迁移结果。 */
export function deserializeEffectClip(value: unknown): EffectClip {
  if (!isRecord(value)) {
    throw new Error("特效片段数据不是对象");
  }

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.templateId) ||
    !isPositiveInteger(value.templateVersion) ||
    !isNonEmptyString(value.effectFamilyId) ||
    !isNonEmptyString(value.startingStyleId) ||
    !isNonEmptyString(value.trackId) ||
    !isNonNegativeInteger(value.fromFrame) ||
    !isPositiveInteger(value.durationInFrames) ||
    !isRecord(value.params) ||
    value.placement === undefined
  ) {
    throw new Error("特效片段与当前开发期数据格式不兼容，请重建视频工作区");
  }

  const clip: EffectClip = {
    id: value.id,
    templateId: value.templateId,
    templateVersion: value.templateVersion,
    effectFamilyId: value.effectFamilyId,
    startingStyleId: value.startingStyleId,
    trackId: value.trackId,
    fromFrame: value.fromFrame,
    durationInFrames: value.durationInFrames,
    params: structuredClone(value.params),
    placement: readPlacement(value.placement),
  };

  return clip;
}
