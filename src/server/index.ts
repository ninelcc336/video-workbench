import express from "express";
import { join } from "node:path";
import { getHealthStatus } from "./health";
import { createRenderRouter } from "./render/render-routes";
import { createWorkspaceAdapter } from "./workspace/workspace-adapter";
import { createWorkspaceRouter } from "./workspace/workspace-routes";
import { WorkspaceRegistry } from "./workspace/workspace-registry";

const app = express();
const port = Number(process.env.PORT ?? 4173);
const recentWorkspaces = await new WorkspaceRegistry().list();
const workspace = createWorkspaceAdapter(recentWorkspaces[0]?.rootPath ?? join(process.cwd(), "workspace"));

app.use(express.json());
app.get("/api/health", (_request, response) => {
  response.json(getHealthStatus());
});
app.use("/api/workspace", createWorkspaceRouter(workspace));
app.use(createRenderRouter({ workspace }));

// 中文注释：首次启动没有最近工作区时不静默创建默认目录，由启动页要求用户明确选择。
if (recentWorkspaces[0]) await workspace.createWorkspace();
const server = app.listen(port, () => console.log(`本地视频特效服务已启动：http://localhost:${port}`));

// 中文注释：保持 CLI 进程存活，直到 HTTP 服务被外部关闭。
const keepAlive = setInterval(() => undefined, 2 ** 31 - 1);
server.once("close", () => clearInterval(keepAlive));
