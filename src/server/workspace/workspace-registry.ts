import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export type RecentWorkspace = { rootPath: string; name: string; lastOpenedAt: string };

// 中文注释：测试和多窗口可能同时打开工作区，进程级队列避免共享索引的临时文件互相覆盖。
let registryWriteQueue: Promise<void> = Promise.resolve();

/** 中文注释：最近工作区索引只记录路径和展示名，不复制项目或媒体文件。 */
export class WorkspaceRegistry {
  private readonly filePath: string;

  constructor(filePath = join(process.cwd(), "workspace", ".recent-workspaces.json")) {
    this.filePath = filePath;
  }

  /** 中文注释：记录成功打开的工作区，重复打开只更新时间并置顶。 */
  async remember(rootPath: string): Promise<void> {
    const normalized = resolve(rootPath);
    const operation = registryWriteQueue.then(async () => {
      const current = await this.list();
      const next: RecentWorkspace[] = [
        { rootPath: normalized, name: normalized.split(/[\\/]/).pop() ?? normalized, lastOpenedAt: new Date().toISOString() },
        ...current.filter((item) => item.rootPath !== normalized),
      ].slice(0, 10);
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.${process.pid}.tmp`;
      try {
        await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
        // 中文注释：Windows 替换已存在的索引文件前先移除旧文件，失败不会影响已创建的工作区。
        await rm(this.filePath, { force: true });
        await rename(temporary, this.filePath);
      } catch (error) {
        await rm(temporary, { force: true }).catch(() => undefined);
        throw error;
      }
    });
    registryWriteQueue = operation.catch(() => undefined);
    await operation;
  }

  /** 中文注释：索引损坏时返回空列表，不影响当前已打开工作区和项目文件。 */
  async list(): Promise<RecentWorkspace[]> {
    try {
      const value = JSON.parse(await readFile(this.filePath, "utf8")) as unknown;
      return Array.isArray(value) ? value.filter((item): item is RecentWorkspace => Boolean(item && typeof item === "object" && typeof (item as RecentWorkspace).rootPath === "string")) : [];
    } catch {
      return [];
    }
  }
}
