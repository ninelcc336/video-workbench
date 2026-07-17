// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import type { RenderJobSnapshot } from "../../server/render/render-job";
import { RenderStatus } from "./RenderStatus";

afterEach(cleanup);

function snapshot(status: RenderJobSnapshot["status"], overrides: Partial<RenderJobSnapshot> = {}): RenderJobSnapshot {
  return {
    project: createEmptyProject(),
    status,
    outputPath: "renders/demo.mp4",
    ...overrides,
  };
}

describe("渲染状态", () => {
  it.each([
    ["preparing", "准备中"],
    ["rendering", "渲染中"],
    ["completed", "已完成"],
    ["failed", "失败"],
    ["cancelled", "已取消"],
  ] as const)("把 %s 显示为中文状态 %s", (status, label) => {
    // 中文注释：每个状态都从同一个公开快照入口验证，保证状态机文案完整。
    render(<RenderStatus snapshot={snapshot(status)} />);
    expect(screen.getByRole("status").textContent).toContain(label);
  });

  it("失败时显示阶段和错误摘要", () => {
    // 中文注释：错误摘要需要保留底层失败原因，方便定位 Chromium 或素材问题。
    render(
      <RenderStatus
        snapshot={snapshot("failed", { error: { message: "视频渲染失败：Chromium 启动失败" } })}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain("渲染阶段：渲染中");
    expect(screen.getByRole("alert").textContent).toContain("Chromium 启动失败");
  });

  it("未完成时允许取消，完成后提供输出文件入口", () => {
    // 中文注释：取消只在活动任务展示，完成任务则提供本地导出文件入口。
    const onCancel = vi.fn();
    const { rerender } = render(
      <RenderStatus onCancel={onCancel} snapshot={snapshot("rendering")} />,
    );
    screen.getByRole("button", { name: "取消渲染" }).click();
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(<RenderStatus snapshot={snapshot("completed")} />);
    expect(screen.getByRole("link", { name: "打开导出文件" }).getAttribute("href")).toBe(
      "renders/demo.mp4",
    );
  });
});
