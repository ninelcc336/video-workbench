import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import {
  bootstrapFixedProjectLibrary,
  createWorkspaceAdapter,
} from "./workspace-adapter";

const temporaryRoots: string[] = [];

/** 中文注释：每个用例创建独立临时目录，确保固定项目库迁移不污染开发机数据。 */
async function createTemporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("固定本地项目库初始化", () => {
  it("首次启动自动建立固定项目库的全部资产目录", async () => {
    const applicationRoot = await createTemporaryRoot("video-effect-fixed-library-");

    const adapter = await bootstrapFixedProjectLibrary({ applicationRoot });

    await Promise.all([
      stat(adapter.getPaths().projects),
      stat(adapter.getPaths().media),
      stat(adapter.getPaths().presets),
      stat(adapter.getPaths().videoTemplates),
      stat(adapter.getPaths().renders),
    ]).then((directories) => directories.forEach((directory) => expect(directory.isDirectory()).toBe(true)));
  });

  it("迁移旧目录型数据时保留项目对共享视频素材的引用", async () => {
    const applicationRoot = await createTemporaryRoot("video-effect-fixed-library-");
    const legacyRoot = await createTemporaryRoot("video-effect-legacy-library-");
    const legacyAdapter = createWorkspaceAdapter(legacyRoot);
    await legacyAdapter.createWorkspace();
    const sourcePath = join(legacyRoot, "source.mp4");
    await writeFile(sourcePath, "视频素材");
    const asset = await legacyAdapter.importMedia({
      mimeType: "video/mp4",
      originalName: "source.mp4",
      path: sourcePath,
    });
    const project = createEmptyProject();
    project.videoClips.push({
      audioEnabled: true,
      durationInFrames: 30,
      fromFrame: 0,
      id: "clip-1",
      mediaId: asset.id,
      sourceStartFrame: 0,
    });
    await legacyAdapter.createProject("旧编辑项目", project);

    const adapter = await bootstrapFixedProjectLibrary({ applicationRoot, legacyRoots: [legacyRoot] });

    await expect(adapter.loadProject("旧编辑项目")).resolves.toEqual(project);
    await expect(adapter.getMediaAsset(asset.id)).resolves.toMatchObject({ id: asset.id });
    await expect(readFile(join(adapter.getPaths().root, asset.relativePath), "utf8")).resolves.toBe("视频素材");
  });

  it("旧项目损坏时返回可恢复错误且不静默建立空项目库", async () => {
    const applicationRoot = await createTemporaryRoot("video-effect-fixed-library-");
    const legacyRoot = await createTemporaryRoot("video-effect-legacy-library-");
    const legacyAdapter = createWorkspaceAdapter(legacyRoot);
    await legacyAdapter.createWorkspace();
    await writeFile(join(legacyAdapter.getPaths().projects, "损坏项目.json"), "不是 JSON", "utf8");

    await expect(bootstrapFixedProjectLibrary({ applicationRoot, legacyRoots: [legacyRoot] })).rejects.toMatchObject({
      code: "corrupt_project",
      message: expect.stringContaining("项目"),
    });
    await expect(stat(join(applicationRoot, "workspace", "projects"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
