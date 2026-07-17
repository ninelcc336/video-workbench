import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { MediaSources } from "../../remotion/media";

type LocalMediaEntry = {
  id: string;
  filePath: string;
  size: number;
};

export type MediaSourceServer = {
  mediaSources: MediaSources;
  close: () => Promise<void>;
};

const contentTypes: Record<string, string> = {
  ".m4v": "video/x-m4v",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".mpeg": "video/mpeg",
  ".webm": "video/webm",
};

function isHttpSource(source: string): boolean {
  return source.startsWith("http://") || source.startsWith("https://");
}

function sourceToFilePath(source: string): string {
  return source.startsWith("file:") ? fileURLToPath(source) : resolve(source);
}

function sendRangeError(response: ServerResponse, size: number): void {
  response.writeHead(416, { "Content-Range": `bytes */${size}` });
  response.end();
}

function getRange(request: IncomingMessage, size: number): { start: number; end: number } | null | false {
  const header = request.headers.range;
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match) return false;
  const startText = match[1];
  const endText = match[2];
  const suffixLength = Number(endText);
  let start = startText ? Number(startText) : Math.max(0, size - suffixLength);
  let end = startText ? (endText ? Number(endText) : size - 1) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) {
    return false;
  }
  end = Math.min(end, size - 1);
  return { start, end };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  entries: Map<string, LocalMediaEntry>,
): Promise<void> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  const prefix = "/media/";
  if (!requestUrl.pathname.startsWith(prefix)) {
    response.writeHead(404);
    response.end();
    return;
  }

  const mediaId = decodeURIComponent(requestUrl.pathname.slice(prefix.length));
  const entry = entries.get(mediaId);
  if (!entry) {
    response.writeHead(404);
    response.end();
    return;
  }

  const range = getRange(request, entry.size);
  if (range === false) {
    sendRangeError(response, entry.size);
    return;
  }

  const extension = extname(entry.filePath).toLowerCase();
  const headers: Record<string, string> = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Type": contentTypes[extension] ?? "application/octet-stream",
  };
  if (range) {
    headers["Content-Length"] = String(range.end - range.start + 1);
    headers["Content-Range"] = `bytes ${range.start}-${range.end}/${entry.size}`;
    response.writeHead(206, headers);
  } else {
    headers["Content-Length"] = String(entry.size);
    response.writeHead(200, headers);
  }

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  const stream = range
    ? createReadStream(entry.filePath, { start: range.start, end: range.end })
    : createReadStream(entry.filePath);
  stream.on("error", () => response.destroy());
  stream.pipe(response);
}

/** 中文注释：Remotion compositor 只能通过 HTTP 读取视频，因此把本地工作区素材临时映射为受控 HTTP 地址。 */
export async function createMediaSourceServer(mediaSources: MediaSources): Promise<MediaSourceServer> {
  const entries = new Map<string, LocalMediaEntry>();
  const rewrittenSources: MediaSources = { ...mediaSources };

  for (const [id, source] of Object.entries(mediaSources)) {
    if (isHttpSource(source)) continue;
    const filePath = sourceToFilePath(source);
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) throw new Error(`媒体素材不是文件：${id}`);
    entries.set(id, { id, filePath, size: fileStats.size });
  }

  if (entries.size === 0) {
    return { mediaSources: rewrittenSources, close: async () => undefined };
  }

  const server: Server = createServer((request, response) => {
    void handleRequest(request, response, entries).catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolveListen();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    throw new Error("无法启动本地媒体服务");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  for (const id of entries.keys()) {
    rewrittenSources[id] = `${baseUrl}/media/${encodeURIComponent(id)}`;
  }

  return {
    mediaSources: rewrittenSources,
    close: () => new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => (error ? rejectClose(error) : resolveClose()));
    }),
  };
}
