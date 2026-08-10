import { describe, expect, it } from "vitest";
import { deserializePreset } from "./preset-model";

describe("旧版个人预设兼容读取", () => {
  it("将缺少范围字段的旧预设按完整预设读取", () => {
    const preset = deserializePreset(
      {
        templateId: "card-overlay",
        templateVersion: 1,
        name: "旧版卡片",
        params: { text: "保留旧文案" },
      },
      "legacy-preset",
    );

    expect(preset).toEqual({
      id: "legacy-preset",
      templateId: "card-overlay",
      templateVersion: 1,
      name: "旧版卡片",
      scope: "full",
      params: { text: "保留旧文案" },
    });
  });
});
