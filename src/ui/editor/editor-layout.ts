export type EditorPanelWidths = {
  left: number;
  right: number;
};

export type EditorPanelResizeSide = "left" | "right";

export const DEFAULT_EDITOR_PANEL_WIDTHS: EditorPanelWidths = { left: 280, right: 288 };
export const MIN_EDITOR_LEFT_PANEL_WIDTH = 220;
export const MIN_EDITOR_RIGHT_PANEL_WIDTH = 230;
export const MIN_EDITOR_PREVIEW_RATIO = 0.4;
// 中文注释：两侧最小宽度合计 450px，结合预览 40% 下限，三栏布局至少需要 750px。
export const MIN_EDITOR_LAYOUT_WIDTH = 750;

/** 中文注释：把窗口宽度转换为两侧面板可共同占用的最大宽度，预留至少 40% 给实时预览。 */
function getMaxPanelTotalWidth(containerWidth: number): number {
  const measuredWidth = Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : 0;
  const safeContainerWidth = Math.max(MIN_EDITOR_LAYOUT_WIDTH, measuredWidth);
  return Math.max(
    MIN_EDITOR_LEFT_PANEL_WIDTH + MIN_EDITOR_RIGHT_PANEL_WIDTH,
    safeContainerWidth * (1 - MIN_EDITOR_PREVIEW_RATIO),
  );
}

/** 中文注释：将当前会话宽度限制在两侧面板最小值内，并按比例收紧超出预览下限的部分。 */
export function clampEditorPanelWidths(
  widths: EditorPanelWidths,
  containerWidth: number,
): EditorPanelWidths {
  const minLeft = MIN_EDITOR_LEFT_PANEL_WIDTH;
  const minRight = MIN_EDITOR_RIGHT_PANEL_WIDTH;
  const left = Math.max(minLeft, Number.isFinite(widths.left) ? widths.left : minLeft);
  const right = Math.max(minRight, Number.isFinite(widths.right) ? widths.right : minRight);
  const maxPanelTotal = getMaxPanelTotalWidth(containerWidth);
  const extraBudget = Math.max(0, maxPanelTotal - minLeft - minRight);
  const leftExtra = Math.max(0, left - minLeft);
  const rightExtra = Math.max(0, right - minRight);
  const requestedExtra = leftExtra + rightExtra;

  if (requestedExtra <= extraBudget) {
    return { left: Math.round(left), right: Math.round(right) };
  }

  const scale = requestedExtra === 0 ? 0 : extraBudget / requestedExtra;
  return {
    left: Math.round(minLeft + leftExtra * scale),
    right: Math.round(minRight + rightExtra * scale),
  };
}

/** 中文注释：根据单个边框的鼠标位移计算新宽度，另一侧面板保持不变。 */
export function resizeEditorPanel(
  widths: EditorPanelWidths,
  side: EditorPanelResizeSide,
  deltaX: number,
  containerWidth: number,
): EditorPanelWidths {
  const currentLeft = Math.max(MIN_EDITOR_LEFT_PANEL_WIDTH, widths.left);
  const currentRight = Math.max(MIN_EDITOR_RIGHT_PANEL_WIDTH, widths.right);
  const maxPanelTotal = getMaxPanelTotalWidth(containerWidth);

  if (side === "left") {
    const maxLeft = Math.max(MIN_EDITOR_LEFT_PANEL_WIDTH, maxPanelTotal - currentRight);
    return {
      left: Math.round(Math.max(MIN_EDITOR_LEFT_PANEL_WIDTH, Math.min(maxLeft, currentLeft + deltaX))),
      right: Math.round(currentRight),
    };
  }

  const maxRight = Math.max(MIN_EDITOR_RIGHT_PANEL_WIDTH, maxPanelTotal - currentLeft);
  return {
    left: Math.round(currentLeft),
    right: Math.round(Math.max(MIN_EDITOR_RIGHT_PANEL_WIDTH, Math.min(maxRight, currentRight - deltaX))),
  };
}
