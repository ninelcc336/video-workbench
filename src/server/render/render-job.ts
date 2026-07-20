import type { EditProject } from "../../domain/project/model";
import { stat } from "node:fs/promises";
import { rm } from "node:fs/promises";
import type { MediaSources } from "../../remotion/media";
import { renderProject as defaultRenderProject, type RenderAdapter, type RenderResult } from "./render-adapter";
import type { RemotionBundleFunction } from "./remotion-bundler";

export type RenderJobStatus = "preparing" | "rendering" | "completed" | "failed" | "cancelled";

export type RenderJobSnapshot = {
  project: EditProject;
  status: RenderJobStatus;
  outputPath: string;
  /** 中文注释：完成后的文件信息用于导出结果列表，浏览器不需要直接读取本地路径。 */
  file?: { sizeBytes: number; createdAt: string };
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
    renderOptions?: { mediaSources?: MediaSources; serveUrl?: string; bundle?: RemotionBundleFunction; timeoutInMilliseconds?: number };
    /** 中文注释：HTTP 导出必须确认真实文件已生成，纯领域测试可关闭此约束。 */
    requireOutputFile?: boolean;
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

      if (cancelled) return;

      started = true;
      snapshot.status = "rendering";

      try {
        const renderResult: RenderResult = await (options.renderProject ?? defaultRenderProject)(
          snapshot.project,
          snapshot.outputPath,
          { ...options.renderOptions, cancelSignal: () => cancelled },
        );

        if (cancelled) {
          await rm(snapshot.outputPath, { force: true }).catch(() => undefined);
          snapshot.status = "cancelled";
          return;
        }

        snapshot.status = "completed";
        snapshot.outputPath = renderResult.outputPath;
        if (renderResult.sizeBytes !== undefined || renderResult.createdAt !== undefined) {
          snapshot.file = {
            sizeBytes: renderResult.sizeBytes ?? 0,
            createdAt: renderResult.createdAt ?? new Date().toISOString(),
          };
        }
        if (!snapshot.file) {
          try {
            const fileStats = await stat(snapshot.outputPath);
            snapshot.file = { sizeBytes: fileStats.size, createdAt: fileStats.mtime.toISOString() };
          } catch {
            // 中文注释：测试适配器或远程渲染器可能只返回逻辑路径，缺少文件统计时仍保留完成状态。
          }
        }
        if (options.requireOutputFile && !snapshot.file) {
          throw new Error("导出任务未生成有效 MP4 文件");
        }
      } catch (error) {
        if (cancelled) {
          await rm(snapshot.outputPath, { force: true }).catch(() => undefined);
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
