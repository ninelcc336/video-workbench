import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyOrUpdateVisualBaseline } from "./visual-verification-artifacts";
import { createSolidPng } from "./visual-test-fixtures";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("视觉验证基线产物", () => {
  it("缺失基线默认失败，并提示使用更新模式", async () => {
    const root = await mkdtemp(join(tmpdir(), "effect-visual-artifacts-"));
    roots.push(root);
    const actualPath = join(root, "actual.png");
    const baselinePath = join(root, "baseline.png");
    await writeFile(actualPath, createSolidPng(2, 2, [20, 30, 40, 255]));

    const result = await verifyOrUpdateVisualBaseline({ actualPath, baselinePath, update: false });

    expect(result.status).toBe("missing");
    expect(result.message).toContain("--update");
  });

  it("更新模式新增基线并保留实际图像", async () => {
    const root = await mkdtemp(join(tmpdir(), "effect-visual-artifacts-"));
    roots.push(root);
    const actualPath = join(root, "actual.png");
    const baselinePath = join(root, "nested", "baseline.png");
    const reviewPath = join(root, "review", "baseline-candidate.png");
    await writeFile(actualPath, createSolidPng(2, 2, [20, 30, 40, 255]));

    const result = await verifyOrUpdateVisualBaseline({ actualPath, baselinePath, diffPath: reviewPath, update: true });

    expect(result.status).toBe("updated");
    expect(await readFile(baselinePath)).toEqual(await readFile(actualPath));
    expect(await readFile(reviewPath)).toEqual(await readFile(actualPath));
  });

  it("比较失败写出差异图，更新模式才替换旧基线", async () => {
    const root = await mkdtemp(join(tmpdir(), "effect-visual-artifacts-"));
    roots.push(root);
    const actualPath = join(root, "actual.png");
    const baselinePath = join(root, "baseline.png");
    const diffPath = join(root, "diff", "case.png");
    await mkdir(join(root, "diff"), { recursive: true });
    await writeFile(actualPath, createSolidPng(2, 2, [240, 30, 40, 255]));
    await writeFile(baselinePath, createSolidPng(2, 2, [20, 30, 40, 255]));

    const failed = await verifyOrUpdateVisualBaseline({ actualPath, baselinePath, diffPath, update: false });
    expect(failed.status).toBe("failed");
    expect(await readFile(baselinePath)).not.toEqual(await readFile(actualPath));
    expect(await readFile(diffPath)).toBeInstanceOf(Buffer);

    const updated = await verifyOrUpdateVisualBaseline({ actualPath, baselinePath, diffPath, update: true });
    expect(updated.status).toBe("updated");
    expect(await readFile(baselinePath)).toEqual(await readFile(actualPath));
  });
});
