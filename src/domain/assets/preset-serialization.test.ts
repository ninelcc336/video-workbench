import { describe, expect, it } from "vitest";
import { deserializePreset } from "./preset-model";

describe("当前个人预设序列化格式", () => {
  it("拒绝缺少范围和特效族身份的开发期旧预设", () => {
    expect(() => deserializePreset(
      {
        templateId: "emphasis-card",
        templateVersion: 1,
        name: "旧版卡片",
        params: { text: "保留旧文案" },
      },
      "legacy-preset",
    )).toThrow("请删除后重新创建");
  });
});
