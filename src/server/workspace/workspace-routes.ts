import { Router, type Request, type Response } from "express";
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
      response.json(await adapter.loadProject(routeParam(request.params.projectId)));
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

  router.post("/media", async (request: Request, response: Response) => {
    try {
      const asset = await adapter.importMedia(request.body);
      response.status(201).json(asset);
    } catch (error) {
      sendWorkspaceError(response, error);
    }
  });

  return router;
}

export const registerWorkspaceRoutes = createWorkspaceRouter;
