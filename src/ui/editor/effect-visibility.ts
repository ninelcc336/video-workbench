import type { EffectClip } from "../../domain/project/model";

/** 中文注释：特效片段使用左闭右开帧区间，确保结束帧已经不再显示可交互选区。 */
export function isEffectClipActive(
  clip: Pick<EffectClip, "fromFrame" | "durationInFrames">,
  currentFrame: number,
): boolean {
  return clip.fromFrame <= currentFrame && currentFrame < clip.fromFrame + clip.durationInFrames;
}
