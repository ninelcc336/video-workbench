import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import type { EditProject } from "../../domain/project/model";
import { createWorkspaceAdapter } from "./workspace-adapter";
import { getWorkspacePaths, projectFilePath } from "./workspace-paths";

const temporaryRoots: string[] = [];

async function createTestAdapter() {
  const root = await mkdtemp(join(tmpdir(), "video-effect-project-"));
  temporaryRoots.push(root);
  const adapter = createWorkspaceAdapter(root);
  await adapter.createWorkspace();
  return { adapter, root };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("项目仓储", () => {
  it("保存并重新加载相同的 EditProject 快照", async () => {
    const { adapter } = await createTestAdapter();
    const project = createEmptyProject({ width: 1920, height: 1080 });

    await adapter.saveProject(project, "knowledge-video");

    await expect(adapter.loadProject("knowledge-video")).resolves.toEqual(project);
    await adapter.saveProject(
      { ...project, settings: { ...project.settings, fps: 24 } },
      "knowledge-video",
    );
    await expect(adapter.loadProject("knowledge-video")).resolves.toMatchObject({
      settings: { fps: 24 },
    });
    await expect(adapter.listProjects()).resolves.toEqual([
      expect.objectContaining({ id: "knowledge-video", fileName: "knowledge-video.json" }),
    ]);
  });

  it("使用临时文件替换项目 JSON，并且不留下临时文件", async () => {
    const { adapter, root } = await createTestAdapter();
    const project = createEmptyProject();
    const paths = getWorkspacePaths(root);

    await adapter.saveProject(project, "atomic");

    const projectDirectory = await readFile(projectFilePath(paths, "atomic"), "utf8");
    expect(JSON.parse(projectDirectory)).toEqual(project);
    await expect(readFile(join(paths.projects, "atomic.json.tmp"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("损坏 JSON 返回可展示的项目错误", async () => {
    const { adapter, root } = await createTestAdapter();
    const paths = getWorkspacePaths(root);
    await writeFile(projectFilePath(paths, "broken"), "不是 JSON", "utf8");

    await expect(adapter.loadProject("broken")).rejects.toMatchObject({
      code: "corrupt_project",
      message: expect.stringContaining("项目"),
    });
  });

  it("不保存不符合 EditProject 结构的 JSON", async () => {
    const { adapter } = await createTestAdapter();
    const invalidProject = { schemaVersion: 1 } as unknown as EditProject;

    await expect(adapter.saveProject(invalidProject, "invalid")).rejects.toMatchObject({
      code: "invalid_project",
    });
  });
});
