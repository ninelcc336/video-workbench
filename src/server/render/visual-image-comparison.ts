import { readFile } from "node:fs/promises";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export type PngComparisonOptions = {
  /** 中文注释：pixelmatch 的颜色差异阈值用于吸收浏览器字体抗锯齿产生的微小变化。 */
  threshold?: number;
  /** 中文注释：少量未被阈值过滤的抗锯齿像素仍可存在，但大面积变化必须失败。 */
  maxDiffRatio?: number;
  includeAA?: boolean;
};

export type PngComparisonResult = {
  matches: boolean;
  expectedSize: { width: number; height: number };
  actualSize: { width: number; height: number };
  differingPixels: number;
  differingRatio: number;
  diffPng?: Buffer;
};

export const DEFAULT_PNG_COMPARISON_OPTIONS: Required<PngComparisonOptions> = {
  threshold: 0.1,
  // 中文注释：跨 Chromium 渲染路径的长文本边缘可能超过 1%，2% 仍足以拦截大面积视觉漂移。
  maxDiffRatio: 0.02,
  includeAA: false,
};

/** 中文注释：读取 PNG 为 pixelmatch 所需的 RGBA 缓冲区，保持比较器只依赖标准 PNG 输入。 */
function decodePng(buffer: Buffer): PNG {
  return PNG.sync.read(buffer);
}

/** 中文注释：比较固定帧图像并生成同尺寸差异图；尺寸变化单独报告且不尝试错误对齐。 */
export function comparePngBuffers(
  expectedBuffer: Buffer,
  actualBuffer: Buffer,
  options: PngComparisonOptions = {},
): PngComparisonResult {
  const expected = decodePng(expectedBuffer);
  const actual = decodePng(actualBuffer);
  const expectedSize = { width: expected.width, height: expected.height };
  const actualSize = { width: actual.width, height: actual.height };

  if (expected.width !== actual.width || expected.height !== actual.height) {
    return {
      matches: false,
      expectedSize,
      actualSize,
      differingPixels: expected.width * expected.height,
      differingRatio: 1,
    };
  }

  const resolvedOptions = { ...DEFAULT_PNG_COMPARISON_OPTIONS, ...options };
  const diff = new PNG({ width: expected.width, height: expected.height });
  const differingPixels = pixelmatch(
    expected.data,
    actual.data,
    diff.data,
    expected.width,
    expected.height,
    {
      includeAA: resolvedOptions.includeAA,
      threshold: resolvedOptions.threshold,
    },
  );
  const totalPixels = Math.max(1, expected.width * expected.height);
  const differingRatio = differingPixels / totalPixels;

  return {
    matches: differingRatio <= resolvedOptions.maxDiffRatio,
    expectedSize,
    actualSize,
    differingPixels,
    differingRatio,
    diffPng: differingPixels > 0 ? PNG.sync.write(diff) : undefined,
  };
}

/** 中文注释：文件比较只负责读取输入并复用纯缓冲区比较，便于单测和命令行共享同一判断规则。 */
export async function comparePngFiles(
  expectedPath: string,
  actualPath: string,
  options: PngComparisonOptions = {},
): Promise<PngComparisonResult> {
  const [expected, actual] = await Promise.all([
    readFile(expectedPath),
    readFile(actualPath),
  ]);
  return comparePngBuffers(expected, actual, options);
}
