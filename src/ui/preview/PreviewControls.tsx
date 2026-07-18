import type { PlayerRef } from "@remotion/player";
import { useEffect, useState } from "react";
import type { ChangeEvent, RefObject } from "react";
import { clampPreviewFrame } from "./PreviewPlayer";

export type PreviewControlsProps = {
  currentFrame: number;
  durationInFrames: number;
  fps: number;
  playerRef: RefObject<PlayerRef | null>;
  onFrameChange?: (frame: number) => void;
};

/** 中文注释：用帧数换算简洁的分秒读数，工作区始终显示项目时间而非播放器内部状态。 */
export function formatPreviewTime(frame: number, fps: number): string {
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 1;
  const totalSeconds = Math.max(0, Math.floor(frame / safeFps));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** 中文注释：实时预览控制栏作为工作区元素渲染，不能成为实际视频画布的一部分。 */
export function PreviewControls({
  currentFrame,
  durationInFrames,
  fps,
  playerRef,
  onFrameChange,
}: PreviewControlsProps) {
  const safeCurrentFrame = clampPreviewFrame(currentFrame, durationInFrames);
  const lastFrame = clampPreviewFrame(durationInFrames - 1, durationInFrames);
  const [isPlaying, setIsPlaying] = useState(() => playerRef.current?.isPlaying() ?? false);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    // 中文注释：播放器也可能由时间轴或媒体事件暂停，因此监听事件来更新控制按钮文案。
    const syncPlaybackState = () => setIsPlaying(player.isPlaying());
    player.addEventListener("play", syncPlaybackState);
    player.addEventListener("pause", syncPlaybackState);
    player.addEventListener("ended", syncPlaybackState);
    syncPlaybackState();
    return () => {
      player.removeEventListener("play", syncPlaybackState);
      player.removeEventListener("pause", syncPlaybackState);
      player.removeEventListener("ended", syncPlaybackState);
    };
  }, [playerRef]);

  const togglePlayback = () => {
    const player = playerRef.current;
    if (!player) return;
    if (player.isPlaying()) {
      player.pause();
      setIsPlaying(false);
      return;
    }
    player.play();
    setIsPlaying(true);
  };

  const seekFromControls = (event: ChangeEvent<HTMLInputElement>) => {
    const frame = clampPreviewFrame(Number(event.currentTarget.value), durationInFrames);
    // 中文注释：先直接定位 Player，再通知页面更新 currentFrame，使时间轴播放头立即与预览一致。
    playerRef.current?.seekTo(frame);
    onFrameChange?.(frame);
  };

  return (
    <div aria-label="实时预览控制栏" className="preview-controls" role="group">
      <button
        aria-label={isPlaying ? "暂停预览" : "播放预览"}
        className="preview-controls__toggle"
        onClick={togglePlayback}
        type="button"
      >
        {isPlaying ? "Ⅱ" : "▶"}
      </button>
      <span className="preview-controls__time">{formatPreviewTime(safeCurrentFrame, fps)} / {formatPreviewTime(durationInFrames, fps)}</span>
      <input
        aria-label="预览进度"
        className="preview-controls__progress"
        max={lastFrame}
        min="0"
        onChange={seekFromControls}
        step="1"
        type="range"
        value={safeCurrentFrame}
      />
    </div>
  );
}
