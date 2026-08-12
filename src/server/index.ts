import express from "express";
import { getHealthStatus } from "./health";
import { createRenderRouter } from "./render/render-routes";
import { getFixedProjectLibraryRoot } from "./workspace/workspace-adapter";
import { VideoWorkspaceAdapter } from "./workspace/video-workspace-adapter";
import { createVideoWorkspaceRouter } from "./workspace/video-workspace-routes";
import { WorkspaceError } from "./workspace/workspace-paths";

const app = express();
const port = Number(process.env.PORT ?? 4173);
const libraryRoot = getFixedProjectLibraryRoot();
const workspace = new VideoWorkspaceAdapter(libraryRoot);
let workspaceInitializationError: WorkspaceError | null = null;

/** 中文注释：启动时只初始化当前工作区库；开发期旧共享项目不会被自动读取或迁移。 */
async function initializeVideoWorkspaces(): Promise<void> {
  try {
    await workspace.initialize();
    workspaceInitializationError = null;
  } catch (error) {
    workspaceInitializationError = error instanceof WorkspaceError
      ? error
      : new WorkspaceError("project_library_unavailable", "视频工作区暂时不可用，请检查数据后重试", error);
    throw workspaceInitializationError;
  }
}

await initializeVideoWorkspaces().catch(() => undefined);

app.use(express.json());
app.get("/api/health", (_request, response) => {
  response.json(getHealthStatus());
});
app.use("/api", createVideoWorkspaceRouter(workspace));
app.use(createRenderRouter({ workspace }));
const server = app.listen(port, () => console.log(`本地视频特效服务已启动：http://localhost:${port}`));

// 中文注释：保持 CLI 进程存活，直到 HTTP 服务被外部关闭。
const keepAlive = setInterval(() => undefined, 2 ** 31 - 1);
server.once("close", () => clearInterval(keepAlive));
