import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, ReactNode } from "react";
import {
  clampEditorPanelWidths,
  DEFAULT_EDITOR_PANEL_WIDTHS,
  resizeEditorPanel,
  type EditorPanelResizeSide,
  type EditorPanelWidths,
} from "./editor-layout";

export type EditorPanelLayoutProps = {
  children: ReactNode;
};

type PanelResizeGesture = {
  side: EditorPanelResizeSide;
  startX: number;
  startWidths: EditorPanelWidths;
  containerWidth: number;
  pointerId: number;
};

/** 中文注释：只比较布局宽度，避免 ResizeObserver 在尺寸未变化时反复触发渲染。 */
function arePanelWidthsEqual(left: EditorPanelWidths, right: EditorPanelWidths): boolean {
  return left.left === right.left && left.right === right.right;
}

/** 中文注释：管理三栏显示宽度和边框拖拽，不把布局状态写入编辑项目或编辑器历史。 */
export function EditorPanelLayout({ children }: EditorPanelLayoutProps) {
  const [panelWidths, setPanelWidths] = useState<EditorPanelWidths>(DEFAULT_EDITOR_PANEL_WIDTHS);
  const [isResizing, setIsResizing] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<PanelResizeGesture | null>(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    // 中文注释：窗口或主区域变化时只收紧当前会话布局，不把显示尺寸写入编辑项目。
    const syncPanelWidths = () => {
      const width = grid.getBoundingClientRect().width;
      if (width <= 0) return;
      setPanelWidths((current) => {
        const next = clampEditorPanelWidths(current, width);
        return arePanelWidthsEqual(current, next) ? current : next;
      });
    };

    syncPanelWidths();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(syncPanelWidths);
      observer.observe(grid);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", syncPanelWidths);
    return () => window.removeEventListener("resize", syncPanelWidths);
  }, []);

  useEffect(() => {
    // 中文注释：边框拖拽监听窗口指针事件，避免指针离开窄命中区域后丢失布局更新。
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      const gesture = resizeRef.current;
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      setPanelWidths(resizeEditorPanel(
        gesture.startWidths,
        gesture.side,
        event.clientX - gesture.startX,
        gesture.containerWidth,
      ));
    };

    const stopResize = (event: globalThis.PointerEvent) => {
      const gesture = resizeRef.current;
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      resizeRef.current = null;
      setIsResizing(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };
  }, []);

  /** 中文注释：开始调整某一侧面板的宽度，另一侧和编辑项目状态保持不变。 */
  const startResize = (side: EditorPanelResizeSide, event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const grid = gridRef.current;
    if (!grid) return;
    const containerWidth = grid.getBoundingClientRect().width;
    if (containerWidth <= 0) return;
    const startWidths = clampEditorPanelWidths(panelWidths, containerWidth);
    resizeRef.current = {
      side,
      startX: event.clientX,
      startWidths,
      containerWidth,
      pointerId: event.pointerId,
    };
    setPanelWidths(startWidths);
    setIsResizing(true);
    event.preventDefault();
    event.stopPropagation();
  };

  const gridStyle = {
    "--editor-left-panel-width": `${panelWidths.left}px`,
    "--editor-right-panel-width": `${panelWidths.right}px`,
  } as CSSProperties;

  return (
    <div className={`editor-main-grid${isResizing ? " editor-main-grid--resizing" : ""}`} ref={gridRef} style={gridStyle}>
      {children}
      <div aria-label="调整素材库宽度" className="editor-panel-resize-handle editor-panel-resize-handle--left" onPointerDown={(event) => startResize("left", event)} role="separator" />
      <div aria-label="调整特效参数面板宽度" className="editor-panel-resize-handle editor-panel-resize-handle--right" onPointerDown={(event) => startResize("right", event)} role="separator" />
    </div>
  );
}
