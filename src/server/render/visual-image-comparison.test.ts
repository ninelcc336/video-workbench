import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { comparePngBuffers } from "./visual-image-comparison";
import { createSolidPng } from "./visual-test-fixtures";

describe("固定帧 PNG 比较器", () => {
  it("相同图像通过比较", () => {
    const image = createSolidPng(4, 4, [20, 30, 40, 255]);

    expect(comparePngBuffers(image, image).matches).toBe(true);
  });

  it("允许小幅像素差以容纳字体抗锯齿微差", () => {
    const expected = createSolidPng(4, 4, [20, 30, 40, 255]);
    const actualPng = PNG.sync.read(expected);
    actualPng.data[0] = 25;
    const actual = PNG.sync.write(actualPng);

    expect(comparePngBuffers(expected, actual).matches).toBe(true);
  });

  it("语义像素差异失败并返回可保存的差异图", () => {
    const expected = createSolidPng(4, 4, [20, 30, 40, 255]);
    const actual = createSolidPng(4, 4, [240, 30, 40, 255]);

    const result = comparePngBuffers(expected, actual, { maxDiffRatio: 0.01 });

    expect(result.matches).toBe(false);
    expect(result.differingPixels).toBeGreaterThan(0);
    expect(result.diffPng).toBeInstanceOf(Buffer);
  });

  it("尺寸不同直接失败并给出尺寸信息", () => {
    const expected = createSolidPng(4, 4, [20, 30, 40, 255]);
    const actual = createSolidPng(2, 2, [20, 30, 40, 255]);

    expect(comparePngBuffers(expected, actual)).toMatchObject({
      matches: false,
      expectedSize: { width: 4, height: 4 },
      actualSize: { width: 2, height: 2 },
    });
  });
});
