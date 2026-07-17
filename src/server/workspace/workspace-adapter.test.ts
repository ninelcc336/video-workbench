import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import {
  createWorkspaceAdapter,
  type WorkspaceAdapter,
} from "./workspace-adapter";
import {
  getWorkspacePaths,
  mediaAssetPath,
  projectFilePath,
} from "./workspace-paths";

const temporaryRoots: string[] = [];

async function createTestAdapter(): Promise<WorkspaceAdapter> {
  const root = await mkdtemp(join(tmpdir(), "video-effect-workspace-"));
  temporaryRoots.push(root);
  const adapter = createWorkspaceAdapter(root);
  await adapter.createWorkspace();
  return adapter;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("本地工作区适配器", () => {
  it("创建约定的五类工作区目录", async () => {
    const adapter = await createTestAdapter();
    const paths = adapter.getPaths();

    await expect(readFile(join(paths.root, "projects"))).rejects.toMatchObject({
      code: "EISDIR",
    });
    await expect(readFile(join(paths.projects, ".keep"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    for (const directory of [
      paths.projects,
      paths.media,
      paths.presets,
      paths.videoTemplates,
      paths.renders,
    ]) {
      await expect(readFile(directory)).rejects.toMatchObject({ code: "EISDIR" });
    }
  });

  it("只允许由安全 ID 生成工作区内的项目和素材路径", () => {
    const paths = getWorkspacePaths("C:/video-effect-workspace");

    expect(projectFilePath(paths, "demo")).toBe(
      resolve(paths.projects, "demo.json"),
    );
    expect(mediaAssetPath(paths, "asset-1", ".mp4")).toBe(
      resolve(paths.media, "asset-1.mp4"),
    );
    expect(() => projectFilePath(paths, "../escape")).toThrowError(/路径/);
    expect(() => mediaAssetPath(paths, "nested/escape", ".mp4")).toThrowError(
      /路径/,
    );
  });

  it("保存项目时不接受工作区外的项目 ID", async () => {
    const adapter = await createTestAdapter();

    await expect(
      adapter.saveProject(createEmptyProject(), "../outside"),
    ).rejects.toMatchObject({ code: "unsafe_path" });
  });
});
