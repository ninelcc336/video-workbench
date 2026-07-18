// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import { ExportDialog } from "./ExportDialog";

afterEach(cleanup);

describe("导出规格对话框", () => {
  it("打开横屏编辑项目时默认提交项目的横屏导出规格", () => {
    const project = createEmptyProject({ width: 1920, height: 1080, fps: 30 });
    const onSubmit = vi.fn();

    render(<ExportDialog onClose={vi.fn()} onSubmit={onSubmit} open project={project} />);
    fireEvent.click(screen.getByRole("button", { name: "开始导出" }));

    expect(onSubmit).toHaveBeenCalledWith({ format: "mp4", width: 1920, height: 1080, fps: 30 });
  });

  it("打开非预设横屏项目时保留项目自身的导出规格", () => {
    const project = createEmptyProject({ width: 1920, height: 1440, fps: 30 });
    const onSubmit = vi.fn();

    render(<ExportDialog onClose={vi.fn()} onSubmit={onSubmit} open project={project} />);
    fireEvent.click(screen.getByRole("button", { name: "开始导出" }));

    expect(onSubmit).toHaveBeenCalledWith({ format: "mp4", width: 1920, height: 1440, fps: 30 });
  });
});
