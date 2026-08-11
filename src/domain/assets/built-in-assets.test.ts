import { describe, expect, it } from "vitest";
import {
  BUILT_IN_ASSETS,
  getBuiltInAsset,
  listBuiltInAssets,
  resolveBuiltInAsset,
} from "./built-in-assets";
import { validateBuiltInAssets } from "./validate-built-in-assets";

describe("内置素材槽位", () => {
  it("通过稳定 ID 解析到浏览器和 Remotion 共用的本地 URL", () => {
    const font = resolveBuiltInAsset("font.system-sans");
    const icon = resolveBuiltInAsset("icon.check");

    expect(font).toMatchObject({
      id: "font.system-sans",
      kind: "font",
      filePath: "effect-assets/fonts/system-sans.css",
      url: "/effect-assets/fonts/system-sans.css",
    });
    expect(icon).toMatchObject({
      id: "icon.check",
      kind: "icon",
      url: "/effect-assets/icons/check.svg",
    });
    expect(font.filePath).not.toMatch(/^https?:/);
  });

  it("提供带来源、许可证和再分发说明的素材台账", () => {
    expect(BUILT_IN_ASSETS.length).toBeGreaterThanOrEqual(3);
    expect(BUILT_IN_ASSETS.every((asset) =>
      asset.source.length > 0 && asset.license.length > 0 && asset.redistribution.length > 0,
    )).toBe(true);
    expect(listBuiltInAssets("icon")).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "icon.check" })]),
    );
    expect(getBuiltInAsset("decoration.spark").kind).toBe("decoration");
  });

  it("构建检查拒绝远程、绝对路径和缺失素材", () => {
    const issues = validateBuiltInAssets(process.cwd(), [
      ...BUILT_IN_ASSETS,
      {
        id: "remote.icon",
        kind: "icon",
        filePath: "https://example.com/icon.svg",
        label: "远程图标",
        source: "测试",
        license: "测试许可",
        redistribution: "测试说明",
      },
      {
        id: "missing.icon",
        kind: "icon",
        filePath: "effect-assets/icons/missing.svg",
        label: "缺失图标",
        source: "测试",
        license: "测试许可",
        redistribution: "测试说明",
      },
    ]);

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "remote.icon", code: "remote_reference" }),
      expect.objectContaining({ id: "missing.icon", code: "missing_file" }),
    ]));
  });

  it("未知素材 ID 会明确失败", () => {
    expect(() => getBuiltInAsset("icon.unknown")).toThrow("未找到内置素材：icon.unknown");
  });
});
