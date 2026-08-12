import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import {
  bootstrapFixedProjectLibrary,
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

});
