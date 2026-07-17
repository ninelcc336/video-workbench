import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import { createWorkspaceAdapter } from "./workspace-adapter";
import { mediaAssetPath } from "./workspace-paths";

const temporaryRoots: string[] = [];

async function createTestAdapter() {
  const root = await mkdtemp(join(tmpdir(), "video-effect-media-"));
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

describe("素材仓储", () => {
  it("将导入媒体复制到工作区 media 目录并返回素材资产", async () => {
    const { adapter, root } = await createTestAdapter();
    const sourcePath = join(root, "source.mp4");
    await writeFile(sourcePath, "fake video bytes");

    const asset = await adapter.importMedia({
      path: sourcePath,
      originalName: "旅行片段.mp4",
      mimeType: "video/mp4",
    });

    expect(asset.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(asset.originalName).toBe("旅行片段.mp4");
    expect(asset.relativePath).toBe(`media/${asset.id}${extname(asset.fileName)}`);
    await expect(readFile(join(root, asset.relativePath), "utf8")).resolves.toBe(
      "fake video bytes",
    );
  });

  it("清理媒体原始文件名中的路径片段，避免写出 media 目录", async () => {
    const { adapter } = await createTestAdapter();
    const asset = await adapter.importMedia({
      buffer: Buffer.from("fake image bytes"),
      originalName: "../../outside.png",
      mimeType: "image/png",
    });

    expect(asset.fileName).toBe(`${asset.id}.png`);
    expect(mediaAssetPath(adapter.getPaths(), asset.id, ".png")).toContain(
      adapter.getPaths().media,
    );
  });

  it("项目引用的素材缺失时返回可展示错误", async () => {
    const { adapter, root } = await createTestAdapter();
    const sourcePath = join(root, "source.mov");
    await writeFile(sourcePath, "fake movie bytes");
    const asset = await adapter.importMedia({
      path: sourcePath,
      originalName: "source.mov",
      mimeType: "video/quicktime",
    });
    const project = createEmptyProject();
    project.videoClips.push({
      id: "clip-1",
      mediaId: asset.id,
      fromFrame: 0,
      sourceStartFrame: 0,
      durationInFrames: 30,
      audioEnabled: true,
    });
    await adapter.saveProject(project, "missing-media");
    await unlink(join(root, asset.relativePath));

    await expect(adapter.loadProject("missing-media")).resolves.toEqual(project);
    await expect(adapter.loadProjectWithMediaStatus("missing-media")).resolves.toMatchObject({
      project,
      missingMediaIds: [asset.id],
    });
  });

  it("为 Remotion 返回跨进程可读取的 file URL", async () => {
    const { adapter, root } = await createTestAdapter();
    const sourcePath = join(root, "source.mp4");
    await writeFile(sourcePath, "real media bytes");
    const asset = await adapter.importMedia({ path: sourcePath, originalName: "source.mp4", mimeType: "video/mp4" });

    await expect(adapter.getMediaSources([asset.id])).resolves.toEqual({
      [asset.id]: pathToFileURL(join(root, asset.relativePath)).href,
    });
  });
});
// 中文注释：验证素材复制、元数据和缺失素材检测。
