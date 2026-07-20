// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorStore } from "../../domain/editor/editor-store";
import { createEmptyProject } from "../../domain/project/factories";
import { EditorPage } from "./EditorPage";

const importMediaFile = vi.hoisted(() => vi.fn());

vi.mock("./media-import", () => ({ importMediaFile }));
vi.mock("./PreviewCanvas", () => ({
  // 中文注释：本用例只验证页面导入事件到编辑器快照的桥接，不依赖 Remotion 的浏览器运行时。
  PreviewCanvas: ({ currentFrame, onSelectClip }: { currentFrame?: number; onSelectClip?: (clipId: string | null) => void }) => (
    <div data-current-frame={currentFrame} data-testid="preview-canvas">
      <button onClick={() => onSelectClip?.("effect-1")} type="button">从预览选择特效</button>
    </div>
  ),
}));
vi.mock("./Timeline", () => ({
  // 中文注释：用定位按钮驱动页面播放头，验证重置操作会同时归零预览状态。
  Timeline: ({ onSeekFrame, onSelectClip, selectedClipId }: { onSeekFrame?: (frame: number) => void; onSelectClip?: (clipId: string) => void; selectedClipId?: string | null }) => (
    <>
      <button onClick={() => onSeekFrame?.(10)} type="button">定位播放头</button>
      <button onClick={() => onSelectClip?.("video-1")} type="button">选择视频片段</button>
      <span data-testid="selected-clip-id">{selectedClipId ?? ""}</span>
    </>
  ),
}));

/** 中文注释：集中构造重置场景的横屏项目，避免多个交互用例复制相同的视频时间轴夹具。 */
function createLandscapeProjectStore() {
  const store = createEditorStore(createEmptyProject({ width: 1920, height: 1080, fps: 30 }));
  store.dispatch({
    type: "add-video-clip",
    clip: { audioEnabled: true, durationInFrames: 30, fromFrame: 0, id: "video-1", mediaId: "media-1", sourceStartFrame: 0 },
  });
  return store;
}

/** 中文注释：构造包含可编辑特效的页面夹具，验证临时项目能同时驱动预览和属性面板。 */
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("编辑项目的素材导入", () => {
  it("首次导入横屏素材时将素材尺寸交给编辑器命令", async () => {
    const store = createEditorStore(createEmptyProject());
    importMediaFile.mockResolvedValue({
      id: "landscape-media",
      height: 1080,
      width: 1920,
    });
    const { container } = render(<EditorPage store={store} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["横屏视频"], "landscape.mp4", { type: "video/mp4" });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(store.getSnapshot().settings).toEqual({ width: 1920, height: 1080, fps: 30 });
    });
    expect(store.getSnapshot().export).toEqual({ format: "mp4", width: 1920, height: 1080, fps: 30 });
    expect(store.getSnapshot().videoClips).toHaveLength(1);
  });

  it("确认重置后清空时间轴、恢复默认画布并将播放头归零", async () => {
    const store = createLandscapeProjectStore();

    render(<EditorPage store={store} />);
    fireEvent.click(screen.getByRole("button", { name: "定位播放头" }));
    expect(screen.getByTestId("preview-canvas").dataset.currentFrame).toBe("10");

    fireEvent.click(screen.getByRole("button", { name: "重置编辑项目" }));
    // 中文注释：危险操作先在页面内显示可访问的确认弹窗，避免原生确认框打断编辑器视觉体验。
    expect(screen.getByRole("alertdialog", { name: "重置此编辑项目？" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认重置" }));

    await waitFor(() => {
      expect(store.getSnapshot()).toEqual(createEmptyProject());
    });
    expect(screen.getByTestId("preview-canvas").dataset.currentFrame).toBe("0");

    // 中文注释：重置属于可撤销的编辑操作，撤销后应同时回到重置前的项目与播放位置。
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    await waitFor(() => {
      expect(store.getSnapshot().videoClips).toHaveLength(1);
    });
    expect(screen.getByTestId("preview-canvas").dataset.currentFrame).toBe("10");

    // 中文注释：重做重置会再次缩短项目时长，播放头应重新收紧到初始帧。
    fireEvent.click(screen.getByRole("button", { name: "重做" }));
    await waitFor(() => {
      expect(store.getSnapshot()).toEqual(createEmptyProject());
      expect(screen.getByTestId("preview-canvas").dataset.currentFrame).toBe("0");
    });
  });

  it("取消重置确认时保留当前项目和播放头", () => {
    const store = createLandscapeProjectStore();

    render(<EditorPage store={store} />);
    // 中文注释：取消确认属于无副作用路径，既不能清空时间轴，也不能改变页面播放头。
    fireEvent.click(screen.getByRole("button", { name: "定位播放头" }));
    fireEvent.click(screen.getByRole("button", { name: "重置编辑项目" }));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(store.getSnapshot().videoClips).toHaveLength(1);
    expect(screen.getByTestId("preview-canvas").dataset.currentFrame).toBe("10");
  });

  it("通过快捷键复制并粘贴视频片段，且一次撤销可以移除副本", async () => {
    const store = createLandscapeProjectStore();

    render(<EditorPage store={store} />);
    fireEvent.click(screen.getByRole("button", { name: "选择视频片段" }));
    fireEvent.keyDown(window, { ctrlKey: true, key: "c" });
    fireEvent.click(screen.getByRole("button", { name: "定位播放头" }));
    fireEvent.keyDown(window, { ctrlKey: true, key: "v" });

    await waitFor(() => expect(store.getSnapshot().videoClips).toHaveLength(2));
    const pasted = store.getSnapshot().videoClips[1];
    expect(pasted.id).not.toBe("video-1");
    expect(pasted.fromFrame).toBe(30);

    fireEvent.keyDown(window, { ctrlKey: true, key: "z" });
    await waitFor(() => expect(store.getSnapshot().videoClips).toHaveLength(1));

    fireEvent.keyDown(window, { ctrlKey: true, key: "y" });
    await waitFor(() => expect(store.getSnapshot().videoClips).toHaveLength(2));
  });

  it("从实时预览选择特效后同步选中特效轨道片段", async () => {
    const store = createEditorStore(createEmptyProject());
    store.dispatch({
      type: "add-effect-clip",
      clip: {
        durationInFrames: 20,
        fromFrame: 0,
        id: "effect-1",
        params: {},
        templateId: "card-overlay",
        templateVersion: 1,
        trackId: "effects-1",
      },
    });

    render(<EditorPage store={store} />);
    fireEvent.click(screen.getByRole("button", { name: "从预览选择特效" }));

    await waitFor(() => expect(screen.getByTestId("selected-clip-id").textContent).toBe("effect-1"));
  });

});
