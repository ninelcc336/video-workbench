import { describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import type { EditProject } from "../../domain/project/model";
import type { RenderResult } from "./render-adapter";
import { createRenderJob } from "./render-job";

const project = createEmptyProject();

describe("本地渲染任务", () => {
  it("从准备中进入渲染中并最终完成", async () => {
    const renderProject = vi.fn(async () => ({
      outputPath: "renders/job.mp4",
      contentType: "video/mp4" as const,
    }));
    const job = createRenderJob(project, {
      outputPath: "renders/job.mp4",
      renderProject,
    });

    expect(job.getSnapshot().status).toBe("preparing");

    const rendering = job.start();
    expect(job.getSnapshot().status).toBe("rendering");
    await rendering;

    expect(job.getSnapshot()).toMatchObject({
      status: "completed",
      outputPath: "renders/job.mp4",
    });
    expect(renderProject).toHaveBeenCalledWith(
      project,
      "renders/job.mp4",
      expect.objectContaining({ cancelSignal: expect.any(Function) }),
    );
  });

  it("把 Remotion 异常转换为明确中文失败信息", async () => {
    const job = createRenderJob(project, {
      outputPath: "renders/job.mp4",
      renderProject: vi.fn(async () => {
        throw new Error("Chromium 启动失败");
      }),
    });

    await job.start();

    expect(job.getSnapshot()).toMatchObject({
      status: "failed",
      error: { message: "视频渲染失败：Chromium 启动失败" },
    });
  });

  it("取消渲染后保持已取消状态", async () => {
    let resolveRender!: () => void;
    const renderProject = vi.fn(
      () =>
        new Promise<RenderResult>((resolve) => {
          resolveRender = () =>
            resolve({ outputPath: "renders/job.mp4", contentType: "video/mp4" });
        }),
    );
    const job = createRenderJob(project, {
      outputPath: "renders/job.mp4",
      renderProject,
    });

    const rendering = job.start();
    job.cancel();
    resolveRender();
    await rendering;

    expect(job.getSnapshot().status).toBe("cancelled");
  });

  it("完成后拒绝再次进入渲染状态", async () => {
    const job = createRenderJob(project, {
      outputPath: "renders/job.mp4",
      renderProject: vi.fn(async () => ({
        outputPath: "renders/job.mp4",
        contentType: "video/mp4" as const,
      })),
    });

    await job.start();

    await expect(job.start()).rejects.toThrow("渲染任务已完成，不能再次渲染");
    expect(job.getSnapshot().status).toBe("completed");
  });

  it("保留创建时的项目快照，不因外部对象修改而改变任务输入", () => {
    const input = structuredClone(project) as EditProject;
    const job = createRenderJob(input, {
      outputPath: "renders/job.mp4",
      renderProject: vi.fn(async () => ({
        outputPath: "renders/job.mp4",
        contentType: "video/mp4" as const,
      })),
    });

    input.settings.width = 1;

    expect(job.getSnapshot().project.settings.width).toBe(1080);
  });
});
