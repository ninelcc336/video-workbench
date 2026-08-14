import { bundle } from "@remotion/bundler";
import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export type RemotionBundleOptions = {
  entryPoint: string;
  outDir?: string;
  enableCaching?: boolean;
};

export type RemotionBundleFunction = (options: RemotionBundleOptions) => Promise<string>;

export type RemotionBundleSession = {
  serveUrl: string;
  directory: string;
  cleanup: () => Promise<void>;
};

export const DEFAULT_REMOTION_BUNDLE_ROOT = resolve(
  process.cwd(),
  "test-results/.tmp/remotion-bundles",
);

const REMOTION_CHROMIUM_PROFILE_PREFIX = "puppeteer_dev_chrome_profile-";
export const DEFAULT_REMOTION_TEMP_RESOURCE_MAX_AGE_IN_MILLISECONDS = 2 * 60 * 60 * 1000;

let cachedBundle: Promise<string> | null = null;

const remotionEntryPoint = () => resolve(process.cwd(), "src/remotion/entry.tsx");

/** 中文注释：创建一次视觉验证专用的临时 bundle，并把删除责任绑定到返回的会话生命周期。 */
export async function createRemotionBundleSession(
  bundleFunction: RemotionBundleFunction = bundle,
  rootDirectory: string = DEFAULT_REMOTION_BUNDLE_ROOT,
): Promise<RemotionBundleSession> {
  await mkdir(rootDirectory, { recursive: true });
  const directory = await mkdtemp(join(rootDirectory, "run-"));

  try {
    const serveUrl = await bundleFunction({
      entryPoint: remotionEntryPoint(),
      enableCaching: true,
      outDir: directory,
    });
    let cleaned = false;
    return {
      serveUrl,
      directory,
      cleanup: async () => {
        if (cleaned) return;
        cleaned = true;
        await rm(directory, { force: true, recursive: true });
      },
    };
  } catch (error) {
    await rm(directory, { force: true, recursive: true });
    const message = error instanceof Error ? error.message : "未知打包错误";
    throw new Error(`Remotion 自动打包失败：${message}`);
  }
}

/** 中文注释：清理上次被强制中断遗留的旧 bundle，只触碰项目声明的临时根目录。 */
export async function cleanupStaleRemotionBundleSessions(
  rootDirectory: string = DEFAULT_REMOTION_BUNDLE_ROOT,
  maxAgeInMilliseconds = DEFAULT_REMOTION_TEMP_RESOURCE_MAX_AGE_IN_MILLISECONDS,
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(rootDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  const cutoff = Date.now() - maxAgeInMilliseconds;
  await Promise.all(entries
    .filter((entry) => entry.startsWith("run-"))
    .map(async (entry) => {
      const directory = join(rootDirectory, entry);
      try {
        const details = await stat(directory);
        if (details.isDirectory() && details.mtimeMs < cutoff) {
          await rm(directory, { force: true, recursive: true });
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }));
}

/**
 * 中文注释：删除系统 Temp 中超过保留期限的 Remotion Chromium profile，只匹配 Puppeteer 的固定前缀。
 * 该清理是尽力而为的，若目录仍被其他浏览器进程锁定则保留它，不阻断当前视觉验证。
 */
export async function cleanupStaleRemotionChromiumProfiles(
  temporaryDirectory: string = tmpdir(),
  maxAgeInMilliseconds = DEFAULT_REMOTION_TEMP_RESOURCE_MAX_AGE_IN_MILLISECONDS,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(temporaryDirectory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  const cutoff = Date.now() - maxAgeInMilliseconds;
  await Promise.all(entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(REMOTION_CHROMIUM_PROFILE_PREFIX))
    .map(async (entry) => {
      const directory = join(temporaryDirectory, entry.name);
      try {
        const details = await stat(directory);
        if (details.mtimeMs >= cutoff) return;
        await rm(directory, {
          force: true,
          maxRetries: 8,
          recursive: true,
          retryDelay: 150,
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") return;
      }
    }));
}

/** 中文注释：记录系统 Temp 中已有的 Remotion Chromium profile，后续只处理本次新增目录。 */
export async function snapshotRemotionChromiumProfiles(
  temporaryDirectory: string = tmpdir(),
): Promise<ReadonlySet<string>> {
  let entries;
  try {
    entries = await readdir(temporaryDirectory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Set();
    throw error;
  }

  return new Set(entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(REMOTION_CHROMIUM_PROFILE_PREFIX))
    .map((entry) => resolve(temporaryDirectory, entry.name)));
}

/**
 * 中文注释：浏览器关闭后删除本次新增的 Chromium profile；Windows 进程退出存在短暂锁定时采用有限重试，
 * 清理失败的目录保留给系统或下一次受控清理，不阻断视觉验证结果。
 */
export async function cleanupNewRemotionChromiumProfiles(
  existingProfiles: ReadonlySet<string>,
  temporaryDirectory: string = tmpdir(),
): Promise<string[]> {
  const currentProfiles = await snapshotRemotionChromiumProfiles(temporaryDirectory);
  const createdProfiles = [...currentProfiles].filter((profile) => !existingProfiles.has(profile));
  const remainingProfiles: string[] = [];

  await Promise.all(createdProfiles.map(async (profile) => {
    try {
      await rm(profile, {
        force: true,
        maxRetries: 8,
        recursive: true,
        retryDelay: 150,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") remainingProfiles.push(profile);
    }
  }));

  return remainingProfiles;
}

/** 中文注释：本地渲染第一次运行时自动打包共享入口，后续任务复用结果避免重复启动 Webpack。 */
export function getRemotionServeUrl(
  bundleFunction: RemotionBundleFunction = bundle,
): Promise<string> {
  if (!cachedBundle) {
    cachedBundle = bundleFunction({
      entryPoint: remotionEntryPoint(),
    }).catch((error) => {
      cachedBundle = null;
      const message = error instanceof Error ? error.message : "未知打包错误";
      throw new Error(`Remotion 自动打包失败：${message}`);
    });
  }
  return cachedBundle;
}

/** 中文注释：测试和开发热重载可以清除缓存，生产渲染过程不需要手动调用。 */
export function resetRemotionBundle(): void {
  cachedBundle = null;
}
