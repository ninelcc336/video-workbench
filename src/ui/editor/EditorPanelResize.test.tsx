// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorStore } from "../../domain/editor/editor-store";
import { createEmptyProject } from "../../domain/project/factories";
import { EditorPage } from "./EditorPage";

vi.mock("./PreviewCanvas", () => ({
  // 中文注释：布局测试不依赖 Remotion，只观察编辑器页面公开的边框拖拽入口。
  PreviewCanvas: () => <div data-testid="preview-canvas" />,
}));
vi.mock("./Timeline", () => ({
  // 中文注释：布局测试不触发时间轴行为，使用空壳保持页面结构完整。
  Timeline: () => <div data-testid="timeline" />,
}));

afterEach(cleanup);

/** 中文注释：提供稳定的主区域尺寸，让 jsdom 中的拖拽计算拥有独立于浏览器布局的输入。 */
function setEditorGridRect(element: HTMLElement): void {
  element.getBoundingClientRect = () => ({
    bottom: 900,
    height: 800,
    left: 0,
    right: 1200,
    top: 100,
    width: 1200,
    x: 0,
    y: 100,
    toJSON: () => ({}),
  });
}

describe("编辑器左右边框布局调整", () => {
  it("通过两个面板边框独立调整当前会话布局且不触发项目保存", () => {
    const store = createEditorStore(createEmptyProject());
    const onSaveProject = vi.fn().mockResolvedValue(undefined);
    const { container, unmount } = render(<EditorPage onSaveProject={onSaveProject} store={store} />);
    const grid = container.querySelector(".editor-main-grid") as HTMLDivElement;
    setEditorGridRect(grid);

    expect(grid.style.getPropertyValue("--editor-left-panel-width")).toBe("280px");
    expect(grid.style.getPropertyValue("--editor-right-panel-width")).toBe("288px");

    fireEvent.pointerDown(screen.getByRole("separator", { name: "调整素材库宽度" }), { button: 0, clientX: 280, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 380, pointerId: 1 });
    expect(grid.style.getPropertyValue("--editor-left-panel-width")).toBe("380px");
    expect(grid.style.getPropertyValue("--editor-right-panel-width")).toBe("288px");
    fireEvent.pointerUp(window, { pointerId: 1 });

    fireEvent.pointerDown(screen.getByRole("separator", { name: "调整特效参数面板宽度" }), { button: 0, clientX: 912, pointerId: 2 });
    fireEvent.pointerMove(window, { clientX: 1012, pointerId: 2 });
    expect(grid.style.getPropertyValue("--editor-left-panel-width")).toBe("380px");
    expect(grid.style.getPropertyValue("--editor-right-panel-width")).toBe("230px");
    expect(store.getSnapshot()).toEqual(createEmptyProject());
    expect(onSaveProject).not.toHaveBeenCalled();

    // 中文注释：布局只存在于页面会话，重新挂载编辑器后应恢复默认宽度。
    unmount();
    const nextRender = render(<EditorPage store={store} />);
    const nextGrid = nextRender.container.querySelector(".editor-main-grid") as HTMLDivElement;
    expect(nextGrid.style.getPropertyValue("--editor-left-panel-width")).toBe("280px");
    expect(nextGrid.style.getPropertyValue("--editor-right-panel-width")).toBe("288px");
  });
});
