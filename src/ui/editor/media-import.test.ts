import { describe, expect, it, vi } from "vitest";
import { importMediaFile } from "./media-import";

describe("浏览器素材导入", () => {
  it("把 File 作为 multipart 上传，并返回工作区资产 ID", async () => {
    const fetcher = vi.fn(async (_input: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.body).toBeInstanceOf(FormData);
      const form = init?.body as FormData;
      expect(form.get("file")).toBeInstanceOf(File);
      return new Response(JSON.stringify({ id: "media-1", relativePath: "media/media-1.mp4" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    });

    const file = new File(["真实视频字节"], "旅行片段.mp4", { type: "video/mp4" });
    await expect(importMediaFile(file, fetcher)).resolves.toMatchObject({ id: "media-1" });
    expect(fetcher).toHaveBeenCalledWith("/api/workspace/media", expect.any(Object));
  });

  it("服务端拒绝时返回中文错误且不产生临时素材引用", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ message: "文件格式不支持" }), { status: 400 }));

    await expect(importMediaFile(new File(["x"], "bad.txt"), fetcher)).rejects.toThrow("文件格式不支持");
  });
});
