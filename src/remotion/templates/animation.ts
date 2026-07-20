import { Easing, interpolate } from "remotion";

/** 中文注释：把动画时长收敛到有效帧数，避免异常参数破坏片段尾部的出场阶段。 */
function resolveAnimationDuration(
  durationInFrames: number,
  animationDuration: number,
): { durationInFrames: number; animationDuration: number } {
  const safeDurationInFrames = Number.isFinite(durationInFrames)
    ? Math.max(1, Math.round(durationInFrames))
    : 1;
  const requestedDuration = Number.isFinite(animationDuration)
    ? Math.max(1, Math.round(animationDuration))
    : safeDurationInFrames;

  return {
    durationInFrames: safeDurationInFrames,
    animationDuration: Math.min(safeDurationInFrames, requestedDuration),
  };
}

/** 中文注释：计算片段开始处的入场进度，并允许逐项动画使用帧偏移。 */
export function getEntranceProgress(
  frame: number,
  animationDuration: number,
  startFrame = 0,
): number {
  const safeDuration = Number.isFinite(animationDuration)
    ? Math.max(1, Math.round(animationDuration))
    : 1;
  const safeStartFrame = Number.isFinite(startFrame) ? Math.max(0, Math.round(startFrame)) : 0;

  return interpolate(frame, [safeStartFrame, safeStartFrame + safeDuration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
}

/** 中文注释：计算片段尾部的出场进度，数值从 1 过渡到 0 表示逐渐退出。 */
export function getExitProgress(
  frame: number,
  durationInFrames: number,
  animationDuration: number,
): number {
  const safeValues = resolveAnimationDuration(durationInFrames, animationDuration);
  const exitStartFrame = safeValues.durationInFrames - safeValues.animationDuration;

  return interpolate(
    frame,
    [exitStartFrame, safeValues.durationInFrames],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      // 中文注释：反向播放入场的 out 缓动，确保最后一帧已经接近完全不可见。
      easing: Easing.out(Easing.cubic),
    },
  );
}

/** 中文注释：合并入场和出场进度，保证片段中间保持完整显示、两端平滑收放。 */
export function getVisibilityProgress(
  frame: number,
  durationInFrames: number,
  animationDuration: number,
): number {
  return Math.min(
    getEntranceProgress(frame, animationDuration),
    getExitProgress(frame, durationInFrames, animationDuration),
  );
}
