import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import { createEditorStore } from "../../domain/editor/editor-store";
import { applyVideoTemplate, type VideoTemplate } from "../../domain/assets/video-template-model";
import { createWorkspaceAdapter } from "./workspace-adapter";
import { projectFilePath } from "./workspace-paths";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createAdapter() {
  // 中文注释：每个用例使用独立临时工作区，避免项目和素材文件互相污染。
  const root = await mkdtemp(join(tmpdir(), "video-effect-mvp-"));
  roots.push(root);
  const adapter = createWorkspaceAdapter(root);
  await adapter.createWorkspace();
  return { adapter, root };
}

describe("MVP 工作区恢复与项目生命周期", () => {
  it("保存第二个版本后保留备份，并能恢复损坏的正式项目", async () => {
    const { adapter, root } = await createAdapter();
    const first = createEmptyProject();
    const second = createEmptyProject({ width: 1920, height: 1080 });
    await adapter.saveProject("recoverable", first);
    await adapter.saveProject("recoverable", second);
    await writeFile(projectFilePath(adapter.getPaths(), "recoverable"), "损坏", "utf8");

    await expect(adapter.loadProjectFromBackup("recoverable")).resolves.toEqual(first);
    await expect(adapter.restoreProjectFromBackup("recoverable")).resolves.toEqual(first);
    await expect(adapter.loadProject("recoverable")).resolves.toEqual(first);
    expect(root).toContain("video-effect-mvp-");
  });

  it("项目重命名和删除只影响项目记录", async () => {
    const { adapter } = await createAdapter();
    await adapter.saveProject("original", createEmptyProject());
    await adapter.renameProject("original", "renamed");
    await adapter.deleteProject("renamed");
    await expect(adapter.loadProject("original")).rejects.toMatchObject({ code: "project_not_found" });
    await expect(adapter.loadProject("renamed")).rejects.toMatchObject({ code: "project_not_found" });
  });

  it("重新关联沿用稳定素材 ID，引用中的素材禁止删除", async () => {
    const { adapter, root } = await createAdapter();
    const oldPath = join(root, "old.mp4");
    const nextPath = join(root, "next.mp4");
    await writeFile(oldPath, "old");
    await writeFile(nextPath, "new");
    const asset = await adapter.importMedia({ path: oldPath, originalName: "old.mp4", mimeType: "video/mp4" });
    const project = createEmptyProject();
    project.videoClips.push({ id: "video-1", mediaId: asset.id, fromFrame: 0, sourceStartFrame: 0, durationInFrames: 30, audioEnabled: true });
    await adapter.saveProject("uses-media", project);
    await expect(adapter.deleteMedia(asset.id)).rejects.toMatchObject({ code: "media_in_use" });
    const relinked = await adapter.relinkMedia(asset.id, { path: nextPath, originalName: "next.mp4", mimeType: "video/mp4" });
    expect(relinked.id).toBe(asset.id);
    await unlink(oldPath);
  });
});

describe("MVP 视频模板原子套用", () => {
  it("跨帧率保持秒数位置，并用一次撤销移除整套片段", () => {
    const project = createEmptyProject({ fps: 60 });
    const store = createEditorStore(project);
    const template: VideoTemplate = {
      id: "template-1",
      name: "节奏模板",
      fps: 30,
        effectClips: [{
          templateId: "emphasis-card",
          templateVersion: 1,
          effectFamilyId: "emphasis-card",
          startingStyleId: "solid-card",
          placement: { type: "range" },
          trackId: "effects-1",
          fromFrame: 30,
          durationInFrames: 30,
          params: {},
        }],
    };
    applyVideoTemplate(store, template, 60, (index) => `generated-${index}`);
    expect(store.getSnapshot().effectClips[0]).toMatchObject({ fromFrame: 120, durationInFrames: 60 });
    store.undo();
    expect(store.getSnapshot().effectClips).toEqual([]);
  });
});
