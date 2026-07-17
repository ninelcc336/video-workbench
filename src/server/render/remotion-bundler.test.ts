import { afterEach, describe, expect, it, vi } from "vitest";
import { getRemotionServeUrl, resetRemotionBundle } from "./remotion-bundler";

afterEach(() => resetRemotionBundle());

describe("Remotion 自动 bundle", () => {
  it("首次渲染自动 bundle，后续调用复用同一个 serve URL", async () => {
    const bundle = vi.fn(async () => "file:///tmp/remotion-bundle");

    await expect(getRemotionServeUrl(bundle)).resolves.toBe("file:///tmp/remotion-bundle");
    await expect(getRemotionServeUrl(bundle)).resolves.toBe("file:///tmp/remotion-bundle");

    expect(bundle).toHaveBeenCalledTimes(1);
    const firstCall = bundle.mock.calls[0] as unknown as [{ entryPoint: string }];
    expect(firstCall[0].entryPoint).toMatch(/src[\\/]remotion[\\/]entry\.tsx$/);
  });

  it("bundle 失败时保留明确错误，不伪造 serve URL", async () => {
    const bundle = vi.fn(async () => {
      throw new Error("Webpack 配置失败");
    });

    await expect(getRemotionServeUrl(bundle)).rejects.toThrow("Remotion 自动打包失败：Webpack 配置失败");
  });
});
