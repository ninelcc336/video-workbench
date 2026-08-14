import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanupStaleRemotionBundleSessions,
  cleanupStaleRemotionChromiumProfiles,
  cleanupNewRemotionChromiumProfiles,
  createRemotionBundleSession,
  getRemotionServeUrl,
  resetRemotionBundle,
  snapshotRemotionChromiumProfiles,
} from "./remotion-bundler";

afterEach(() => resetRemotionBundle());

describe("Remotion 自动 bundle", () => {
  it("首次渲染自动 bundle，后续调用复用同一个 serve URL", async () => {
    const bundle = vi.fn(async () => "file:///tmp/remotion-bundle");

    await expect(getRemotionServeUrl(bundle)).resolves.toBe("file:///tmp/remotion-bundle");
    await expect(getRemotionServeUrl(bundle)).resolves.toBe("file:///tmp/remotion-bundle");

    expect(bundle).toHaveBeenCalledTimes(1);
    const firstCall = bundle.mock.calls[0] as unknown as [{ entryPoint: string }];
    expect(firstCall[0].entryPoint).toMatch(/src[\\/]remotion[\\/]entry\.tsx$/);
  });

  it("bundle 失败时保留明确错误，不伪造 serve URL", async () => {
    const bundle = vi.fn(async () => {
      throw new Error("Webpack 配置失败");
    });

    await expect(getRemotionServeUrl(bundle)).rejects.toThrow("Remotion 自动打包失败：Webpack 配置失败");
  });

  it("视觉验证 bundle 使用受控目录，并且清理操作可重复调用", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "effect-bundle-root-"));
    const bundle = vi.fn(async ({ outDir }: { outDir?: string }) => {
      if (!outDir) throw new Error("缺少 bundle 输出目录");
      await writeFile(join(outDir, "index.html"), "bundle");
      return `file://${outDir}`;
    });

    try {
      const session = await createRemotionBundleSession(bundle, rootDirectory);

      expect(session.directory.startsWith(rootDirectory)).toBe(true);
      expect(bundle).toHaveBeenCalledWith(expect.objectContaining({
        enableCaching: true,
        outDir: session.directory,
      }));
      await session.cleanup();
      await session.cleanup();
      await expect(access(session.directory)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(rootDirectory, { force: true, recursive: true });
    }
  });

  it("只清理受控目录中超过保留期限的运行目录", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "effect-bundle-root-"));
    const staleDirectory = await mkdtemp(join(rootDirectory, "run-"));
    const freshDirectory = await mkdtemp(join(rootDirectory, "run-"));
    const unrelatedDirectory = await mkdtemp(join(rootDirectory, "keep-"));

    try {
      const oldTime = new Date(Date.now() - 60_000);
      const { utimes } = await import("node:fs/promises");
      await utimes(staleDirectory, oldTime, oldTime);
      await cleanupStaleRemotionBundleSessions(rootDirectory, 1_000);

      await expect(access(staleDirectory)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(access(freshDirectory)).resolves.toBeUndefined();
      await expect(access(unrelatedDirectory)).resolves.toBeUndefined();
    } finally {
      await rm(rootDirectory, { force: true, recursive: true });
    }
  });

  it("只清理本次运行新增的 Chromium profile", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "effect-chrome-profile-root-"));
    const existingProfile = await mkdtemp(join(temporaryDirectory, "puppeteer_dev_chrome_profile-"));
    const unrelatedDirectory = await mkdtemp(join(temporaryDirectory, "keep-"));

    try {
      const existingProfiles = await snapshotRemotionChromiumProfiles(temporaryDirectory);
      const createdProfile = await mkdtemp(join(temporaryDirectory, "puppeteer_dev_chrome_profile-"));
      const remainingProfiles = await cleanupNewRemotionChromiumProfiles(existingProfiles, temporaryDirectory);

      expect(remainingProfiles).toEqual([]);
      await expect(access(existingProfile)).resolves.toBeUndefined();
      await expect(access(createdProfile)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(access(unrelatedDirectory)).resolves.toBeUndefined();
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  it("清理超过保留期限的历史 Chromium profile，但保留近期和无关目录", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "effect-chrome-profile-root-"));
    const staleProfile = await mkdtemp(join(temporaryDirectory, "puppeteer_dev_chrome_profile-"));
    const freshProfile = await mkdtemp(join(temporaryDirectory, "puppeteer_dev_chrome_profile-"));
    const unrelatedDirectory = await mkdtemp(join(temporaryDirectory, "keep-"));

    try {
      const oldTime = new Date(Date.now() - 60_000);
      const { utimes } = await import("node:fs/promises");
      await utimes(staleProfile, oldTime, oldTime);
      await cleanupStaleRemotionChromiumProfiles(temporaryDirectory, 1_000);

      await expect(access(staleProfile)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(access(freshProfile)).resolves.toBeUndefined();
      await expect(access(unrelatedDirectory)).resolves.toBeUndefined();
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
