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

  it("可通过自定义规格选择器选择预设后提交", () => {
    const project = createEmptyProject({ width: 1080, height: 1920, fps: 30 });
    const onSubmit = vi.fn();

    render(<ExportDialog onClose={vi.fn()} onSubmit={onSubmit} open project={project} />);
    fireEvent.click(screen.getByRole("combobox", { name: "画面规格" }));
    fireEvent.click(screen.getByRole("option", { name: "横屏（1920×1080）" }));
    fireEvent.click(screen.getByRole("button", { name: "开始导出" }));

    expect(onSubmit).toHaveBeenCalledWith({ format: "mp4", width: 1920, height: 1080, fps: 30 });
  });

  it("按 Esc 关闭对话框并回调关闭处理", () => {
    const onClose = vi.fn();
    render(<ExportDialog onClose={onClose} onSubmit={vi.fn()} open project={createEmptyProject()} />);

    expect(screen.getByRole("dialog", { name: "导出视频" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("再次打开时恢复当前视频工作区的导出规格", () => {
    const project = createEmptyProject({ width: 1080, height: 1920, fps: 30 });
    const onSubmit = vi.fn();
    const { rerender } = render(<ExportDialog onClose={vi.fn()} onSubmit={onSubmit} open project={project} />);

    fireEvent.click(screen.getByRole("combobox", { name: "画面规格" }));
    fireEvent.click(screen.getByRole("option", { name: "横屏（1920×1080）" }));
    rerender(<ExportDialog onClose={vi.fn()} onSubmit={onSubmit} open={false} project={project} />);
    rerender(<ExportDialog onClose={vi.fn()} onSubmit={onSubmit} open project={project} />);
    fireEvent.click(screen.getByRole("button", { name: "开始导出" }));

    expect(onSubmit).toHaveBeenCalledWith({ format: "mp4", width: 1080, height: 1920, fps: 30 });
  });
});
