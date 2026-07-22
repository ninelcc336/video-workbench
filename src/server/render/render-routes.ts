import { Router } from "express";
import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";
import type { EditProject } from "../../domain/project/model";
import { validateProject } from "../../domain/project/validation";
import type { MediaSources } from "../../remotion/media";
import { createRenderJob, type RenderJob } from "./render-job";
import type { RenderAdapter } from "./render-adapter";
import type { WorkspaceAdapter } from "../workspace/workspace-adapter";

export type RenderRouterOptions = {
  workspace?: Pick<WorkspaceAdapter, "getMediaSources"> & Partial<Pick<WorkspaceAdapter, "loadProjectWithMediaStatus" | "getPaths">>;
  renderProject?: RenderAdapter;
};

// 中文注释：路由只编排任务生命周期，不把 Remotion 细节暴露给浏览器。
export function createRenderRouter(options: RenderRouterOptions = {}): Router {
  const router = Router();
  const jobs = new Map<string, RenderJob>();
  const jobMediaSources = new Map<string, MediaSources>();

  router.post("/api/render", async (request, response) => {
    try {
      const jobId = randomUUID();
      const body = request.body as {
      project: EditProject;
      outputPath: string;
      mediaSources?: MediaSources;
      };
      const validation = validateProject(body.project);
      if (!validation.valid) {
        response.status(400).json({ code: "invalid_project", message: "项目状态无效，无法导出", details: validation });
        return;
      }
      // 中文注释：服务端根据项目中的 mediaId 解析真实本地路径，不信任浏览器传入的临时 URL。
      const mediaIds = body.project.videoClips.map((clip) => clip.mediaId);
      const mediaSources = options.workspace
        ? await options.workspace.getMediaSources(mediaIds)
        : body.mediaSources ?? {};
      const missingMediaIds = mediaIds.filter((mediaId) => !mediaSources[mediaId]);
      if (missingMediaIds.length > 0) {
        response.status(409).json({ code: "missing_media", message: `存在缺失素材：${missingMediaIds.join("、")}`, missingMediaIds });
        return;
      }
      const requestedName = typeof body.outputPath === "string" ? basename(body.outputPath) : "export.mp4";
      const outputPath = options.workspace?.getPaths
        ? join(options.workspace.getPaths().renders, `${Date.now()}-${randomUUID()}-${requestedName.endsWith(".mp4") ? requestedName : "export.mp4"}`)
        : body.outputPath;
      const job = createRenderJob(body.project, {
        outputPath,
        renderProject: options.renderProject,
        renderOptions: { mediaSources },
        requireOutputFile: true,
      });
      jobs.set(jobId, job);
      jobMediaSources.set(jobId, mediaSources);
      void job.start();
      response.status(202).json({ jobId, snapshot: job.getSnapshot() });
    } catch (error) {
      response.status(500).json({ code: "render_error", message: error instanceof Error ? error.message : "导出任务创建失败" });
    }
  });

  router.get("/api/render/:jobId", (request, response) => {
    const job = jobs.get(request.params.jobId);
    if (!job) {
      response.status(404).json({ error: "渲染任务不存在" });
      return;
    }

    response.json(job.getSnapshot());
  });

  router.post("/api/render/:jobId/cancel", (request, response) => {
    const job = jobs.get(request.params.jobId);
    if (!job) {
      response.status(404).json({ error: "渲染任务不存在" });
      return;
    }

    job.cancel();
    response.json(job.getSnapshot());
  });

  router.post("/api/render/:jobId/retry", async (request, response) => {
    const previous = jobs.get(request.params.jobId);
    if (!previous) {
      response.status(404).json({ error: "渲染任务不存在" });
      return;
    }
    const previousSnapshot = previous.getSnapshot();
    if (previousSnapshot.status !== "failed" && previousSnapshot.status !== "cancelled") {
      response.status(409).json({ code: "render_not_retryable", message: "当前任务尚未失败或取消，不能重试" });
      return;
    }
    const retryId = randomUUID();
    const retry = createRenderJob(previousSnapshot.project, {
      outputPath: previousSnapshot.outputPath.replace(/\.mp4$/i, `-retry-${retryId}.mp4`),
      renderProject: options.renderProject,
      renderOptions: { mediaSources: options.workspace ? await options.workspace.getMediaSources(previousSnapshot.project.videoClips.map((clip) => clip.mediaId)) : jobMediaSources.get(request.params.jobId) ?? {} },
      requireOutputFile: true,
    });
    jobs.set(retryId, retry);
    jobMediaSources.set(retryId, jobMediaSources.get(request.params.jobId) ?? {});
    void retry.start();
    response.status(202).json({ jobId: retryId, snapshot: retry.getSnapshot() });
  });

  router.get("/api/render/:jobId/file", (request, response) => {
    const job = jobs.get(request.params.jobId);
    if (!job) { response.status(404).json({ error: "渲染任务不存在" }); return; }
    const snapshot = job.getSnapshot();
    if (snapshot.status !== "completed") { response.status(409).json({ error: "导出文件尚未完成" }); return; }
    response.sendFile(snapshot.outputPath);
  });

  router.get("/api/render/:jobId/download", (request, response) => {
    const job = jobs.get(request.params.jobId);
    if (!job) { response.status(404).json({ error: "渲染任务不存在" }); return; }
    const snapshot = job.getSnapshot();
    if (snapshot.status !== "completed") { response.status(409).json({ error: "导出文件尚未完成" }); return; }
    // 中文注释：下载路由显式设置附件响应，避免浏览器把 MP4 当作页面预览而忽略用户的下载动作。
    response.download(snapshot.outputPath, basename(snapshot.outputPath));
  });

  return router;
}
