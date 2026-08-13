import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  comparePngBuffers,
  comparePngFiles,
  type PngComparisonOptions,
  type PngComparisonResult,
} from "./visual-image-comparison";

export type VisualBaselineStatus = "passed" | "missing" | "failed" | "updated";

export type VisualBaselineResult = {
  status: VisualBaselineStatus;
  message: string;
  comparison?: PngComparisonResult;
};

export type VisualBaselineOptions = {
  actualPath: string;
  baselinePath: string;
  diffPath?: string;
  update: boolean;
  comparison?: PngComparisonOptions;
};

export type VisualBaselineBufferOptions = Omit<VisualBaselineOptions, "actualPath"> & {
  actualBuffer: Buffer;
};

/** 中文注释：只把不存在的基线视为缺失，其他文件系统错误继续抛出以免隐藏权限或磁盘故障。 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** 中文注释：统一处理新增、比较、差异图和显式更新，日常命令不会无意覆盖人工审阅过的基线。 */
export async function verifyOrUpdateVisualBaseline(
  options: VisualBaselineOptions,
): Promise<VisualBaselineResult> {
  const { actualPath, baselinePath, diffPath, update } = options;
  if (!await fileExists(baselinePath)) {
    if (!update) {
      return {
        status: "missing",
        message: `缺少视觉基线：${baselinePath}；使用 --update 新增基线`,
      };
    }

    await mkdir(dirname(baselinePath), { recursive: true });
    await copyFile(actualPath, baselinePath);
    if (diffPath) {
      // 中文注释：新增基线没有旧图可做像素相减，因此复制候选图作为人工审阅产物，避免静默写入。
      await mkdir(dirname(diffPath), { recursive: true });
      await copyFile(actualPath, diffPath);
    }
    return {
      status: "updated",
      message: `已新增视觉基线及审阅图：${baselinePath}`,
    };
  }

  const comparison = await comparePngFiles(baselinePath, actualPath, options.comparison);
  if (comparison.matches) {
    return {
      status: "passed",
      message: `视觉基线通过：${baselinePath}`,
      comparison,
    };
  }

  if (diffPath && comparison.diffPng) {
    await mkdir(dirname(diffPath), { recursive: true });
    await writeFile(diffPath, comparison.diffPng);
  }

  if (update) {
    await copyFile(actualPath, baselinePath);
    return {
      status: "updated",
      message: `已更新视觉基线：${baselinePath}`,
      comparison,
    };
  }

  return {
    status: "failed",
    message: `视觉基线不匹配：${baselinePath}`,
    comparison,
  };
}

/** 中文注释：内存版本复用相同基线语义，避免参数矩阵为了比较而先写出临时 PNG。 */
export async function verifyOrUpdateVisualBaselineBuffer(
  options: VisualBaselineBufferOptions,
): Promise<VisualBaselineResult> {
  const { actualBuffer, baselinePath, diffPath, update } = options;
  if (!await fileExists(baselinePath)) {
    if (!update) {
      return {
        status: "missing",
        message: `缺少视觉基线：${baselinePath}；使用 --update 新增基线`,
      };
    }

    await mkdir(dirname(baselinePath), { recursive: true });
    await writeFile(baselinePath, actualBuffer);
    if (diffPath) {
      await mkdir(dirname(diffPath), { recursive: true });
      await writeFile(diffPath, actualBuffer);
    }
    return {
      status: "updated",
      message: `已新增视觉基线及审阅图：${baselinePath}`,
    };
  }

  const comparison = comparePngBuffers(await readFile(baselinePath), actualBuffer, options.comparison);
  if (comparison.matches) {
    return {
      status: "passed",
      message: `视觉基线通过：${baselinePath}`,
      comparison,
    };
  }

  if (diffPath && comparison.diffPng) {
    await mkdir(dirname(diffPath), { recursive: true });
    await writeFile(diffPath, comparison.diffPng);
  }

  if (update) {
    await writeFile(baselinePath, actualBuffer);
    return {
      status: "updated",
      message: `已更新视觉基线：${baselinePath}`,
      comparison,
    };
  }

  return {
    status: "failed",
    message: `视觉基线不匹配：${baselinePath}`,
    comparison,
  };
}
