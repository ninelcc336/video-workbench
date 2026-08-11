import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import type { EditProject, EffectClip, VideoClip } from "../../domain/project/model";
import { getTemplate } from "../../domain/templates/registry";
import {
  findTemplateTransitionBoundary,
  getDropFrame,
  readTemplateDragData,
  type TemplateTransitionBoundary,
} from "./drag-and-drop";
import { layoutEffectTracks } from "./effect-track-layout";
import { TimelineClip, type TimelineClipKind } from "./TimelineClip";
import type { TemplateDefinition } from "../../domain/templates/types";
import { normalizeVideoRange, type VideoRangeMode } from "../../domain/editor/clip-ranges";

export type ClipKind = TimelineClipKind;

/** 中文注释：轨道名称列的宽度必须与标尺左侧占位保持一致，保证零点视觉对齐。 */
export const TIMELINE_LABEL_WIDTH = 105;

/** 中文注释：时间轴拖拽高度的常规最小值，窄视口会在边界计算中自动收缩。 */
export const TIMELINE_MIN_HEIGHT = 160;

/** 中文注释：时间轴高度上限固定为视口的一半，避免挤压预览工作区。 */
export function getTimelineHeightBounds(viewportHeight: number): { min: number; max: number } {
  const safeViewportHeight = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 720;
  const max = Math.max(1, Math.floor(safeViewportHeight * 0.5));
  return { min: Math.min(TIMELINE_MIN_HEIGHT, max), max };
}

/** 中文注释：统一限制拖拽或窗口缩放带来的时间轴高度，避免出现负值和超过半屏的情况。 */
export function clampTimelineHeight(height: number, viewportHeight: number): number {
  const { min, max } = getTimelineHeightBounds(viewportHeight);
  const safeHeight = Number.isFinite(height) ? height : min;
  return Math.round(Math.max(min, Math.min(max, safeHeight)));
}

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
  onDropTemplate?: (template: TemplateDefinition, frame: number) => void;
  onDropTransition?: (template: TemplateDefinition, boundary: TemplateTransitionBoundary) => void;
  onInvalidTemplateDrop?: (message: string) => void;
  onPreviewProject?: (project: EditProject | null) => void;
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
  onDropTemplate,
  onDropTransition,
  onInvalidTemplateDrop,
  onPreviewProject,
}: TimelineProps) {
  const [previewProject, setPreviewProject] = useState<EditProject | null>(null);
  const previewProjectRef = useRef<EditProject | null>(null);
  const timelineProject = previewProject ?? project;
  const duration = clipEnd(timelineProject);
  // 中文注释：时间轴总宽度包含左侧轨道名称列，轨道内容区才能从 0 帧开始完整铺开。
  const timelineWidth = TIMELINE_LABEL_WIDTH + duration * pixelsPerFrame;
  const viewportHeight = typeof window === "undefined" ? 720 : window.innerHeight;
  const [timelineHeight, setTimelineHeight] = useState(() =>
    clampTimelineHeight(238, viewportHeight),
  );
  const [isResizing, setIsResizing] = useState(false);
  const resizeStart = useRef<{ clientY: number; height: number } | null>(null);
  const effectTracks = useMemo(
    () => {
      const committedTracks = layoutEffectTracks(project.effectClips);
      if (!previewProject) return committedTracks;
      const previewClips = new Map(timelineProject.effectClips.map((clip) => [clip.id, clip]));
      // 中文注释：拖动期间固定原特效轨道，避免片段临时跨轨道重排导致鼠标手势组件卸载。
      return committedTracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => previewClips.get(clip.id) ?? clip),
      }));
    },
    [previewProject, project.effectClips, timelineProject.effectClips],
  );
  const visibleEffectTracks = effectTracks.length > 0
    ? effectTracks
    : [{ id: "effects-1", clips: [] }];
  const rulerMarks = useMemo(
    () => Array.from({ length: Math.ceil(duration / timelineProject.settings.fps) + 1 }, (_, index) => index),
    [duration, timelineProject.settings.fps],
  );
  const [isSeeking, setIsSeeking] = useState(false);
  const seekTargetRef = useRef<HTMLElement | null>(null);

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

  useEffect(() => {
    const handleViewportResize = () => {
      setTimelineHeight((height) => clampTimelineHeight(height, window.innerHeight));
    };
    window.addEventListener("resize", handleViewportResize);
    return () => window.removeEventListener("resize", handleViewportResize);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handlePointerMove = (event: PointerEvent) => {
      const start = resizeStart.current;
      if (!start) return;
      // 中文注释：拖动上边缘时，指针向上移动应增加面板高度。
      setTimelineHeight(clampTimelineHeight(start.height - (event.clientY - start.clientY), window.innerHeight));
    };
    const stopResizing = () => {
      resizeStart.current = null;
      setIsResizing(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
    };
  }, [isResizing]);

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizeStart.current = { clientY: event.clientY, height: timelineHeight };
    setIsResizing(true);
  };

  /** 中文注释：将标尺或轨道内的屏幕坐标换算为当前播放帧，拖动期间直接驱动预览。 */
  const seekFromClientX = (clientX: number, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    onSeekFrame?.(Math.max(0, Math.min(duration, pixelsToFrames(clientX - rect.left, pixelsPerFrame))));
  };

  useEffect(() => {
    if (!isSeeking) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (seekTargetRef.current) seekFromClientX(event.clientX, seekTargetRef.current);
    };
    const stopSeeking = () => {
      seekTargetRef.current = null;
      setIsSeeking(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopSeeking);
    window.addEventListener("mouseleave", stopSeeking);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopSeeking);
      window.removeEventListener("mouseleave", stopSeeking);
    };
  }, [duration, isSeeking, onSeekFrame, pixelsPerFrame]);

  const beginSeek = (event: React.MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    seekTargetRef.current = event.currentTarget;
    setIsSeeking(true);
    seekFromClientX(event.clientX, event.currentTarget);
  };

  /** 中文注释：拖动期间基于已提交项目构造临时快照，时间轴和预览可以共享同一结果。 */
  const previewRange = (
    clipId: string,
    kind: ClipKind,
    fromFrame: number,
    durationInFrames: number,
    mode: VideoRangeMode = "move",
  ) => {
    const baseProject = previewProjectRef.current ?? project;
    const clip = kind === "video"
      ? baseProject.videoClips.find((candidate) => candidate.id === clipId)
      : baseProject.effectClips.find((candidate) => candidate.id === clipId);
    if (!clip) return;

    const range = kind === "video"
      ? normalizeVideoRange(baseProject, clipId, fromFrame, durationInFrames, mode)
      : clampClipRange(fromFrame, durationInFrames);
    const nextProject: EditProject = {
      ...baseProject,
      videoClips: kind === "video"
        ? baseProject.videoClips.map((candidate) => candidate.id === clipId ? { ...candidate, ...range } : candidate)
        : baseProject.videoClips.map((candidate) => ({ ...candidate })),
      effectClips: kind === "effect"
        ? baseProject.effectClips.map((candidate) => candidate.id === clipId ? { ...candidate, ...range } : candidate)
        : baseProject.effectClips.map((candidate) => ({ ...candidate, params: { ...candidate.params } })),
    };
    previewProjectRef.current = nextProject;
    setPreviewProject(nextProject);
    onPreviewProject?.(nextProject);
  };

  /** 中文注释：提交或取消手势后清空临时快照，避免临时状态进入下一次编辑。 */
  const clearPreview = () => {
    previewProjectRef.current = null;
    setPreviewProject(null);
    onPreviewProject?.(null);
  };

  const adjustHeightWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const { min, max } = getTimelineHeightBounds(window.innerHeight);
    const step = event.shiftKey ? 48 : 16;
    let nextHeight: number | null = null;
    if (event.key === "ArrowUp") nextHeight = timelineHeight + step;
    if (event.key === "ArrowDown") nextHeight = timelineHeight - step;
    if (event.key === "Home") nextHeight = min;
    if (event.key === "End") nextHeight = max;
    if (nextHeight === null) return;
    event.preventDefault();
    setTimelineHeight(clampTimelineHeight(nextHeight, window.innerHeight));
  };

  const select = (clipId: string) => onSelectClip?.(clipId);
  const move = (clipId: string, kind: ClipKind, fromFrame: number) => {
    const clip = kind === "video"
      ? project.videoClips.find((candidate) => candidate.id === clipId)
      : project.effectClips.find((candidate) => candidate.id === clipId);
    if (!clip) return;
    const nextFromFrame = kind === "video"
      ? normalizeVideoRange(project, clipId, fromFrame, clip.durationInFrames, "move").fromFrame
      : Math.max(0, Math.round(fromFrame));
    onMoveClip?.(clipId, kind, nextFromFrame);
  };
  const resize = (
    clipId: string,
    kind: ClipKind,
    fromFrame: number,
    durationInFrames: number,
    mode: VideoRangeMode = "resize-right",
  ) => {
    const range = kind === "video"
      ? normalizeVideoRange(project, clipId, fromFrame, durationInFrames, mode)
      : clampClipRange(fromFrame, durationInFrames);
    onResizeClip?.(clipId, kind, range.fromFrame, range.durationInFrames);
  };

  const handleTemplateDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!readTemplateDragData(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  /** 中文注释：将模板拖放翻译为范围或交界点命令；无效转场只提示并向拖动源回报失败。 */
  const handleTemplateDrop = (event: DragEvent<HTMLDivElement>) => {
    const dragData = readTemplateDragData(event.dataTransfer);
    if (!dragData) return;
    event.preventDefault();

    try {
      const template = getTemplate(dragData.templateId, dragData.templateVersion, dragData.startingStyleId);
      const frame = getDropFrame(
        { clientX: event.clientX },
        event.currentTarget,
        pixelsPerFrame,
      );
      if (template.category === "transition") {
        const boundary = findTemplateTransitionBoundary(project, frame);
        if (!boundary || !onDropTransition) {
          // 中文注释：向拖动源明确报告非法交界点，避免最近使用把失败的转场拖放误记为成功。
          event.dataTransfer.dropEffect = "none";
          onInvalidTemplateDrop?.("片段转场只能放在相邻视频片段交界点。");
          return;
        }
        onDropTransition(template, boundary);
        return;
      }
      // 中文注释：放置位置由时间轴换算，页面层负责创建片段并写入 EditorStore。
      onDropTemplate?.(template, frame);
    } catch {
      // 中文注释：外部拖放或已失效模板不会破坏时间轴当前项目。
    }
  };

  return (
    <section
      aria-label="时间轴"
      className={`timeline-panel${isResizing ? " timeline-panel--resizing" : ""}`}
      style={{ height: `${timelineHeight}px` }}
    >
      <div
        aria-label="调整时间轴高度"
        aria-orientation="vertical"
        aria-valuemax={getTimelineHeightBounds(viewportHeight).max}
        aria-valuemin={getTimelineHeightBounds(viewportHeight).min}
        aria-valuenow={timelineHeight}
        className="timeline-panel__resize-handle"
        onKeyDown={adjustHeightWithKeyboard}
        onPointerDown={startResize}
        role="slider"
        tabIndex={0}
        title="上下拖动调整时间轴高度"
      />
      <div className="timeline-panel__header">
        <div>
          <span className="eyebrow">编辑轨道</span>
          <h2>时间轴</h2>
        </div>
        <span className="timeline-panel__time">{(currentFrame / project.settings.fps).toFixed(2)} 秒</span>
      </div>
      <div className="timeline-scroll">
        <div className="timeline" style={{ width: timelineWidth }}>
          <div aria-label="时间标尺" className="timeline-ruler">
            <span aria-hidden="true" className="timeline-ruler__gutter" />
            <div
              className="timeline-ruler__scale"
              onMouseDown={beginSeek}
            >
              {rulerMarks.map((second) => (
                <span className="timeline-ruler__mark" key={second} style={{ left: second * timelineProject.settings.fps * pixelsPerFrame }}>
                  <b>{second}s</b>
                </span>
              ))}
            </div>
          </div>
          <div className="timeline-track">
            <div className="timeline-track__label">主视频轨道</div>
            <div className="timeline-track__content" onMouseDown={beginSeek}>
              {timelineProject.videoClips.map((clip) => (
                <TimelineClip
                  clip={clip}
                  durationInFrames={clip.durationInFrames}
                  fromFrame={clip.fromFrame}
                  key={clip.id}
                  kind="video"
                  label={clipLabel(clip, "video")}
                  onMove={(clipId, fromFrame) => move(clipId, "video", fromFrame)}
                  onPreviewMove={(clipId, fromFrame) => previewRange(clipId, "video", fromFrame, clip.durationInFrames, "move")}
                  onPreviewResize={(clipId, fromFrame, durationInFrames, mode) => previewRange(clipId, "video", fromFrame, durationInFrames, mode)}
                  onResize={(clipId, fromFrame, durationInFrames, mode) => resize(clipId, "video", fromFrame, durationInFrames, mode)}
                  onInteractionEnd={clearPreview}
                  onSelect={select}
                  pixelsPerFrame={pixelsPerFrame}
                  selected={selectedClipId === clip.id}
                />
              ))}
                {timelineProject.videoClips.length === 0 && <span className="timeline-empty">从左侧导入视频素材</span>}
            </div>
          </div>
          {visibleEffectTracks.map((track, trackIndex) => (
            <div className="timeline-track" key={track.id}>
              <div className="timeline-track__label">特效轨道 {trackIndex + 1}</div>
              <div
                aria-label={`特效轨道 ${trackIndex + 1}放置区`}
                className="timeline-track__content"
                onDragOver={handleTemplateDragOver}
                onDrop={handleTemplateDrop}
                onMouseDown={beginSeek}
                role="region"
              >
                {track.clips.map((clip) => (
                  <TimelineClip
                    clip={clip}
                    durationInFrames={clip.durationInFrames}
                    fromFrame={clip.fromFrame}
                    key={clip.id}
                    kind="effect"
                    label={clipLabel(clip, "effect")}
                    onMove={(clipId, fromFrame) => move(clipId, "effect", fromFrame)}
                    onPreviewMove={(clipId, fromFrame) => previewRange(clipId, "effect", fromFrame, clip.durationInFrames, "move")}
                    onPreviewResize={(clipId, fromFrame, durationInFrames, mode) => previewRange(clipId, "effect", fromFrame, durationInFrames, mode)}
                    onResize={(clipId, fromFrame, durationInFrames, mode) => resize(clipId, "effect", fromFrame, durationInFrames, mode)}
                    onInteractionEnd={clearPreview}
                    onSelect={select}
                    pixelsPerFrame={pixelsPerFrame}
                    selected={selectedClipId === clip.id}
                  />
                ))}
                {track.clips.length === 0 && <span className="timeline-empty">点击模板库中的“添加”放入特效</span>}
              </div>
            </div>
          ))}
          <span className="timeline-playhead" style={{ left: TIMELINE_LABEL_WIDTH + currentFrame * pixelsPerFrame }} />
        </div>
      </div>
    </section>
  );
}
