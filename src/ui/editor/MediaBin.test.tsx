// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import { MediaBin } from "./MediaBin";

afterEach(cleanup);

describe("素材库缺失状态", () => {
  it("显示缺失素材提示，供页面阻止导出", () => {
    const project = createEmptyProject();
    project.videoClips.push({
      id: "video-1",
      mediaId: "missing-media",
      fromFrame: 0,
      sourceStartFrame: 0,
      durationInFrames: 30,
      audioEnabled: true,
    });

    render(<MediaBin missingMediaIds={["missing-media"]} project={project} />);

    expect(screen.getByRole("status").textContent).toContain("素材缺失");
  });

  it("移除当前时间轴引用的素材时不显示未引用确认，并交由页面显示保护提示", () => {
    const project = createEmptyProject();
    project.videoClips.push({
      id: "video-1",
      mediaId: "referenced-media",
      fromFrame: 0,
      sourceStartFrame: 0,
      durationInFrames: 30,
      audioEnabled: true,
    });
    const onDeleteMedia = vi.fn();
    const confirm = vi.spyOn(window, "confirm");
    render(<MediaBin mediaAssets={[{ id: "referenced-media", originalName: "已引用.mp4", fileName: "referenced-media.mp4", relativePath: "media/referenced-media.mp4", mimeType: "video/mp4", sizeBytes: 1, importedAt: "2026-07-23T00:00:00.000Z" }]} onDeleteMedia={onDeleteMedia} project={project} />);

    fireEvent.click(screen.getByRole("button", { name: "移除" }));

    expect(confirm).not.toHaveBeenCalled();
    expect(onDeleteMedia).toHaveBeenCalledWith("referenced-media");
  });
});
