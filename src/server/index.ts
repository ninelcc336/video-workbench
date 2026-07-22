import express from "express";
import { getHealthStatus } from "./health";
import { createRenderRouter } from "./render/render-routes";
import { createWorkspaceAdapter, getFixedProjectLibraryRoot, WorkspaceError } from "./workspace/workspace-adapter";
import { createWorkspaceRouter } from "./workspace/workspace-routes";
import { WorkspaceRegistry } from "./workspace/workspace-registry";

const app = express();
const port = Number(process.env.PORT ?? 4173);
const recentWorkspaces = await new WorkspaceRegistry().list();
// 中文注释：旧最近目录仅在升级时提供一次性迁移来源，应用之后始终使用固定本地项目库。
const workspace = createWorkspaceAdapter(getFixedProjectLibraryRoot());
let projectLibraryInitializationError: WorkspaceError | null = null;

/** 中文注释：启动与重试复用同一初始化流程，迁移失败时服务仍存活并把错误交给页面恢复。 */
async function initializeProjectLibrary(): Promise<void> {
  try {
    await workspace.initializeFixedProjectLibrary(recentWorkspaces.map((workspace) => workspace.rootPath));
    projectLibraryInitializationError = null;
  } catch (error) {
    projectLibraryInitializationError = error instanceof WorkspaceError
      ? error
      : new WorkspaceError("project_library_unavailable", "本地项目库暂时不可用，请检查数据后重试", error);
    throw projectLibraryInitializationError;
  }
}

await initializeProjectLibrary().catch(() => undefined);

app.use(express.json());
app.get("/api/health", (_request, response) => {
  response.json(getHealthStatus());
});
app.use("/api/workspace", createWorkspaceRouter(workspace, {
  getInitializationError: () => projectLibraryInitializationError,
  retryInitialization: initializeProjectLibrary,
}));
app.use(createRenderRouter({ workspace }));
const server = app.listen(port, () => console.log(`本地视频特效服务已启动：http://localhost:${port}`));

// 中文注释：保持 CLI 进程存活，直到 HTTP 服务被外部关闭。
const keepAlive = setInterval(() => undefined, 2 ** 31 - 1);
server.once("close", () => clearInterval(keepAlive));
