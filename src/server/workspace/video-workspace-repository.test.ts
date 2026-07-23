import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import { createWorkspaceAdapter } from "./workspace-adapter";
import { VideoWorkspaceAdapter } from "./video-workspace-adapter";
import { VideoWorkspaceRepository } from "./video-workspace-repository";

const temporaryRoots: string[] = [];

/** 中文注释：为每个用例创建独立目录，避免迁移测试碰到开发机上的真实视频数据。 */
async function createTemporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("视频工作区仓储", () => {
  it("为每个工作区建立独立的素材目录", async () => {
    const root = await createTemporaryRoot("isolated-video-workspaces-");
    const repository = new VideoWorkspaceRepository(root);
    await repository.initialize();
    await repository.createWorkspace("视频 A", createEmptyProject());
    await repository.createWorkspace("视频 B", createEmptyProject());

    const mediaA = repository.getMediaRepository("视频 A");
    const mediaB = repository.getMediaRepository("视频 B");
    const source = join(root, "source.mp4");
    await writeFile(source, "视频 A 的素材");

    const asset = await mediaA.importMedia({ mimeType: "video/mp4", originalName: "source.mp4", path: source });

    await expect(mediaA.getMediaAsset(asset.id)).resolves.toMatchObject({ id: asset.id });
    await expect(mediaB.getMediaAsset(asset.id)).resolves.toBeNull();
    expect((await stat(join(repository.getWorkspacePaths("视频 A").media, asset.fileName))).isFile()).toBe(true);
  });

  it("迁移共享素材时为每个引用工作区复制一份文件", async () => {
    const legacyRoot = await createTemporaryRoot("legacy-shared-library-");
    const destinationRoot = await createTemporaryRoot("isolated-video-workspaces-");
    const legacy = createWorkspaceAdapter(legacyRoot);
    await legacy.createWorkspace();
    const source = join(legacyRoot, "shared.mp4");
    await writeFile(source, "旧共享素材");
    const asset = await legacy.importMedia({ mimeType: "video/mp4", originalName: "shared.mp4", path: source });
    const project = createEmptyProject();
    project.videoClips.push({ audioEnabled: true, durationInFrames: 30, fromFrame: 0, id: "clip", mediaId: asset.id, sourceStartFrame: 0 });
    await legacy.createProject("视频 A", project);
    await legacy.createProject("视频 B", project);

    const repository = new VideoWorkspaceRepository(destinationRoot);
    await repository.migrateLegacyLibrary(legacy.getPaths());

    await expect(repository.loadWorkspace("视频 A")).resolves.toEqual(project);
    await expect(repository.loadWorkspace("视频 B")).resolves.toEqual(project);
    await expect(repository.getMediaRepository("视频 A").getMediaAsset(asset.id)).resolves.toMatchObject({ id: asset.id });
    await expect(repository.getMediaRepository("视频 B").getMediaAsset(asset.id)).resolves.toMatchObject({ id: asset.id });
    expect(repository.getWorkspacePaths("视频 A").media).not.toBe(repository.getWorkspacePaths("视频 B").media);
  });

  it("旧数据迁移失败时不留下半完成工作区，并保留原始数据供修复后重试", async () => {
    const legacyRoot = await createTemporaryRoot("legacy-shared-library-");
    const destinationRoot = await createTemporaryRoot("isolated-video-workspaces-");
    const legacy = createWorkspaceAdapter(legacyRoot);
    await legacy.createWorkspace();
    const validProject = createEmptyProject();
    await legacy.createProject("可迁移视频", validProject);
    const corruptProjectPath = join(legacy.getPaths().projects, "损坏视频.json");
    await writeFile(corruptProjectPath, "{损坏快照", "utf8");

    const repository = new VideoWorkspaceRepository(destinationRoot);
    await expect(repository.migrateLegacyLibrary(legacy.getPaths())).rejects.toMatchObject({ code: "corrupt_project" });
    await expect(repository.listWorkspaces()).resolves.toEqual([]);
    await expect(readFile(corruptProjectPath, "utf8")).resolves.toBe("{损坏快照");
  });

  it("工作区内删除素材不会扫描其他工作区，但会保护自己的时间轴引用", async () => {
    const root = await createTemporaryRoot("isolated-video-workspaces-");
    const adapter = new VideoWorkspaceAdapter(root);
    await adapter.initialize();
    await adapter.createWorkspace("视频 A", createEmptyProject());
    await adapter.createWorkspace("视频 B", createEmptyProject());
    const source = join(root, "clip.mp4");
    await writeFile(source, "视频 B 的素材");
    const asset = await adapter.importMedia("视频 B", { mimeType: "video/mp4", originalName: "clip.mp4", path: source });

    await expect(adapter.deleteMedia("视频 A", asset.id)).rejects.toMatchObject({ code: "media_not_found" });
    await adapter.deleteMedia("视频 B", asset.id);
    await expect(adapter.getMediaAsset("视频 B", asset.id)).resolves.toBeNull();
  });

  it("重命名工作区时不移动私有目录，仍保留正在使用的时间轴和素材", async () => {
    const root = await createTemporaryRoot("isolated-video-workspaces-");
    const adapter = new VideoWorkspaceAdapter(root);
    await adapter.initialize();
    await adapter.createWorkspace("原视频", createEmptyProject());
    const source = join(root, "rename.mp4");
    await writeFile(source, "重命名后仍存在的素材");
    const asset = await adapter.importMedia("原视频", { mimeType: "video/mp4", originalName: "rename.mp4", path: source });
    const workspace = createEmptyProject();
    workspace.videoClips.push({ audioEnabled: true, durationInFrames: 30, fromFrame: 0, id: "video-1", mediaId: asset.id, sourceStartFrame: 0 });
    await adapter.saveWorkspace("原视频", workspace);

    await adapter.renameWorkspace("原视频", "新视频");

    await expect(adapter.loadWorkspace("原视频")).resolves.toEqual({ missingMediaIds: [], workspace });
    await expect(adapter.getMediaAsset("原视频", asset.id)).resolves.toMatchObject({ id: asset.id });
    await expect(adapter.listWorkspaces()).resolves.toEqual([expect.objectContaining({ id: "原视频", name: "新视频" })]);
    await expect(adapter.loadWorkspace("新视频")).rejects.toMatchObject({ code: "project_not_found" });
  });

  it("恢复损坏的工作区快照时只使用该工作区自己的最近备份", async () => {
    const root = await createTemporaryRoot("isolated-video-workspaces-");
    const repository = new VideoWorkspaceRepository(root);
    await repository.initialize();
    const workspaceA = createEmptyProject();
    const workspaceB = createEmptyProject();
    workspaceB.settings.fps = 24;
    await repository.createWorkspace("视频 A", workspaceA);
    await repository.createWorkspace("视频 B", workspaceB);

    const updatedWorkspaceA = createEmptyProject();
    updatedWorkspaceA.settings.fps = 25;
    await repository.saveWorkspace("视频 A", updatedWorkspaceA);
    await writeFile(join(repository.getWorkspacePaths("视频 A").root, "workspace.json"), "{损坏数据", "utf8");

    await expect(repository.loadWorkspace("视频 A")).rejects.toMatchObject({ code: "corrupt_project" });
    await expect(repository.hasWorkspaceBackup("视频 A")).resolves.toBe(true);
    await expect(repository.restoreWorkspaceFromBackup("视频 A")).resolves.toEqual(workspaceA);
    await expect(repository.loadWorkspace("视频 B")).resolves.toEqual(workspaceB);
    await expect(readFile(join(repository.getWorkspacePaths("视频 A").root, "workspace.json"), "utf8")).resolves.toContain('"fps": 30');
  });
});
