import { Router } from "express";
import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";
import type { EditProject } from "../../domain/project/model";
import { validateProject } from "../../domain/project/validation";
import type { MediaSources } from "../../remotion/media";
import { createRenderJob, type RenderJob } from "./render-job";
import type { RenderAdapter } from "./render-adapter";
import type { WorkspaceAdapter } from "../workspace/workspace-adapter";
import type { VideoWorkspaceAdapter } from "../workspace/video-workspace-adapter";

export type RenderRouterOptions = {
  workspace?: Pick<WorkspaceAdapter, "getMediaSources"> & Partial<Pick<WorkspaceAdapter, "loadProjectWithMediaStatus" | "getPaths">>
    | Pick<VideoWorkspaceAdapter, "getMediaSources" | "getWorkspacePaths">;
  renderProject?: RenderAdapter;
};

// 中文注释：路由只编排任务生命周期，不把 Remotion 细节暴露给浏览器。
export function createRenderRouter(options: RenderRouterOptions = {}): Router {
  const router = Router();
  const jobs = new Map<string, RenderJob>();
  const jobMediaSources = new Map<string, MediaSources>();
  const jobWorkspaceIds = new Map<string, string>();

  router.post("/api/render", async (request, response) => {
    try {
      const jobId = randomUUID();
      const body = request.body as {
      project: EditProject;
      outputPath: string;
      mediaSources?: MediaSources;
      workspaceId?: string;
      };
      const validation = validateProject(body.project);
      if (!validation.valid) {
        response.status(400).json({ code: "invalid_project", message: "视频工作区状态无效，无法导出", details: validation });
        return;
      }
      // 中文注释：服务端根据工作区快照中的 mediaId 解析真实本地路径，不信任浏览器传入的临时 URL。
      const mediaIds = body.project.videoClips.map((clip) => clip.mediaId);
      const isolatedWorkspace = options.workspace && body.workspaceId && "getWorkspacePaths" in options.workspace;
      const mediaSources = isolatedWorkspace
        ? await (options.workspace as Pick<VideoWorkspaceAdapter, "getMediaSources">).getMediaSources(body.workspaceId as string, mediaIds)
        : options.workspace
          ? await (options.workspace as Pick<WorkspaceAdapter, "getMediaSources">).getMediaSources(mediaIds)
          : body.mediaSources ?? {};
      const missingMediaIds = mediaIds.filter((mediaId) => !mediaSources[mediaId]);
      if (missingMediaIds.length > 0) {
        response.status(409).json({ code: "missing_media", message: `存在缺失素材：${missingMediaIds.join("、")}`, missingMediaIds });
        return;
      }
      const requestedName = typeof body.outputPath === "string" ? basename(body.outputPath) : "export.mp4";
      const outputPath = isolatedWorkspace
        ? join((options.workspace as Pick<VideoWorkspaceAdapter, "getWorkspacePaths">).getWorkspacePaths(body.workspaceId as string).renders, `${Date.now()}-${randomUUID()}-${requestedName.endsWith(".mp4") ? requestedName : "export.mp4"}`)
        : options.workspace && "getPaths" in options.workspace && options.workspace.getPaths
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
      if (isolatedWorkspace) jobWorkspaceIds.set(jobId, body.workspaceId as string);
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
      renderOptions: {
        mediaSources: options.workspace && jobWorkspaceIds.has(request.params.jobId) && "getWorkspacePaths" in options.workspace
          ? await (options.workspace as Pick<VideoWorkspaceAdapter, "getMediaSources">).getMediaSources(jobWorkspaceIds.get(request.params.jobId) as string, previousSnapshot.project.videoClips.map((clip) => clip.mediaId))
          : options.workspace
            ? await (options.workspace as Pick<WorkspaceAdapter, "getMediaSources">).getMediaSources(previousSnapshot.project.videoClips.map((clip) => clip.mediaId))
            : jobMediaSources.get(request.params.jobId) ?? {},
      },
      requireOutputFile: true,
    });
    jobs.set(retryId, retry);
    jobMediaSources.set(retryId, jobMediaSources.get(request.params.jobId) ?? {});
    const workspaceId = jobWorkspaceIds.get(request.params.jobId);
    if (workspaceId) jobWorkspaceIds.set(retryId, workspaceId);
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

  return router;
}
