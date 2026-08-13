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
  // 中文注释：项目名称是用户可见标识，仓储负责消除首尾空格并阻止 Windows 下的大小写冲突。
  it("创建项目时规范名称并拒绝大小写不敏感的重复名称", async () => {
    const { adapter } = await createTestAdapter();
    const project = createEmptyProject();

    await adapter.createProject("  Demo  ", project);

    await expect(adapter.loadProject("Demo")).resolves.toEqual(project);
    await expect(adapter.createProject("demo", project)).rejects.toMatchObject({
      code: "project_exists",
    });
  });

  it("拒绝 Windows 路径中不安全的保留名和尾随字符", async () => {
    const { adapter } = await createTestAdapter();
    const project = createEmptyProject();

    await expect(adapter.createProject("CON", project)).rejects.toMatchObject({ code: "unsafe_path" });
    await expect(adapter.createProject("知识视频.", project)).rejects.toMatchObject({ code: "unsafe_path" });
    await expect(adapter.createProject("知识:视频", project)).rejects.toMatchObject({ code: "unsafe_path" });
  });

  // 中文注释：项目列表按最近更新时间排序，删除当前项目后调用方可直接选择列表首项继续编辑。
  it("按最近更新时间倒序列出编辑项目", async () => {
    const { adapter } = await createTestAdapter();
    const project = createEmptyProject();

    await adapter.createProject("较早项目", project);
    await new Promise((resolve) => setTimeout(resolve, 15));
    await adapter.createProject("较新项目", project);

    await expect(adapter.listProjects()).resolves.toEqual([
      expect.objectContaining({ id: "较新项目" }),
      expect.objectContaining({ id: "较早项目" }),
    ]);
  });

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

  it("拒绝读取缺少新版元数据的旧特效片段并提示重建", async () => {
    const { adapter, root } = await createTestAdapter();
    const paths = getWorkspacePaths(root);
    const legacyProject = {
      ...createEmptyProject(),
      effectClips: [
        {
          id: "legacy-transition",
          templateId: "directional-transition",
          templateVersion: 1,
          trackId: "effects-1",
          fromFrame: 45,
          durationInFrames: 15,
          params: { style: "fade", color: "#000000" },
        },
      ],
    };
    await writeFile(
      projectFilePath(paths, "legacy-effects"),
      `${JSON.stringify(legacyProject, null, 2)}\n`,
      "utf8",
    );

    await expect(adapter.loadProject("legacy-effects")).rejects.toMatchObject({
      code: "corrupt_project",
      message: expect.stringContaining("重建视频工作区"),
    });
    expect(JSON.parse(await readFile(projectFilePath(paths, "legacy-effects"), "utf8"))).toEqual(legacyProject);
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
// 中文注释：验证项目 JSON 的原子保存和损坏处理。
