import { Router } from "express";
import type { EditProject } from "../../domain/project/model";
import type { MediaSources } from "../../remotion/media";
import { createRenderJob, type RenderJob } from "./render-job";

export function createRenderRouter(): Router {
  const router = Router();
  const jobs = new Map<string, RenderJob>();

  router.post("/api/render", (request, response) => {
    const jobId = crypto.randomUUID();
    const body = request.body as {
      project: EditProject;
      outputPath: string;
      mediaSources?: MediaSources;
    };
    const job = createRenderJob(body.project, { outputPath: body.outputPath });
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
