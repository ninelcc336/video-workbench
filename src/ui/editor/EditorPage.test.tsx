// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorStore } from "../../domain/editor/editor-store";
import type { Preset } from "../../domain/assets/preset-model";
import type { VideoTemplate } from "../../domain/assets/video-template-model";
import { createEmptyProject } from "../../domain/project/factories";
import { ThemeProvider } from "../theme/ThemeProvider";
import { EditorPage } from "./EditorPage";

const importMediaFile = vi.hoisted(() => vi.fn());

vi.mock("./media-import", () => ({ importMediaFile, readVideoDimensions: vi.fn() }));
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

/** 中文注释：为资产流程构造同模板的特效片段，便于验证个人预设不会改变时间轴位置。 */
function createEffectProjectStore() {
  const store = createEditorStore(createEmptyProject());
  store.dispatch({
    type: "add-effect-clip",
    clip: { durationInFrames: 20, fromFrame: 6, id: "effect-1", params: { text: "原始文案" }, templateId: "card-overlay", templateVersion: 1, trackId: "effects-1" },
  });
  return store;
}

/** 中文注释：资产接口夹具按 URL 和请求方法返回稳定响应，避免页面初始化的素材请求干扰断言。 */
function mockAssetApi(presets: Preset[] = [], videoTemplates: VideoTemplate[] = []) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/presets") && method === "GET") return { json: async () => presets, ok: true } as Response;
    if (url.endsWith("/video-templates") && method === "GET") return { json: async () => videoTemplates, ok: true } as Response;
    if (url.endsWith("/media")) return { json: async () => [], ok: true } as Response;
    if (url.endsWith("/presets") && method === "POST") return { json: async () => ({ id: "preset-new", ...(JSON.parse(String(init?.body)) as object) }), ok: true } as Response;
    if (url.endsWith("/video-templates") && method === "POST") return { json: async () => JSON.parse(String(init?.body)), ok: true } as Response;
    if (method === "DELETE") return { json: async () => null, ok: true } as Response;
    return { json: async () => [], ok: true } as Response;
  });
}

/** 中文注释：构造包含可编辑特效的页面夹具，验证临时项目能同时驱动预览和属性面板。 */
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("编辑项目的素材导入", () => {
  // 中文注释：主题属于应用外观状态，切换它不能进入编辑器历史或修改当前时间轴快照。
  it("切换界面主题不改变视频工作区快照", async () => {
    const store = createLandscapeProjectStore();
    const snapshotBeforeThemeChange = store.getSnapshot();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ json: async () => [], ok: true } as Response);

    render(<ThemeProvider><EditorPage store={store} /></ThemeProvider>);
    fireEvent.click(screen.getByRole("button", { name: "切换为浅色主题" }));

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
    expect(store.getSnapshot()).toEqual(snapshotBeforeThemeChange);
  });

  // 中文注释：用两个 Store 模拟从一个工作区切换到另一个工作区的页面生命周期。
  it("切换到新工作区提供的编辑器快照后只重新加载该工作区素材", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);
    const firstStore = createEditorStore(createEmptyProject());
    const secondStore = createEditorStore(createEmptyProject({ width: 1920, height: 1080 }));
    const { rerender } = render(<EditorPage store={firstStore} workspaceId="视频 A" />);

    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/media"))).toHaveLength(1));
    rerender(<EditorPage store={secondStore} workspaceId="视频 B" />);

    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/media"))).toHaveLength(2));
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/media")).map(([url]) => url)).toEqual([
      "/api/workspaces/%E8%A7%86%E9%A2%91%20A/media",
      "/api/workspaces/%E8%A7%86%E9%A2%91%20B/media",
    ]);
  });

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

    render(<EditorPage store={store} workspaceId="横屏视频" />);
    fireEvent.click(screen.getByRole("button", { name: "定位播放头" }));
    expect(screen.getByTestId("preview-canvas").dataset.currentFrame).toBe("10");

    fireEvent.click(screen.getByRole("button", { name: "重置视频工作区" }));
    // 中文注释：危险操作先在页面内显示可访问的确认弹窗，避免原生确认框打断编辑器视觉体验。
    expect(screen.getByRole("alertdialog", { name: "重置此视频工作区？" })).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button", { name: "重置视频工作区" }));
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

  it("保存、套用和删除个人预设时只更新当前特效参数，并使用应用内确认对话框", async () => {
    const preset: Preset = { id: "preset-1", name: "强调版", params: { text: "预设文案" }, templateId: "card-overlay", templateVersion: 1 };
    const store = createEffectProjectStore();
    const fetchMock = mockAssetApi([preset]);

    render(<EditorPage store={store} workspaceId="资产工作区" />);
    fireEvent.click(screen.getByRole("button", { name: "从预览选择特效" }));
    fireEvent.click(screen.getByRole("button", { name: "个人预设" }));
    expect(screen.getByRole("dialog", { name: "保存个人预设" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("预设名称"), { target: { value: "当前参数" } });
    fireEvent.click(screen.getByRole("button", { name: "保存预设" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/presets") && init?.method === "POST")).toBe(true));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "保存个人预设" })).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "个人预设" }));

    fireEvent.click(await screen.findByRole("button", { name: "套用“强调版”" }));
    await waitFor(() => expect(store.getSnapshot().effectClips[0].params).toEqual({ text: "预设文案" }));
    expect(store.getSnapshot().effectClips[0].fromFrame).toBe(6);

    fireEvent.click(screen.getByRole("button", { name: "删除个人预设强调版" }));
    expect(screen.getByRole("alertdialog", { name: "删除“强调版”？" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/presets/preset-1"), { method: "DELETE" }));

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "保存个人预设" })).toBeNull());
  });

  it("保存和套用视频模板时在播放头新增特效片段，不替换当前布局", async () => {
    const template: VideoTemplate = {
      id: "video-template-1",
      name: "片头布局",
      effectClips: [{ durationInFrames: 10, fromFrame: 0, params: { text: "模板文案" }, templateId: "card-overlay", templateVersion: 1, trackId: "effects-1" }],
    };
    const store = createEffectProjectStore();
    const fetchMock = mockAssetApi([], [template]);

    render(<EditorPage store={store} workspaceId="资产工作区" />);
    fireEvent.click(screen.getByRole("button", { name: "定位播放头" }));
    fireEvent.click(screen.getByRole("button", { name: "视频模板" }));
    expect(screen.getByRole("dialog", { name: "保存视频模板" })).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /套用“片头布局”/ }));

    await waitFor(() => expect(store.getSnapshot().effectClips).toHaveLength(2));
    expect(store.getSnapshot().effectClips[0].id).toBe("effect-1");
    expect(store.getSnapshot().effectClips[1].fromFrame).toBe(10);
    expect(store.getSnapshot().effectClips[1].params).toEqual({ text: "模板文案" });

    fireEvent.change(screen.getByLabelText("模板名称"), { target: { value: "当前布局" } });
    fireEvent.click(screen.getByRole("button", { name: "保存模板" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/video-templates") && init?.method === "POST")).toBe(true));
  });

});
