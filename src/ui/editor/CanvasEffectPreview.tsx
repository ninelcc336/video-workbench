import { useEffect, useRef } from "react";
import type { EditProject, EffectClip } from "../../domain/project/model";
import { getTemplate } from "../../domain/templates/registry";
import { CANVAS_DRAG_THRESHOLD, getPositionAndSize } from "./CanvasSelection";
import { isEffectClipActive } from "./effect-visibility";

export type CanvasEffectPreviewProps = {
  project: EditProject;
  currentFrame: number;
  onSelectClip?: (clipId: string | null) => void;
  onPreviewParams?: (clipId: string, params: Record<string, unknown>) => void;
  onPreviewEnd?: () => void;
  onChangeParams?: (clipId: string, params: Record<string, unknown>) => void;
};

type DragState = {
  clipId: string;
  startX: number;
  startY: number;
  startPosition: { x: number; y: number };
  canvasRect: DOMRect;
  hasStarted: boolean;
  currentPosition?: { x: number; y: number };
};

/** 中文注释：统一收紧预览拖动的位置，保证特效边界不会越过项目画布。 */
function clampPosition(
  position: { x: number; y: number },
  size: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: Math.max(size.width / 2, Math.min(1 - size.width / 2, position.x)),
    y: Math.max(size.height / 2, Math.min(1 - size.height / 2, position.y)),
  };
}

/** 中文注释：鼠标换算产生的浮点尾差统一收敛，避免过程预览和正式参数出现微小不一致。 */
function roundPosition(position: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.round(position.x * 1_000_000) / 1_000_000,
    y: Math.round(position.y * 1_000_000) / 1_000_000,
  };
}

/** 中文注释：模板缺失时仍保留预览命中层的稳定渲染，避免一个异常片段阻断其他特效选择。 */
function getClipLabel(clip: EffectClip): string {
  try {
    return getTemplate(clip.templateId, clip.templateVersion).name;
  } catch {
    return "未知特效";
  }
}

/** 中文注释：实时预览直接选择层只负责命中当前画面中的特效，不替代已选特效的编辑选区。 */
export function CanvasEffectPreview({
  project,
  currentFrame,
  onSelectClip,
  onPreviewParams,
  onPreviewEnd,
  onChangeParams,
}: CanvasEffectPreviewProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const activeClips = project.effectClips.filter((clip) => isEffectClipActive(clip, currentFrame, project));

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      if (!drag.hasStarted && Math.hypot(deltaX, deltaY) <= CANVAS_DRAG_THRESHOLD) return;

      const clip = project.effectClips.find((candidate) => candidate.id === drag.clipId);
      if (!clip || !isEffectClipActive(clip, currentFrame, project)) {
        // 中文注释：播放头离开生效区间时立即结束直接预览手势，避免继续修改不可见特效。
        dragRef.current = null;
        onPreviewEnd?.();
        return;
      }
      const values = getPositionAndSize(clip);
      if (!values) return;

      const nextPosition = roundPosition(clampPosition({
        x: drag.startPosition.x + deltaX / Math.max(1, drag.canvasRect.width),
        y: drag.startPosition.y + deltaY / Math.max(1, drag.canvasRect.height),
      }, values.size));
      dragRef.current = { ...drag, currentPosition: nextPosition, hasStarted: true };
      // 中文注释：移动期间只更新临时参数，让页面层继续驱动过程预览而不写入历史。
      onPreviewParams?.(drag.clipId, { position: nextPosition });
    };

    const handleMouseUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      if (!drag.hasStarted || !drag.currentPosition) return;

      const nextPosition = drag.currentPosition;
      if (
        nextPosition.x !== drag.startPosition.x
        || nextPosition.y !== drag.startPosition.y
      ) {
        // 中文注释：手势结束时只提交最终位置，保证一次预览拖动对应一条编辑历史。
        onChangeParams?.(drag.clipId, { position: nextPosition });
      }
      onPreviewEnd?.();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [currentFrame, onChangeParams, onPreviewEnd, onPreviewParams, project.effectClips]);

  /** 中文注释：预览空白只负责清除当前选择，不参与特效片段的位置计算。 */
  const handleBlankMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    onSelectClip?.(null);
  };

  /** 中文注释：命中特效时先同步选择，再记录同一手势的拖动基准，支持直接从画面开始移动。 */
  const handleClipMouseDown = (clip: EffectClip, event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectClip?.(clip.id);
    const values = getPositionAndSize(clip);
    const canvas = canvasRef.current;
    if (!values || !canvas) return;
    dragRef.current = {
      canvasRect: canvas.getBoundingClientRect(),
      clipId: clip.id,
      hasStarted: false,
      startPosition: values.position,
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  return (
    <div
      aria-label="取消特效选择"
      className="canvas-effect-preview"
      onMouseDown={handleBlankMouseDown}
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "auto",
        // 中文注释：命中层高于选区主体，重叠时仍能按画面层级命中上层特效。
        zIndex: 5,
      }}
    >
      {activeClips.map((clip, index) => {
        const values = getPositionAndSize(clip);
        if (!values) return null;
        const templateName = getClipLabel(clip);
        return (
          <button
            aria-label={`选择特效：${templateName}`}
            className="canvas-effect-preview__target"
            key={clip.id}
            onMouseDown={(event) => handleClipMouseDown(clip, event)}
            onClick={(event) => {
              // 中文注释：鼠标按下已完成选择，额外处理 detail 为 0 的键盘激活，避免鼠标重复触发。
              if (event.detail === 0) onSelectClip?.(clip.id);
            }}
            style={{
              position: "absolute",
              left: `${values.position.x * 100}%`,
              top: `${values.position.y * 100}%`,
              width: `${values.size.width * 100}%`,
              height: `${values.size.height * 100}%`,
              transform: "translate(-50%, -50%)",
              background: "transparent",
              border: 0,
              cursor: "move",
              padding: 0,
              zIndex: index + 1,
            }}
            type="button"
          />
        );
      })}
    </div>
  );
}
