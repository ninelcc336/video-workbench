import { Router } from "express";
import type { EditProject } from "../../domain/project/model";
import type { MediaSources } from "../../remotion/media";
import { createRenderJob, type RenderJob } from "./render-job";
import type { RenderAdapter } from "./render-adapter";
import type { WorkspaceAdapter } from "../workspace/workspace-adapter";

export type RenderRouterOptions = {
  workspace?: Pick<WorkspaceAdapter, "getMediaSources">;
  renderProject?: RenderAdapter;
};

// 中文注释：路由只编排任务生命周期，不把 Remotion 细节暴露给浏览器。
export function createRenderRouter(options: RenderRouterOptions = {}): Router {
  const router = Router();
  const jobs = new Map<string, RenderJob>();

  router.post("/api/render", async (request, response) => {
    const jobId = crypto.randomUUID();
    const body = request.body as {
      project: EditProject;
      outputPath: string;
      mediaSources?: MediaSources;
    };
    // 中文注释：服务端根据项目中的 mediaId 解析真实本地路径，不信任浏览器传入的临时 URL。
    const mediaIds = body.project.videoClips.map((clip) => clip.mediaId);
    const mediaSources = options.workspace
      ? await options.workspace.getMediaSources(mediaIds)
      : body.mediaSources ?? {};
    const job = createRenderJob(body.project, {
      outputPath: body.outputPath,
      renderProject: options.renderProject,
      renderOptions: {
        mediaSources,
      },
    });
    jobs.set(jobId, job);
    void job.start();
    response.status(202).json({ jobId, snapshot: job.getSnapshot() });
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

  return router;
}
