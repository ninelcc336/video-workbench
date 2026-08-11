import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import {
  BUILT_IN_ASSETS,
  type BuiltInAssetDefinition,
} from "./built-in-assets";

export type BuiltInAssetValidationIssue = {
  id: string;
  code:
    | "duplicate_id"
    | "duplicate_path"
    | "remote_reference"
    | "absolute_path"
    | "missing_file"
    | "metadata_missing";
  message: string;
};

/** 中文注释：远程协议、协议相对地址和 Windows 绝对盘符都不允许进入内置素材台账。 */
function isRemoteOrAbsoluteReference(filePath: string): "remote" | "absolute" | undefined {
  if (isAbsolute(filePath) || filePath.startsWith("/") || /^[a-z]:[\\/]/i.test(filePath)) {
    return "absolute";
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(filePath) || filePath.startsWith("//")) {
    return "remote";
  }
  return undefined;
}

/**
 * 中文注释：构建期检查台账身份、路径边界、文件存在性和许可证字段，返回全部问题便于一次修复。
 */
export function validateBuiltInAssets(
  rootDirectory = process.cwd(),
  assets: ReadonlyArray<BuiltInAssetDefinition> = BUILT_IN_ASSETS,
): BuiltInAssetValidationIssue[] {
  const issues: BuiltInAssetValidationIssue[] = [];
  const ids = new Set<string>();
  const paths = new Set<string>();
  const publicDirectory = resolve(rootDirectory, "public");

  for (const asset of assets) {
    if (ids.has(asset.id)) {
      issues.push({ id: asset.id, code: "duplicate_id", message: `内置素材 ID 重复：${asset.id}` });
    }
    ids.add(asset.id);

    const normalizedPath = asset.filePath.replace(/\\/g, "/");
    if (paths.has(normalizedPath)) {
      issues.push({ id: asset.id, code: "duplicate_path", message: `内置素材路径重复：${normalizedPath}` });
    }
    paths.add(normalizedPath);

    const referenceKind = isRemoteOrAbsoluteReference(asset.filePath);
    if (referenceKind === "remote") {
      issues.push({
        id: asset.id,
        code: "remote_reference",
        message: `内置素材不得引用远程地址：${asset.filePath}`,
      });
    }
    if (referenceKind === "absolute" || normalizedPath.split("/").includes("..")) {
      issues.push({
        id: asset.id,
        code: "absolute_path",
        message: `内置素材必须位于 public 相对路径下：${asset.filePath}`,
      });
    }

    if (!asset.source.trim() || !asset.license.trim() || !asset.redistribution.trim()) {
      issues.push({
        id: asset.id,
        code: "metadata_missing",
        message: `内置素材缺少来源、许可证或再分发说明：${asset.id}`,
      });
    }

    if (referenceKind === undefined && !normalizedPath.split("/").includes("..")) {
      const filePath = resolve(publicDirectory, ...normalizedPath.split("/"));
      const relativePath = relative(publicDirectory, filePath);
      if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
        issues.push({
          id: asset.id,
          code: "absolute_path",
          message: `内置素材路径越出 public 目录：${asset.filePath}`,
        });
      } else if (!existsSync(filePath)) {
        issues.push({
          id: asset.id,
          code: "missing_file",
          message: `内置素材文件不存在：${filePath}`,
        });
      }
    }
  }

  return issues;
}

/** 中文注释：构建入口使用异常中断，避免缺失素材在浏览器预览后才暴露。 */
export function assertBuiltInAssets(rootDirectory = process.cwd()): void {
  const issues = validateBuiltInAssets(rootDirectory);
  if (issues.length === 0) return;

  throw new Error(issues.map((issue) => issue.message).join("；"));
}
