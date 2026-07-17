import { Router, type Request, type Response } from "express";
import multer from "multer";
import type { EditProject } from "../../domain/project/model";
import { WorkspaceAdapter, WorkspaceError } from "./workspace-adapter";

function sendWorkspaceError(response: Response, error: unknown): void {
  if (error instanceof WorkspaceError) {
    const status =
      error.code === "project_not_found" || error.code === "media_not_found" ? 404 : 400;
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
      response.json({ ok: true });
    } catch (error) {
      sendWorkspaceError(response, error);
    }
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
      const result = await adapter.loadProjectWithMediaStatus(routeParam(request.params.projectId));
      const mediaSources = Object.fromEntries(
        result.project.videoClips.map((clip) => [
          clip.mediaId,
          `/api/workspace/media/${encodeURIComponent(clip.mediaId)}`,
        ]),
      );
      response.json({ ...result, mediaSources });
    } catch (error) {
      sendWorkspaceError(response, error);
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

  router.post("/media", upload.single("file"), async (request: Request, response: Response) => {
    try {
      const uploadedFile = request.file;
      if (!uploadedFile) {
        response.status(400).json({ code: "invalid_media", message: "请选择要导入的视频文件" });
        return;
      }
      const asset = await adapter.importMedia({
        buffer: uploadedFile.buffer,
        mimeType: uploadedFile.mimetype,
        originalName: uploadedFile.originalname,
        size: uploadedFile.size,
      });
      response.status(201).json(asset);
    } catch (error) {
      sendWorkspaceError(response, error);
    }
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
