import { Router, type Request, type Response } from "express";
import multer from "multer";
import { createEmptyProject } from "../../domain/project/factories";
import type { VideoWorkspace } from "../../domain/workspace/model";
import { VideoWorkspaceAdapter } from "./video-workspace-adapter";
import { WorkspaceError } from "./workspace-paths";

/** 中文注释：统一将工作区领域错误转换为浏览器可展示的 HTTP 响应。 */
function sendWorkspaceError(response: Response, error: unknown): void {
  if (error instanceof WorkspaceError) {
    const status = error.code === "project_not_found" || error.code === "media_not_found" || error.code === "backup_not_found" ? 404
      : error.code === "project_exists" || error.code === "media_in_use" ? 409
        : error.code === "project_library_unavailable" ? 503
          : 400;
    response.status(status).json({ code: error.code, details: error.details, message: error.message });
    return;
  }
  response.status(500).json({ code: "workspace_error", message: "视频工作区操作失败" });
}

/** 中文注释：Express 允许路径参数数组，路由层统一收敛为单个安全字符串后再交给适配器。 */
function routeParam(value: string | string[]): string {
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

/** 中文注释：上传元数据由服务端校验；浏览器无法提供完整数据时由 MediaRepository 使用 ffprobe 兜底。 */
function readUploadMetadata(body: Record<string, unknown>) {
  const durationInSeconds = Number(body.durationInSeconds);
  const width = Number(body.width);
  const height = Number(body.height);
  const fps = Number(body.fps);
  return Number.isFinite(durationInSeconds) && durationInSeconds > 0
    && Number.isInteger(width) && width > 0
    && Number.isInteger(height) && height > 0
    && Number.isFinite(fps) && fps > 0
    ? { durationInSeconds, fps, fpsWasFallback: body.fpsWasFallback === "true", height, width }
    : undefined;
}

/** 中文注释：所有媒体路由都嵌套在 workspaceId 下，接口结构本身阻止了全局共享素材的误用。 */
export function createVideoWorkspaceRouter(adapter: VideoWorkspaceAdapter): Router {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage() });

  router.get("/workspaces", async (_request, response) => {
    try { response.json(await adapter.listWorkspaces()); } catch (error) { sendWorkspaceError(response, error); }
  });

  router.post("/workspaces/:workspaceId", async (request, response) => {
    try {
      await adapter.createWorkspace(routeParam(request.params.workspaceId), (request.body ?? createEmptyProject()) as VideoWorkspace);
      response.status(201).json({ ok: true });
    } catch (error) { sendWorkspaceError(response, error); }
  });

  router.get("/workspaces/:workspaceId", async (request, response) => {
    try {
      const workspaceId = routeParam(request.params.workspaceId);
      const result = await adapter.loadWorkspace(workspaceId);
      const mediaSources = Object.fromEntries(result.workspace.videoClips.map((clip) => [
        clip.mediaId,
        `/api/workspaces/${encodeURIComponent(workspaceId)}/media/${encodeURIComponent(clip.mediaId)}`,
      ]));
      response.json({ ...result, backupAvailable: await adapter.hasWorkspaceBackup(workspaceId), mediaSources });
    } catch (error) {
      if (error instanceof WorkspaceError && error.code === "corrupt_project") {
        response.status(409).json({ code: error.code, details: error.details, message: error.message, backupAvailable: await adapter.hasWorkspaceBackup(routeParam(request.params.workspaceId)) });
      } else sendWorkspaceError(response, error);
    }
  });

  router.put("/workspaces/:workspaceId", async (request, response) => {
    try {
      await adapter.saveWorkspace(routeParam(request.params.workspaceId), request.body as VideoWorkspace);
      response.json({ ok: true });
    } catch (error) { sendWorkspaceError(response, error); }
  });

  router.post("/workspaces/:workspaceId/recover", async (request, response) => {
    try {
      const workspaceId = routeParam(request.params.workspaceId);
      const result = await adapter.restoreWorkspaceFromBackup(workspaceId);
      const mediaSources = Object.fromEntries(result.workspace.videoClips.map((clip) => [
        clip.mediaId,
        `/api/workspaces/${encodeURIComponent(workspaceId)}/media/${encodeURIComponent(clip.mediaId)}`,
      ]));
      response.json({ ...result, backupAvailable: true, mediaSources });
    } catch (error) { sendWorkspaceError(response, error); }
  });

  router.patch("/workspaces/:workspaceId", async (request, response) => {
    try {
      const nextId = typeof request.body?.name === "string" ? request.body.name : request.body?.id;
      if (typeof nextId !== "string") {
        response.status(400).json({ code: "invalid_project", message: "请提供新的工作区名称" });
        return;
      }
      await adapter.renameWorkspace(routeParam(request.params.workspaceId), nextId);
      const workspaceId = routeParam(request.params.workspaceId);
      response.json({ id: workspaceId, name: nextId.trim(), ok: true });
    } catch (error) { sendWorkspaceError(response, error); }
  });

  router.delete("/workspaces/:workspaceId", async (request, response) => {
    try {
      await adapter.deleteWorkspace(routeParam(request.params.workspaceId));
      response.status(204).end();
    } catch (error) { sendWorkspaceError(response, error); }
  });

  router.get("/workspaces/:workspaceId/media", async (request, response) => {
    try { response.json(await adapter.listMedia(routeParam(request.params.workspaceId))); } catch (error) { sendWorkspaceError(response, error); }
  });

  router.post("/workspaces/:workspaceId/media", upload.single("file"), async (request: Request, response: Response) => {
    try {
      const file = request.file;
      if (!file || !file.mimetype.startsWith("video/")) {
        response.status(400).json({ code: "invalid_media", message: "请选择要导入的视频文件" });
        return;
      }
      response.status(201).json(await adapter.importMedia(routeParam(request.params.workspaceId), {
        buffer: file.buffer,
        metadata: readUploadMetadata(request.body ?? {}),
        mimeType: file.mimetype,
        originalName: file.originalname,
        size: file.size,
      }));
    } catch (error) { sendWorkspaceError(response, error); }
  });

  router.patch("/workspaces/:workspaceId/media/:mediaId", async (request, response) => {
    try {
      const name = request.body?.name;
      if (typeof name !== "string" || !name.trim()) {
        response.status(400).json({ code: "invalid_media", message: "素材名称不能为空" });
        return;
      }
      response.json(await adapter.renameMedia(routeParam(request.params.workspaceId), routeParam(request.params.mediaId), name));
    } catch (error) { sendWorkspaceError(response, error); }
  });

  router.delete("/workspaces/:workspaceId/media/:mediaId", async (request, response) => {
    try {
      await adapter.deleteMedia(routeParam(request.params.workspaceId), routeParam(request.params.mediaId));
      response.status(204).end();
    } catch (error) { sendWorkspaceError(response, error); }
  });

  router.post("/workspaces/:workspaceId/media/:mediaId/relink", upload.single("file"), async (request: Request, response: Response) => {
    try {
      const file = request.file;
      if (!file || !file.mimetype.startsWith("video/")) {
        response.status(400).json({ code: "invalid_media", message: "请选择视频文件重新关联" });
        return;
      }
      response.json(await adapter.relinkMedia(routeParam(request.params.workspaceId), routeParam(request.params.mediaId), {
        buffer: file.buffer,
        mimeType: file.mimetype,
        originalName: file.originalname,
        size: file.size,
      }));
    } catch (error) { sendWorkspaceError(response, error); }
  });

  router.post("/workspaces/:workspaceId/media/:mediaId/relink/undo", async (request, response) => {
    try { response.json(await adapter.undoRelinkMedia(routeParam(request.params.workspaceId), routeParam(request.params.mediaId))); } catch (error) { sendWorkspaceError(response, error); }
  });

  router.get("/workspaces/:workspaceId/media/:mediaId", async (request, response) => {
    try {
      const workspaceId = routeParam(request.params.workspaceId);
      const mediaPath = await adapter.getMediaPath(workspaceId, routeParam(request.params.mediaId));
      if (!mediaPath) {
        response.status(404).json({ code: "media_not_found", message: "找不到视频素材" });
        return;
      }
      response.sendFile(mediaPath);
    } catch (error) { sendWorkspaceError(response, error); }
  });

  return router;
}
