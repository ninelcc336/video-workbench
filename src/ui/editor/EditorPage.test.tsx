// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorStore } from "../../domain/editor/editor-store";
import { createEmptyProject } from "../../domain/project/factories";
import { EditorPage } from "./EditorPage";

const importMediaFile = vi.hoisted(() => vi.fn());

vi.mock("./media-import", () => ({ importMediaFile }));
vi.mock("./PreviewCanvas", () => ({
  // 中文注释：本用例只验证页面导入事件到编辑器快照的桥接，不依赖 Remotion 的浏览器运行时。
  PreviewCanvas: () => <div data-testid="preview-canvas" />,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
});
