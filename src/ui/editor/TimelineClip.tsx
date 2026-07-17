import { useEffect, useRef } from "react";
import type { EffectClip, VideoClip } from "../../domain/project/model";

export type TimelineClipKind = "video" | "effect";

export type TimelineClipProps = {
  clip: VideoClip | EffectClip;
  kind: TimelineClipKind;
  label: string;
  fromFrame: number;
  durationInFrames: number;
  pixelsPerFrame: number;
  selected: boolean;
  onSelect: (clipId: string) => void;
  onMove: (clipId: string, fromFrame: number) => void;
  onResize: (clipId: string, fromFrame: number, durationInFrames: number) => void;
};

type DragState = {
  mode: "move" | "resize-right" | "resize-left";
  startX: number;
  startFromFrame: number;
  startDuration: number;
};

/** 中文注释：时间轴片段只负责把鼠标手势转换成高层事件，不接触 EditorStore。 */
export function TimelineClip({
  clip,
  kind,
  label,
  fromFrame,
  durationInFrames,
  pixelsPerFrame,
  selected,
  onSelect,
  onMove,
  onResize,
}: TimelineClipProps) {
  const dragRef = useRef<DragState | null>(null);
  const latestFrameRef = useRef(fromFrame);
  const latestDurationRef = useRef(durationInFrames);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const deltaFrames = Math.round((event.clientX - drag.startX) / pixelsPerFrame);
      if (drag.mode === "move") {
        latestFrameRef.current = Math.max(0, drag.startFromFrame + deltaFrames);
        return;
      }

      if (drag.mode === "resize-right") {
        latestDurationRef.current = Math.max(1, drag.startDuration + deltaFrames);
        return;
      }

      const nextFromFrame = Math.max(
        0,
        Math.min(
          drag.startFromFrame + drag.startDuration - 1,
          drag.startFromFrame + deltaFrames,
        ),
      );
      latestFrameRef.current = nextFromFrame;
      latestDurationRef.current = Math.max(
        1,
        drag.startDuration - (nextFromFrame - drag.startFromFrame),
      );
    };

    const handleMouseUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;

      if (drag.mode === "move") {
        onMove(clip.id, latestFrameRef.current);
      } else {
        onResize(clip.id, latestFrameRef.current, latestDurationRef.current);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [clip.id, onMove, onResize, pixelsPerFrame]);

  const beginDrag = (mode: DragState["mode"], event: React.MouseEvent) => {
    event.stopPropagation();
    onSelect(clip.id);
    latestFrameRef.current = fromFrame;
    latestDurationRef.current = durationInFrames;
    dragRef.current = {
      mode,
      startX: event.clientX,
      startFromFrame: fromFrame,
      startDuration: durationInFrames,
    };
  };

  return (
    <button
      aria-label={`${label}，${kind === "video" ? "视频" : "特效"}片段`}
      className={`timeline-clip ${kind}-clip${selected ? " selected" : ""}`}
      onClick={() => onSelect(clip.id)}
      onMouseDown={(event) => beginDrag("move", event)}
      style={{
        left: fromFrame * pixelsPerFrame,
        width: Math.max(28, durationInFrames * pixelsPerFrame),
      }}
      type="button"
    >
      <span className="timeline-clip__label">{label}</span>
      <span
        aria-label={`调整${label}结束位置`}
        className="timeline-clip__handle timeline-clip__handle--right"
        onMouseDown={(event) => beginDrag("resize-right", event)}
      />
      <span
        aria-label={`调整${label}开始位置`}
        className="timeline-clip__handle timeline-clip__handle--left"
        onMouseDown={(event) => beginDrag("resize-left", event)}
      />
    </button>
  );
}
