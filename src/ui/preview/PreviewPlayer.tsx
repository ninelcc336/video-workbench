import { Player } from "@remotion/player";
import type { PlayerRef } from "@remotion/player";
import { useEffect, useRef } from "react";
import { EditorComposition, getCompositionDurationInFrames, type EditorCompositionProps } from "../../remotion/EditorComposition";

export type PreviewPlayerProps = EditorCompositionProps & {
  currentFrame?: number;
  onFrameChange?: (frame: number) => void;
};

/** 中文注释：Remotion 的合法帧范围是 0 到 duration - 1，所有外部定位先经过同一处裁剪。 */
export function clampPreviewFrame(frame: number, durationInFrames: number): number {
  const safeDuration = Number.isFinite(durationInFrames) && durationInFrames > 0
    ? Math.max(1, Math.floor(durationInFrames))
    : 1;
  const safeFrame = Number.isFinite(frame) ? Math.round(frame) : 0;
  return Math.max(0, Math.min(safeDuration - 1, safeFrame));
}

// 中文注释：Player 只负责浏览器预览，视觉实现由共享 EditorComposition 提供。
export function PreviewPlayer({
  project,
  mediaSources,
  currentFrame = 0,
  onFrameChange,
}: PreviewPlayerProps) {
  const playerRef = useRef<PlayerRef>(null);
  const durationInFrames = getCompositionDurationInFrames(project);
  const safeCurrentFrame = clampPreviewFrame(currentFrame, durationInFrames);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !onFrameChange) return;

    const handleFrameUpdate = ({ detail }: { detail: { frame: number } }) => {
      onFrameChange(clampPreviewFrame(detail.frame, durationInFrames));
    };
    const handleSeeked = ({ detail }: { detail: { frame: number } }) => {
      onFrameChange(clampPreviewFrame(detail.frame, durationInFrames));
    };

    player.addEventListener("frameupdate", handleFrameUpdate);
    player.addEventListener("seeked", handleSeeked);
    return () => {
      player.removeEventListener("frameupdate", handleFrameUpdate);
      player.removeEventListener("seeked", handleSeeked);
    };
  }, [durationInFrames, onFrameChange]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || player.getCurrentFrame() === safeCurrentFrame) return;
    // 中文注释：时间轴或外部播放头改变时，主动驱动 Player 跳帧，避免只更新页面数字。
    player.seekTo(safeCurrentFrame);
  }, [safeCurrentFrame]);

  return (
    <Player
      component={EditorComposition}
      compositionHeight={project.settings.height}
      compositionWidth={project.settings.width}
      controls
      durationInFrames={durationInFrames}
      fps={project.settings.fps}
      inputProps={{ project, mediaSources }}
      initialFrame={safeCurrentFrame}
      ref={playerRef}
      style={{ height: "100%", width: "100%" }}
    />
  );
}
