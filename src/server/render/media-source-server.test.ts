import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createMediaSourceServer } from "./media-source-server";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("渲染媒体 HTTP 服务", () => {
  it("把本地素材映射成 HTTP 地址，并支持浏览器的 Range 请求", async () => {
    const root = await mkdtemp(join(tmpdir(), "video-effect-media-server-"));
    roots.push(root);
    const sourcePath = join(root, "input.mp4");
    await writeFile(sourcePath, "0123456789", "utf8");

    const mediaServer = await createMediaSourceServer({
      "media-1": pathToFileURL(sourcePath).href,
    });
    const sourceUrl = mediaServer.mediaSources["media-1"];
    expect(sourceUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/media\//);

    const completeResponse = await fetch(sourceUrl);
    expect(completeResponse.status).toBe(200);
    await expect(completeResponse.text()).resolves.toBe("0123456789");

    const rangeResponse = await fetch(sourceUrl, { headers: { Range: "bytes=2-5" } });
    expect(rangeResponse.status).toBe(206);
    expect(rangeResponse.headers.get("content-range")).toBe("bytes 2-5/10");
    await expect(rangeResponse.text()).resolves.toBe("2345");

    const suffixResponse = await fetch(sourceUrl, { headers: { Range: "bytes=-4" } });
    expect(suffixResponse.status).toBe(206);
    await expect(suffixResponse.text()).resolves.toBe("6789");

    await mediaServer.close();
    await expect(readFile(sourcePath, "utf8")).resolves.toBe("0123456789");
  });
});
