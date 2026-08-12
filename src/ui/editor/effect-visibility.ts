import type { EditProject, EffectClip } from "../../domain/project/model";
import { getEffectClipFrameRange } from "../../domain/project/transition";

/** 中文注释：按范围或当前交界点派生的左闭右开区间判断特效可见性，避免边界转场使用过期坐标。 */
export function isEffectClipActive(
  clip: EffectClip,
  currentFrame: number,
  project?: EditProject,
): boolean {
  const range = project ? getEffectClipFrameRange(project, clip) : {
    fromFrame: clip.fromFrame,
    durationInFrames: clip.durationInFrames,
  };
  return range !== null
    && range.fromFrame <= currentFrame
    && currentFrame < range.fromFrame + range.durationInFrames;
}
