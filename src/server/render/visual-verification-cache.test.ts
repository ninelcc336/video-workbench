import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  computeVisualVerificationSourceFingerprint,
  createVisualVerificationCaseFingerprint,
  getVisualVerificationBaselineSignature,
  loadVisualVerificationCache,
  saveVisualVerificationCache,
} from "./visual-verification-cache";

describe("视觉验证缓存", () => {
  it("源码发生变化时生成不同指纹，并排除测试文件变化", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "visual-cache-root-"));
    try {
      await mkdir(join(rootDirectory, "src/domain/templates"), { recursive: true });
      await writeFile(join(rootDirectory, "src/domain/templates/effect.ts"), "export const value = 1;\n");
      await writeFile(join(rootDirectory, "src/domain/templates/effect.test.ts"), "test(\"fixture\", () => {});\n");

      const firstFingerprint = await computeVisualVerificationSourceFingerprint(rootDirectory);
      await writeFile(join(rootDirectory, "src/domain/templates/effect.test.ts"), "test(\"changed\", () => {});\n");
      await expect(computeVisualVerificationSourceFingerprint(rootDirectory)).resolves.toBe(firstFingerprint);

      await writeFile(join(rootDirectory, "src/domain/templates/effect.ts"), "export const value = 2;\n");
      await expect(computeVisualVerificationSourceFingerprint(rootDirectory)).resolves.not.toBe(firstFingerprint);
    } finally {
      await rm(rootDirectory, { force: true, recursive: true });
    }
  });

  it("以源码指纹隔离缓存，并通过临时文件保存可恢复的案例条目", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "visual-cache-root-"));
    try {
      const cacheFile = join(rootDirectory, "test-results/.cache/visual-verification.json");
      const sourceFingerprint = "source-v1";
      const cache = await loadVisualVerificationCache(cacheFile, sourceFingerprint);
      const renderProps = {
        effectFamilyId: "family",
        effectFamilyVersion: 1,
        startingStyleId: "style",
        aspectRatio: "16:9" as const,
        frame: 0,
        fps: 30,
        width: 1920,
        height: 1080,
        durationInFrames: 60,
        params: { title: "缓存" },
        randomSeed: "seed",
      };
      cache.entries["family/style"] = {
        caseFingerprint: createVisualVerificationCaseFingerprint({
          id: "family/style",
          renderProps,
        }, "baseline.png"),
        baselineSignature: "1:2:3",
        verifiedAt: new Date().toISOString(),
      };
      await saveVisualVerificationCache(cacheFile, cache);

      const loaded = await loadVisualVerificationCache(cacheFile, sourceFingerprint);
      expect(loaded.entries["family/style"]).toEqual(cache.entries["family/style"]);
      await expect(readFile(cacheFile, "utf8")).resolves.toContain("family/style");
      await expect(loadVisualVerificationCache(cacheFile, "source-v2")).resolves.toMatchObject({ entries: {} });
    } finally {
      await rm(rootDirectory, { force: true, recursive: true });
    }
  });

  it("基线签名在文件不存在或替换后正确变化", async () => {
    const rootDirectory = await mkdtemp(join(tmpdir(), "visual-cache-root-"));
    const baselinePath = join(rootDirectory, "baseline.png");
    try {
      await expect(getVisualVerificationBaselineSignature(baselinePath)).resolves.toBeNull();
      await writeFile(baselinePath, "first");
      const firstSignature = await getVisualVerificationBaselineSignature(baselinePath);
      await writeFile(baselinePath, "second-content");
      const secondSignature = await getVisualVerificationBaselineSignature(baselinePath);
      expect(firstSignature).not.toBeNull();
      expect(secondSignature).not.toBe(firstSignature);
    } finally {
      await rm(rootDirectory, { force: true, recursive: true });
    }
  });
});
