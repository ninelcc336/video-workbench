import { useEffect, useRef } from "react";
import type { EditProject, EffectClip } from "../../domain/project/model";
import { getEffectFamily } from "../../domain/templates/effect-family";
import { normalizeParameterValuesWithDiagnostics } from "../../domain/templates/parameter-schema";

type CanvasPoint = { x: number; y: number };
type CanvasSize = { width: number; height: number };
type ResizeHandle = "nw" | "ne" | "sw" | "se";

type DragState = {
  clipId: string;
  mode: "move" | ResizeHandle;
  startX: number;
  startY: number;
  startPosition: CanvasPoint;
  startSize: CanvasSize;
  canvasRect: DOMRect;
  hasStarted: boolean;
  currentPosition?: CanvasPoint;
  currentResizeValues?: { position: CanvasPoint; size: CanvasSize };
};

export type CanvasSelectionProps = {
  project: EditProject;
  selectedClip: EffectClip | null;
  /** 中文注释：由 PreviewCanvas 传入当前帧下的统一生效状态，未生效时不显示交互选区。 */
  isSelectedClipActive: boolean;
  /** 中文注释：参数快照可由预览和属性面板共同传入，确保两处显示完全一致。 */
  paramsSnapshot?: Record<string, unknown>;
  /** 中文注释：拖动期间只报告临时参数，由页面层生成过程预览项目。 */
  onPreviewParams?: (clipId: string, params: Record<string, unknown>) => void;
  /** 中文注释：手势结束时清除临时项目，即使最终没有产生正式参数变化。 */
  onPreviewEnd?: () => void;
  onChangeParams?: (clipId: string, params: Record<string, unknown>) => void;
};

const MIN_SIZE = 0.05;

/** 中文注释：点击和拖动共用同一个阈值，避免不同预览入口产生不一致的手势体验。 */
export const CANVAS_DRAG_THRESHOLD = 4;

function roundUnit(value: number): number {
  // 中文注释：鼠标换算会产生浮点尾差，参数保存前统一到百万分之一。
  return Math.round(value * 1_000_000) / 1_000_000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isPoint(value: unknown): value is CanvasPoint {
  return typeof value === "object" && value !== null &&
    typeof (value as CanvasPoint).x === "number" &&
    typeof (value as CanvasPoint).y === "number";
}

function isSize(value: unknown): value is CanvasSize {
  return typeof value === "object" && value !== null &&
    typeof (value as CanvasSize).width === "number" &&
    typeof (value as CanvasSize).height === "number";
}

/** 中文注释：统一读取特效片段的画布边界，预览命中层和已选选区必须使用同一套参数换算。 */
export function getPositionAndSize(
  clip: EffectClip,
  paramsSnapshot?: Record<string, unknown>,
): { position: CanvasPoint; size: CanvasSize } | null {
  try {
    const family = getEffectFamily(clip.effectFamilyId, clip.templateVersion);
    const params = normalizeParameterValuesWithDiagnostics(family.parameters, paramsSnapshot ?? clip.params).values;
    if (!isPoint(params.position) || !isSize(params.size)) return null;
    return {
      position: {
        x: clamp(params.position.x, 0, 1),
        y: clamp(params.position.y, 0, 1),
      },
      size: {
        width: clamp(params.size.width, MIN_SIZE, 1),
        height: clamp(params.size.height, MIN_SIZE, 1),
      },
    };
  } catch {
    return null;
  }
}

function getResizeValues(
  state: DragState,
  event: MouseEvent,
): { position: CanvasPoint; size: CanvasSize } {
  const deltaX = (event.clientX - state.startX) / Math.max(1, state.canvasRect.width);
  const deltaY = (event.clientY - state.startY) / Math.max(1, state.canvasRect.height);
  const left = state.startPosition.x - state.startSize.width / 2;
  const right = state.startPosition.x + state.startSize.width / 2;
  const top = state.startPosition.y - state.startSize.height / 2;
  const bottom = state.startPosition.y + state.startSize.height / 2;

  let nextLeft = left;
  let nextRight = right;
  let nextTop = top;
  let nextBottom = bottom;

  if (state.mode.includes("w")) {
    nextLeft = clamp(left + deltaX, 0, right - MIN_SIZE);
  } else if (state.mode.includes("e")) {
    nextRight = clamp(right + deltaX, left + MIN_SIZE, 1);
  }
  if (state.mode.includes("n")) {
    nextTop = clamp(top + deltaY, 0, bottom - MIN_SIZE);
  } else if (state.mode.includes("s")) {
    nextBottom = clamp(bottom + deltaY, top + MIN_SIZE, 1);
  }

  const width = clamp(nextRight - nextLeft, MIN_SIZE, 1);
  const height = clamp(nextBottom - nextTop, MIN_SIZE, 1);
  return {
    position: {
      x: roundUnit(clamp(nextLeft + width / 2, width / 2, 1 - width / 2)),
      y: roundUnit(clamp(nextTop + height / 2, height / 2, 1 - height / 2)),
    },
    size: { width: roundUnit(width), height: roundUnit(height) },
  };
}

/** 中文注释：画布只产生位置和尺寸参数，实际修改由上层 EditorStore 命令完成。 */
export function CanvasSelection({
  project,
  selectedClip,
  isSelectedClipActive,
  paramsSnapshot,
  onPreviewParams,
  onPreviewEnd,
  onChangeParams,
}: CanvasSelectionProps) {
  const dragRef = useRef<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const values = selectedClip ? getPositionAndSize(selectedClip, paramsSnapshot) : null;

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (!isSelectedClipActive) {
        // 中文注释：播放头离开生效区间时取消未完成手势，避免隐藏选区后仍提交参数。
        dragRef.current = null;
        onPreviewEnd?.();
        return;
      }

      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      if (!drag.hasStarted && Math.hypot(deltaX, deltaY) <= CANVAS_DRAG_THRESHOLD) return;
      const startedDrag = { ...drag, hasStarted: true };

      if (drag.mode === "move") {
        const nextPosition = {
          x: roundUnit(clamp(
            drag.startPosition.x + deltaX / Math.max(1, drag.canvasRect.width),
            drag.startSize.width / 2,
            1 - drag.startSize.width / 2,
          )),
          y: roundUnit(clamp(
            drag.startPosition.y + deltaY / Math.max(1, drag.canvasRect.height),
            drag.startSize.height / 2,
            1 - drag.startSize.height / 2,
          )),
        };
        dragRef.current = { ...startedDrag, currentPosition: nextPosition };
        // 中文注释：移动期间只发出临时位置，让页面层驱动过程预览而不写入历史。
        onPreviewParams?.(drag.clipId, { position: nextPosition });
        return;
      }

      const next = getResizeValues(drag, event);
      dragRef.current = { ...startedDrag, currentResizeValues: next };
      // 中文注释：缩放期间同时报告位置和尺寸，保证选框、画面和属性面板保持同一快照。
      onPreviewParams?.(drag.clipId, next);
    };

    const handleMouseUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      if (!isSelectedClipActive) {
        // 中文注释：非生效帧只允许结束临时状态，不允许把不可见期间的鼠标变化写入项目。
        onPreviewEnd?.();
        return;
      }
      if (!drag.hasStarted) {
        // 中文注释：没有越过拖动阈值的鼠标手势只代表选择，不应提交或制造过程预览历史。
        onPreviewEnd?.();
        return;
      }

      if (drag.mode === "move") {
        const nextPosition = drag.currentPosition ?? drag.startPosition;
        if (nextPosition.x !== drag.startPosition.x || nextPosition.y !== drag.startPosition.y) {
          onChangeParams?.(drag.clipId, { position: nextPosition });
        }
      } else {
        const next = drag.currentResizeValues ?? { position: drag.startPosition, size: drag.startSize };
        const changed = next.position.x !== drag.startPosition.x
          || next.position.y !== drag.startPosition.y
          || next.size.width !== drag.startSize.width
          || next.size.height !== drag.startSize.height;
        if (changed) onChangeParams?.(drag.clipId, next);
      }
      onPreviewEnd?.();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isSelectedClipActive, onChangeParams, onPreviewEnd, onPreviewParams]);

  useEffect(() => {
    if (isSelectedClipActive || !dragRef.current) return;
    // 中文注释：生效状态切换为 false 时立即丢弃旧手势，防止选区恢复后沿用过期鼠标基准。
    dragRef.current = null;
    onPreviewEnd?.();
  }, [isSelectedClipActive, onPreviewEnd]);

  if (!selectedClip || !values || !isSelectedClipActive) return null;

  const startDrag = (mode: DragState["mode"], event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    dragRef.current = {
      clipId: selectedClip.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: values.position,
      startSize: values.size,
      canvasRect: canvas.getBoundingClientRect(),
      hasStarted: false,
    };
  };

  return (
    <div
      aria-label="特效选区"
      className="canvas-selection-layer"
      onMouseDown={(event) => startDrag("move", event)}
      ref={canvasRef}
      role="group"
    >
      <div
        aria-label="拖动特效位置"
        className="canvas-selection"
        onMouseDown={(event) => startDrag("move", event)}
        role="presentation"
        style={{
          left: `${values.position.x * 100}%`,
          top: `${values.position.y * 100}%`,
          width: `${values.size.width * 100}%`,
          height: `${values.size.height * 100}%`,
        }}
      >
        {(Object.keys({ nw: true, ne: true, sw: true, se: true }) as ResizeHandle[]).map((handle) => (
          <button
            aria-label={`调整特效${handle === "nw" ? "左上" : handle === "ne" ? "右上" : handle === "sw" ? "左下" : "右下"}角大小`}
            className={`canvas-selection__handle canvas-selection__handle--${handle}`}
            key={handle}
            onMouseDown={(event) => startDrag(handle, event)}
            type="button"
          />
        ))}
      </div>
    </div>
  );
}
