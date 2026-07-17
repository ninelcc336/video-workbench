import { useEffect, useMemo } from "react";
import type { EditProject, EffectClip, VideoClip } from "../../domain/project/model";
import { getTemplate } from "../../domain/templates/registry";
import { TimelineClip, type TimelineClipKind } from "./TimelineClip";

export type ClipKind = TimelineClipKind;

export type TimelineProps = {
  project: EditProject;
  selectedClipId: string | null;
  currentFrame?: number;
  pixelsPerFrame?: number;
  onSelectClip?: (clipId: string) => void;
  onMoveClip?: (clipId: string, kind: ClipKind, fromFrame: number) => void;
  onResizeClip?: (
    clipId: string,
    kind: ClipKind,
    fromFrame: number,
    durationInFrames: number,
  ) => void;
  onDeleteClip?: (clipId: string, kind: ClipKind) => void;
  onSeekFrame?: (frame: number) => void;
};

/** 中文注释：像素到帧的换算统一向最近整数帧吸附，保证时间轴与项目模型一致。 */
export function pixelsToFrames(pixels: number, pixelsPerFrame: number): number {
  if (!Number.isFinite(pixelsPerFrame) || pixelsPerFrame <= 0) {
    throw new RangeError("每帧像素必须是正数");
  }
  return Math.round(pixels / pixelsPerFrame);
}

/** 中文注释：裁剪边界始终保证起点非负且时长至少为一帧。 */
export function clampClipRange(
  fromFrame: number,
  durationInFrames: number,
  minFrame = 0,
  maxFrame = Number.POSITIVE_INFINITY,
): { fromFrame: number; durationInFrames: number } {
  const safeFromFrame = Math.max(minFrame, Math.min(fromFrame, maxFrame - 1));
  const safeDuration = Math.max(
    1,
    Math.min(durationInFrames, Math.max(1, maxFrame - safeFromFrame)),
  );
  return {
    fromFrame: Math.round(safeFromFrame),
    durationInFrames: Math.round(safeDuration),
  };
}

function clipLabel(clip: VideoClip | EffectClip, kind: ClipKind): string {
  if (kind === "video") return `视频 ${clip.id.slice(-4)}`;
  if (!("templateId" in clip)) return "未知特效";
  try {
    return getTemplate(clip.templateId, clip.templateVersion).name;
  } catch {
    return "未知特效";
  }
}

function clipEnd(project: EditProject): number {
  const ends = [
    ...project.videoClips.map((clip) => clip.fromFrame + clip.durationInFrames),
    ...project.effectClips.map((clip) => clip.fromFrame + clip.durationInFrames),
  ];
  return Math.max(180, ...ends, 1);
}

/** 中文注释：时间轴只显示项目快照，所有写操作通过回调交给 EditorPage 的命令适配器。 */
export function Timeline({
  project,
  selectedClipId,
  currentFrame = 0,
  pixelsPerFrame = 6,
  onSelectClip,
  onMoveClip,
  onResizeClip,
  onDeleteClip,
  onSeekFrame,
}: TimelineProps) {
  const duration = clipEnd(project);
  const timelineWidth = duration * pixelsPerFrame;
  const rulerMarks = useMemo(
    () => Array.from({ length: Math.ceil(duration / project.settings.fps) + 1 }, (_, index) => index),
    [duration, project.settings.fps],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" || !selectedClipId || !onDeleteClip) return;
      const video = project.videoClips.find((clip) => clip.id === selectedClipId);
      const effect = project.effectClips.find((clip) => clip.id === selectedClipId);
      if (video) onDeleteClip(video.id, "video");
      if (effect) onDeleteClip(effect.id, "effect");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onDeleteClip, project.effectClips, project.videoClips, selectedClipId]);

  const select = (clipId: string) => onSelectClip?.(clipId);
  const move = (clipId: string, kind: ClipKind, fromFrame: number) =>
    onMoveClip?.(clipId, kind, fromFrame);
  const resize = (
    clipId: string,
    kind: ClipKind,
    fromFrame: number,
    durationInFrames: number,
  ) => onResizeClip?.(clipId, kind, fromFrame, durationInFrames);

  return (
    <section aria-label="时间轴" className="timeline-panel">
      <div className="timeline-panel__header">
        <div>
          <span className="eyebrow">编辑轨道</span>
          <h2>时间轴</h2>
        </div>
        <span className="timeline-panel__time">{(currentFrame / project.settings.fps).toFixed(2)} 秒</span>
      </div>
      <div className="timeline-scroll">
        <div className="timeline" style={{ width: timelineWidth }}>
          <div
            aria-label="时间标尺"
            className="timeline-ruler"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              onSeekFrame?.(Math.max(0, Math.min(duration, pixelsToFrames(event.clientX - rect.left, pixelsPerFrame))));
            }}
          >
            {rulerMarks.map((second) => (
              <span className="timeline-ruler__mark" key={second} style={{ left: second * project.settings.fps * pixelsPerFrame }}>
                <b>{second}s</b>
              </span>
            ))}
          </div>
          <div className="timeline-track">
            <div className="timeline-track__label">主视频轨道</div>
            <div className="timeline-track__content">
              {project.videoClips.map((clip) => (
                <TimelineClip
                  clip={clip}
                  durationInFrames={clip.durationInFrames}
                  fromFrame={clip.fromFrame}
                  key={clip.id}
                  kind="video"
                  label={clipLabel(clip, "video")}
                  onMove={(clipId, fromFrame) => move(clipId, "video", fromFrame)}
                  onResize={(clipId, fromFrame, durationInFrames) => resize(clipId, "video", fromFrame, durationInFrames)}
                  onSelect={select}
                  pixelsPerFrame={pixelsPerFrame}
                  selected={selectedClipId === clip.id}
                />
              ))}
              {project.videoClips.length === 0 && <span className="timeline-empty">从左侧导入视频素材</span>}
            </div>
          </div>
          <div className="timeline-track">
            <div className="timeline-track__label">特效轨道</div>
            <div className="timeline-track__content">
              {project.effectClips.map((clip) => (
                <TimelineClip
                  clip={clip}
                  durationInFrames={clip.durationInFrames}
                  fromFrame={clip.fromFrame}
                  key={clip.id}
                  kind="effect"
                  label={clipLabel(clip, "effect")}
                  onMove={(clipId, fromFrame) => move(clipId, "effect", fromFrame)}
                  onResize={(clipId, fromFrame, durationInFrames) => resize(clipId, "effect", fromFrame, durationInFrames)}
                  onSelect={select}
                  pixelsPerFrame={pixelsPerFrame}
                  selected={selectedClipId === clip.id}
                />
              ))}
              {project.effectClips.length === 0 && <span className="timeline-empty">点击模板库中的“添加”放入特效</span>}
            </div>
          </div>
          <span className="timeline-playhead" style={{ left: currentFrame * pixelsPerFrame }} />
        </div>
      </div>
    </section>
  );
}
