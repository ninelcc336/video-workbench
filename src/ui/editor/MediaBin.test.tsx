// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import { MediaBin } from "./MediaBin";

const mediaAsset = { id: "referenced-media", originalName: "已引用.mp4", fileName: "referenced-media.mp4", relativePath: "media/referenced-media.mp4", mimeType: "video/mp4", sizeBytes: 1, importedAt: "2026-07-23T00:00:00.000Z" };

/** 中文注释：构造引用一项工作区素材的项目，供重命名、删除和缺失素材用例复用。 */
function createReferencedProject() {
  const project = createEmptyProject();
  project.videoClips.push({
    id: "video-1",
    mediaId: "referenced-media",
    fromFrame: 0,
    sourceStartFrame: 0,
    durationInFrames: 30,
    audioEnabled: true,
  });
  return project;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("素材库管理流程", () => {
  // 中文注释：缺失素材不仅阻止导出，还必须提供无需浏览器原生确认框的修复入口。
  it("显示缺失素材提示并通过应用内确认进入重新关联", () => {
    const project = createReferencedProject();
    const confirm = vi.spyOn(window, "confirm");
    render(<MediaBin missingMediaIds={["referenced-media"]} project={project} />);

    expect(screen.getByRole("status").textContent).toContain("素材缺失");
    fireEvent.click(screen.getByRole("button", { name: "重新关联" }));
    expect(screen.getByRole("alertdialog", { name: "替换“视频片段 1”的文件？" })).toBeTruthy();
    expect(confirm).not.toHaveBeenCalled();
  });

  // 中文注释：素材名称编辑使用受控输入框，取消或浏览器原生 prompt 都不会参与该流程。
  it("通过自定义表单重命名素材", async () => {
    const onRenameMedia = vi.fn().mockResolvedValue(undefined);
    const prompt = vi.spyOn(window, "prompt");
    render(<MediaBin mediaAssets={[mediaAsset]} onRenameMedia={onRenameMedia} project={createReferencedProject()} />);

    fireEvent.click(screen.getByRole("button", { name: "重命名" }));
    fireEvent.change(screen.getByLabelText("素材名称"), { target: { value: "新的展示名称.mp4" } });
    fireEvent.click(screen.getByRole("button", { name: "保存名称" }));

    await waitFor(() => expect(onRenameMedia).toHaveBeenCalledWith("referenced-media", "新的展示名称.mp4"));
    expect(prompt).not.toHaveBeenCalled();
  });

  // 中文注释：即使素材仍被时间轴引用，也必须先明确确认；取消不能向服务端发起移除。
  it("移除素材要求确认，取消后不调用删除接口", () => {
    const onDeleteMedia = vi.fn();
    render(<MediaBin mediaAssets={[mediaAsset]} onDeleteMedia={onDeleteMedia} project={createReferencedProject()} />);

    fireEvent.click(screen.getByRole("button", { name: "移除" }));
    expect(screen.getByRole("alertdialog", { name: "移除“已引用.mp4”？" })).toBeTruthy();
    expect(screen.getByText("该素材仍被当前时间轴引用。确认后会请求移除，服务端将保护仍在使用的素材。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onDeleteMedia).not.toHaveBeenCalled();
  });

  // 中文注释：用户确认重新关联后才打开系统文件选择器，所选文件仍通过当前工作区的稳定 mediaId 提交。
  it("确认重新关联后提交系统选择的替换文件", async () => {
    const onRelinkMedia = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<MediaBin mediaAssets={[mediaAsset]} missingMediaIds={["referenced-media"]} onRelinkMedia={onRelinkMedia} project={createReferencedProject()} />);

    fireEvent.click(screen.getByRole("button", { name: "重新关联" }));
    fireEvent.click(screen.getByRole("button", { name: "选择替换文件" }));
    const relinkInput = container.querySelectorAll('input[type="file"]')[1];
    const file = new File(["replacement"], "replacement.mp4", { type: "video/mp4" });
    fireEvent.change(relinkInput, { target: { files: [file] } });

    await waitFor(() => expect(onRelinkMedia).toHaveBeenCalledWith("referenced-media", file));
  });

  // 中文注释：服务端拒绝重命名时，用户可在原对话框中看到失败原因并保留当前输入。
  it("素材重命名失败时保留表单并展示错误", async () => {
    const onRenameMedia = vi.fn().mockRejectedValue(new Error("素材名称不能为空"));
    render(<MediaBin mediaAssets={[mediaAsset]} onRenameMedia={onRenameMedia} project={createReferencedProject()} />);

    fireEvent.click(screen.getByRole("button", { name: "重命名" }));
    fireEvent.click(screen.getByRole("button", { name: "保存名称" }));

    expect((await screen.findByRole("alert")).textContent).toContain("素材名称不能为空");
    expect(screen.getByRole("dialog", { name: "重命名视频素材" })).toBeTruthy();
  });
});
