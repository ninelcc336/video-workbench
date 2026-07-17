import type { EditProject } from "../../domain/project/model";
import type { MediaSources } from "../../remotion/media";
import { renderProject as defaultRenderProject, type RenderAdapter, type RenderResult } from "./render-adapter";

export type RenderJobStatus = "preparing" | "rendering" | "completed" | "failed" | "cancelled";

export type RenderJobSnapshot = {
  project: EditProject;
  status: RenderJobStatus;
  outputPath: string;
  error?: { message: string };
};

export type RenderJob = {
  getSnapshot(): RenderJobSnapshot;
  start(): Promise<void>;
  cancel(): void;
};

// 中文注释：渲染任务隔离项目快照和取消状态，外部只能通过这个小接口观察任务。
export function createRenderJob(
  project: EditProject,
  options: {
    outputPath: string;
    renderProject?: RenderAdapter;
    renderOptions?: { mediaSources?: MediaSources; serveUrl?: string };
  },
): RenderJob {
  const snapshot: RenderJobSnapshot = {
    project: structuredClone(project),
    status: "preparing",
    outputPath: options.outputPath,
  };
  let cancelled = false;
  let started = false;

  return {
    getSnapshot: () => structuredClone(snapshot),
    start: async () => {
      if (started) {
        throw new Error(`渲染任务已${snapshot.status === "completed" ? "完成" : "启动"}，不能再次渲染`);
      }

      started = true;
      snapshot.status = "rendering";

      try {
        const renderResult: RenderResult = await (options.renderProject ?? defaultRenderProject)(
          snapshot.project,
          snapshot.outputPath,
          { ...options.renderOptions, cancelSignal: () => cancelled },
        );

        if (cancelled) {
          snapshot.status = "cancelled";
          return;
        }

        snapshot.status = "completed";
        snapshot.outputPath = renderResult.outputPath;
      } catch (error) {
        if (cancelled) {
          snapshot.status = "cancelled";
          return;
        }

        const message = error instanceof Error ? error.message : "未知渲染错误";
        snapshot.status = "failed";
        snapshot.error = { message: `视频渲染失败：${message}` };
      }
    },
    cancel: () => {
      cancelled = true;
      if (snapshot.status === "preparing" || snapshot.status === "rendering") {
        snapshot.status = "cancelled";
      }
    },
  };
}
