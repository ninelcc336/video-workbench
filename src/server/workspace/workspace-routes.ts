import { Router, type Request, type Response } from "express";
import multer from "multer";
import { createEmptyProject } from "../../domain/project/factories";
import type { VideoTemplate } from "../../domain/assets/video-template-model";
import type { EditProject } from "../../domain/project/model";
import { WorkspaceAdapter, WorkspaceError } from "./workspace-adapter";

function sendWorkspaceError(response: Response, error: unknown): void {
  if (error instanceof WorkspaceError) {
    const status =
      error.code === "project_not_found" || error.code === "media_not_found" || error.code === "backup_not_found" ? 404
        : error.code === "project_exists" ? 409
        : error.code === "media_in_use" ? 409
        : 400;
    response.status(status).json({ code: error.code, message: error.message, details: error.details });
    return;
  }
  response.status(500).json({ code: "workspace_error", message: "本地工作区操作失败" });
}

function routeParam(value: string | string[]): string {
  // 中文注释：Express 的参数类型允许数组，这里统一取单值，避免把数组当作路径片段。
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

/** 中文注释：路由只做 HTTP 参数解包和错误映射，不复制仓储或素材业务逻辑。 */
export function createWorkspaceRouter(adapter: WorkspaceAdapter): Router {
  const router = Router();
  // 中文注释：先把上传内容放进内存，再由工作区适配器复制到 media，避免 Multer 自己决定持久化路径。
  const upload = multer({ storage: multer.memoryStorage() });

  router.post("/open", async (request: Request, response: Response) => {
    try {
      const rootPath =
        typeof request.body?.rootPath === "string" ? request.body.rootPath : undefined;
      await adapter.createWorkspace(rootPath);
      response.json({ ok: true, rootPath: adapter.getPaths().root, recentWorkspaces: await adapter.listRecentWorkspaces() });
    } catch (error) {
      sendWorkspaceError(response, error);
    }
  });

  router.get("/recent", async (_request: Request, response: Response) => {
    try { response.json(await adapter.listRecentWorkspaces()); } catch (error) { sendWorkspaceError(response, error); }
  });

  router.get("/projects", async (_request: Request, response: Response) => {
    try {
      response.json(await adapter.listProjects());
    } catch (error) {
      sendWorkspaceError(response, error);
    }
  });

  router.get("/projects/:projectId", async (request: Request, response: Response) => {
    try {
      const projectId = routeParam(request.params.projectId);
      const shouldRecover = request.query.recover === "backup";
      const project = shouldRecover
        ? await adapter.restoreProjectFromBackup(projectId)
        : await adapter.loadProject(projectId);
      const result = await adapter.loadProjectWithMediaStatus(projectId);
      const mediaSources = Object.fromEntries(
        result.project.videoClips.map((clip) => [
          clip.mediaId,
          `/api/workspace/media/${encodeURIComponent(clip.mediaId)}`,
        ]),
      );
      response.json({ ...result, backupAvailable: await adapter.hasProjectBackup(projectId), mediaSources });
    } catch (error) {
      if (error instanceof WorkspaceError && error.code === "corrupt_project") {
        response.status(409).json({ code: error.code, message: error.message, details: error.details, backupAvailable: await adapter.hasProjectBackup(routeParam(request.params.projectId)) });
      } else {
        sendWorkspaceError(response, error);
      }
    }
  });

  router.put("/projects/:projectId", async (request: Request, response: Response) => {
    try {
      await adapter.saveProject(routeParam(request.params.projectId), request.body as EditProject);
      response.json({ ok: true });
    } catch (error) {
      sendWorkspaceError(response, error);
    }
  });

  router.post("/projects/:projectId", async (request: Request, response: Response) => {
    try {
      await adapter.createProject(routeParam(request.params.projectId), request.body as EditProject ?? createEmptyProject());
      response.status(201).json({ ok: true });
    } catch (error) {
      sendWorkspaceError(response, error);
    }
  });

  router.patch("/projects/:projectId", async (request: Request, response: Response) => {
    try {
      const projectId = routeParam(request.params.projectId);
      const nextProjectId = typeof request.body?.id === "string" ? request.body.id : request.body?.name;
      if (!nextProjectId) {
        response.status(400).json({ code: "invalid_project", message: "请提供新的项目名称" });
        return;
      }
      await adapter.renameProject(projectId, nextProjectId);
      response.json({ ok: true, id: nextProjectId, name: nextProjectId });
    } catch (error) {
      sendWorkspaceError(response, error);
    }
  });

  router.post("/projects/:projectId/copy", async (request: Request, response: Response) => {
    try {
      const projectId = routeParam(request.params.projectId);
      const nextProjectId = request.body?.id ?? request.body?.name;
      if (typeof nextProjectId !== "string" || !nextProjectId) {
        response.status(400).json({ code: "invalid_project", message: "请提供复制后的项目名称" });
        return;
      }
      await adapter.copyProject(projectId, nextProjectId);
      response.status(201).json({ ok: true, id: nextProjectId, name: nextProjectId });
    } catch (error) {
      sendWorkspaceError(response, error);
    }
  });

  router.delete("/projects/:projectId", async (request: Request, response: Response) => {
    try {
      await adapter.deleteProject(routeParam(request.params.projectId));
      response.status(204).end();
    } catch (error) {
      sendWorkspaceError(response, error);
    }
  });

  router.post("/projects/:projectId/recover", async (request: Request, response: Response) => {
    try {
      const projectId = routeParam(request.params.projectId);
      const project = await adapter.restoreProjectFromBackup(projectId);
      response.json({ ok: true, project });
    } catch (error) {
      sendWorkspaceError(response, error);
    }
  });

  router.post("/media", upload.single("file"), async (request: Request, response: Response) => {
    try {
      const uploadedFile = request.file;
      if (!uploadedFile) {
        response.status(400).json({ code: "invalid_media", message: "请选择要导入的视频文件" });
        return;
      }
      if (!uploadedFile.mimetype.startsWith("video/")) {
        response.status(400).json({ code: "invalid_media", message: "只支持导入视频文件" });
        return;
      }
      const durationInSeconds = Number(request.body?.durationInSeconds);
      const width = Number(request.body?.width);
      const height = Number(request.body?.height);
      const fps = Number(request.body?.fps);
      const asset = await adapter.importMedia({
        buffer: uploadedFile.buffer,
        mimeType: uploadedFile.mimetype,
        originalName: uploadedFile.originalname,
        size: uploadedFile.size,
        metadata: Number.isFinite(durationInSeconds) && durationInSeconds > 0
          && Number.isInteger(width) && width > 0
          && Number.isInteger(height) && height > 0
          && Number.isFinite(fps) && fps > 0
          ? { durationInSeconds, width, height, fps, fpsWasFallback: request.body?.fpsWasFallback === "true" }
          : undefined,
      });
      response.status(201).json(asset);
    } catch (error) {
      sendWorkspaceError(response, error);
    }
  });

  router.get("/media", async (_request: Request, response: Response) => {
    try {
      response.json(await adapter.listMedia());
    } catch (error) {
      sendWorkspaceError(response, error);
    }
  });

  router.patch("/media/:mediaId", async (request: Request, response: Response) => {
    try {
      const name = request.body?.name;
      if (typeof name !== "string" || !name.trim()) {
        response.status(400).json({ code: "invalid_media", message: "素材名称不能为空" });
        return;
      }
      response.json(await adapter.renameMedia(routeParam(request.params.mediaId), name));
    } catch (error) {
      sendWorkspaceError(response, error);
    }
  });

  router.delete("/media/:mediaId", async (request: Request, response: Response) => {
    try {
      await adapter.deleteMedia(routeParam(request.params.mediaId));
      response.status(204).end();
    } catch (error) {
      sendWorkspaceError(response, error);
    }
  });

  router.post("/media/:mediaId/relink", upload.single("file"), async (request: Request, response: Response) => {
    try {
      const uploadedFile = request.file;
      if (!uploadedFile || !uploadedFile.mimetype.startsWith("video/")) {
        response.status(400).json({ code: "invalid_media", message: "请选择视频文件重新关联" });
        return;
      }
      response.json(await adapter.relinkMedia(routeParam(request.params.mediaId), {
        buffer: uploadedFile.buffer,
        originalName: uploadedFile.originalname,
        mimeType: uploadedFile.mimetype,
        size: uploadedFile.size,
      }));
    } catch (error) {
      sendWorkspaceError(response, error);
    }
  });

  router.post("/media/:mediaId/relink/undo", async (request: Request, response: Response) => {
    try { response.json(await adapter.undoRelinkMedia(routeParam(request.params.mediaId))); } catch (error) { sendWorkspaceError(response, error); }
  });

  router.get("/presets", async (_request: Request, response: Response) => {
    try { response.json(await adapter.listPresets()); } catch (error) { sendWorkspaceError(response, error); }
  });

  router.post("/presets", async (request: Request, response: Response) => {
    try {
      const body = request.body as { templateId: string; templateVersion: number; params: Record<string, unknown>; name: string; id?: string };
      const preset = await adapter.savePreset(body.templateId, body.templateVersion, body.params, body.name, body.id);
      response.status(201).json(preset);
    } catch (error) { sendWorkspaceError(response, error); }
  });

  router.delete("/presets/:presetId", async (request: Request, response: Response) => {
    try { await adapter.deletePreset(routeParam(request.params.presetId)); response.status(204).end(); } catch (error) { sendWorkspaceError(response, error); }
  });

  router.get("/video-templates", async (_request: Request, response: Response) => {
    try { response.json(await adapter.listVideoTemplates()); } catch (error) { sendWorkspaceError(response, error); }
  });

  router.post("/video-templates", async (request: Request, response: Response) => {
    try {
      const template = request.body as VideoTemplate;
      response.status(201).json(await adapter.saveVideoTemplate(template));
    } catch (error) { sendWorkspaceError(response, error); }
  });

  router.delete("/video-templates/:templateId", async (request: Request, response: Response) => {
    try { await adapter.deleteVideoTemplate(routeParam(request.params.templateId)); response.status(204).end(); } catch (error) { sendWorkspaceError(response, error); }
  });

  router.get("/media/:mediaId", async (request: Request, response: Response) => {
    try {
      const mediaPath = await adapter.getMediaPath(routeParam(request.params.mediaId));
      if (!mediaPath) {
        response.status(404).json({ code: "media_not_found", message: "找不到视频素材" });
        return;
      }
      response.sendFile(mediaPath);
    } catch (error) {
      sendWorkspaceError(response, error);
    }
  });

  return router;
}

export const registerWorkspaceRoutes = createWorkspaceRouter;
