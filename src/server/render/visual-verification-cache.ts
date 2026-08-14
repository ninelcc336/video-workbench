import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import type { VisualVerificationCase } from "../../domain/templates/visual-verification";

export const DEFAULT_VISUAL_VERIFICATION_CACHE_FILE = resolve(
  process.cwd(),
  "test-results/.cache/visual-verification.json",
);

const VISUAL_VERIFICATION_CACHE_VERSION = 1;

export type VisualVerificationCacheEntry = {
  caseFingerprint: string;
  baselineSignature: string | null;
  verifiedAt: string;
};

export type VisualVerificationCache = {
  version: typeof VISUAL_VERIFICATION_CACHE_VERSION;
  sourceFingerprint: string;
  entries: Record<string, VisualVerificationCacheEntry>;
};

/** 中文注释：按稳定顺序序列化渲染输入，避免对象属性顺序变化导致缓存无意义失效。 */
function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return value === undefined ? "undefined" : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}

/** 中文注释：统一使用 SHA-256 生成短期缓存身份；缓存只影响性能，不参与视觉结果判定。 */
function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const VISUAL_SOURCE_PATHS = [
  "src/domain/assets/built-in-assets.ts",
  "src/domain/templates",
  "src/remotion",
  "src/server/render/effect-visual-renderer.ts",
  "src/server/render/remotion-bundler.ts",
  "src/server/render/visual-image-comparison.ts",
  "src/server/render/visual-verification-artifacts.ts",
  "src/server/render/visual-verification-runner.ts",
  "src/ui/visual-verification",
  "public/effect-assets",
  "package.json",
  "package-lock.json",
  "vite.config.ts",
] as const;

/** 中文注释：测试文件不改变生产渲染结果，因此排除它们，减少无关改动造成的全目录缓存失效。 */
function isProductionSourceFile(filePath: string): boolean {
  const normalizedPath = filePath.replaceAll("\\", "/");
  return !normalizedPath.includes("/__tests__/")
    && !/(^|\/)__tests__\//.test(normalizedPath)
    && !/\.(test|spec)\.[^/]+$/i.test(normalizedPath);
}

async function collectSourceFiles(directory: string, rootDirectory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(entryPath, rootDirectory));
    } else if (entry.isFile() && isProductionSourceFile(entryPath)) {
      files.push(relative(rootDirectory, entryPath).replaceAll("\\", "/"));
    }
  }
  return files;
}

/**
 * 中文注释：收集视觉渲染真正依赖的源码和内置素材；路径缺失时跳过，便于在最小夹具中测试该模块。
 * 该指纹不包含测试基线，基线由每个案例单独记录文件状态，避免整份 PNG 目录被重复读入内存。
 */
export async function computeVisualVerificationSourceFingerprint(
  rootDirectory: string = process.cwd(),
): Promise<string> {
  const files = new Set<string>();
  for (const relativePath of VISUAL_SOURCE_PATHS) {
    const absolutePath = resolve(rootDirectory, relativePath);
    try {
      const details = await stat(absolutePath);
      if (details.isDirectory()) {
        for (const file of await collectSourceFiles(absolutePath, rootDirectory)) files.add(file);
      } else if (details.isFile() && isProductionSourceFile(absolutePath)) {
        files.add(relative(rootDirectory, absolutePath).replaceAll("\\", "/"));
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  const hash = createHash("sha256");
  hash.update(stableSerialize({
    cacheVersion: VISUAL_VERIFICATION_CACHE_VERSION,
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
  }));
  for (const relativePath of [...files].sort()) {
    hash.update(`\n${relativePath}\n`);
    hash.update(await readFile(resolve(rootDirectory, relativePath)));
  }
  return hash.digest("hex");
}

/** 中文注释：案例指纹包含最终 renderProps 和基线位置，防止不同矩阵或不同基线目录互相串用。 */
export function createVisualVerificationCaseFingerprint(
  item: Pick<VisualVerificationCase, "id" | "renderProps">,
  baselinePath?: string,
): string {
  return hashText(stableSerialize({
    id: item.id,
    renderProps: item.renderProps,
    baselinePath: baselinePath ?? null,
  }));
}

/** 中文注释：基线只需检查元数据即可判断是否被替换，避免每次缓存命中都读取完整 PNG。 */
export async function getVisualVerificationBaselineSignature(
  baselinePath: string,
): Promise<string | null> {
  try {
    const details = await stat(baselinePath);
    if (!details.isFile()) return null;
    return `${details.size}:${details.mtimeMs}:${details.ctimeMs}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function emptyCache(sourceFingerprint: string): VisualVerificationCache {
  return {
    version: VISUAL_VERIFICATION_CACHE_VERSION,
    sourceFingerprint,
    entries: {},
  };
}

function isCacheEntry(value: unknown): value is VisualVerificationCacheEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.caseFingerprint === "string"
    && (entry.baselineSignature === null || typeof entry.baselineSignature === "string")
    && typeof entry.verifiedAt === "string";
}

/** 中文注释：缓存文件损坏或版本不匹配时静默视为空缓存，视觉验证本身不能被可选优化阻断。 */
export async function loadVisualVerificationCache(
  cacheFile: string,
  sourceFingerprint: string,
): Promise<VisualVerificationCache> {
  try {
    const parsed = JSON.parse(await readFile(cacheFile, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return emptyCache(sourceFingerprint);
    const value = parsed as Record<string, unknown>;
    if (value.version !== VISUAL_VERIFICATION_CACHE_VERSION || value.sourceFingerprint !== sourceFingerprint) {
      return emptyCache(sourceFingerprint);
    }
    if (!value.entries || typeof value.entries !== "object") return emptyCache(sourceFingerprint);

    const entries: Record<string, VisualVerificationCacheEntry> = {};
    for (const [caseId, entry] of Object.entries(value.entries)) {
      if (isCacheEntry(entry)) entries[caseId] = entry;
    }
    return { ...emptyCache(sourceFingerprint), entries };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      // 中文注释：JSON 损坏、上次中断留下半文件等都降级为缓存未命中，不影响真实验证。
      return emptyCache(sourceFingerprint);
    }
    return emptyCache(sourceFingerprint);
  }
}

/** 中文注释：通过临时文件原子替换缓存，进程被中断时最多损失命中率，不会留下半份可解析 JSON。 */
export async function saveVisualVerificationCache(
  cacheFile: string,
  cache: VisualVerificationCache,
): Promise<void> {
  await mkdir(dirname(cacheFile), { recursive: true });
  const temporaryFile = `${cacheFile}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryFile, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
    await rename(temporaryFile, cacheFile);
  } finally {
    await rm(temporaryFile, { force: true });
  }
}
