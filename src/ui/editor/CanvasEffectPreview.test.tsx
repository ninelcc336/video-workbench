// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorStore } from "../../domain/editor/editor-store";
import { createEmptyProject } from "../../domain/project/factories";
import type { EditProject, EffectClip } from "../../domain/project/model";
import { getTemplate, getTemplateDefaultParams } from "../../domain/templates/registry";
import { EditorPage } from "./EditorPage";

vi.mock("./PreviewCanvas", () => ({
  /** 中文注释：用公开回调模拟画布手势，验证页面层临时项目的统一显示状态。 */
  PreviewCanvas: ({
    onChangeParams,
    onPreviewEnd,
    onPreviewParams,
    project,
  }: {
    onChangeParams?: (clipId: string, params: Record<string, unknown>) => void;
    onPreviewEnd?: () => void;
    onPreviewParams?: (clipId: string, params: Record<string, unknown>) => void;
    project: EditProject;
  }) => {
    const position = project.effectClips[0]?.params.position as { x: number; y: number } | undefined;
    return (
      <>
        <div data-position={JSON.stringify(position)} data-testid="preview-canvas" />
        <button onClick={() => onPreviewParams?.("effect-1", { position: { x: 0.8, y: 0.7 } })} type="button">预览特效拖动</button>
        <button onClick={() => onChangeParams?.("effect-1", { position: { x: 0.8, y: 0.7 } })} type="button">提交特效拖动</button>
        <button onClick={() => onPreviewEnd?.()} type="button">结束特效预览</button>
      </>
    );
  },
}));

vi.mock("./Timeline", () => ({
  /** 中文注释：通过时间轴公开选择回调选中特效，不依赖真实时间轴布局。 */
  Timeline: ({ onSelectClip }: { onSelectClip?: (clipId: string) => void }) => (
    <button onClick={() => onSelectClip?.("effect-1")} type="button">选择特效片段</button>
  ),
}));

afterEach(cleanup);

/** 中文注释：构造包含位置参数的特效项目，验证临时快照不会直接污染编辑器存储。 */
function createEffectStore() {
  const store = createEditorStore(createEmptyProject());
  const template = getTemplate("card-overlay", 1);
  const clip: EffectClip = {
    id: "effect-1",
    templateId: template.id,
    templateVersion: template.version,
    trackId: "effects-1",
    fromFrame: 0,
    durationInFrames: template.defaultDurationInFrames,
    params: getTemplateDefaultParams(template),
  };
  store.dispatch({ type: "add-effect-clip", clip });
  return store;
}

describe("实时预览中的特效过程预览", () => {
  it("让预览和属性面板读取临时快照，提交后一次撤销恢复原参数", async () => {
    const store = createEffectStore();

    render(<EditorPage store={store} />);
    fireEvent.click(screen.getByRole("button", { name: "选择特效片段" }));
    expect((screen.getByLabelText("位置X") as HTMLInputElement).value).toBe("0.5");

    fireEvent.click(screen.getByRole("button", { name: "预览特效拖动" }));
    await waitFor(() => {
      expect(screen.getByTestId("preview-canvas").dataset.position).toBe(JSON.stringify({ x: 0.8, y: 0.7 }));
      expect((screen.getByLabelText("位置X") as HTMLInputElement).value).toBe("0.8");
    });
    expect(store.getSnapshot().effectClips[0].params.position).toEqual({ x: 0.5, y: 0.72 });

    fireEvent.click(screen.getByRole("button", { name: "提交特效拖动" }));
    await waitFor(() => expect(store.getSnapshot().effectClips[0].params.position).toEqual({ x: 0.8, y: 0.7 }));

    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    await waitFor(() => expect(store.getSnapshot().effectClips[0].params.position).toEqual({ x: 0.5, y: 0.72 }));
  });
});
