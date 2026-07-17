import { describe, expect, it } from "vitest";
import {
  getDefaultParams,
  normalizeParameterValues,
} from "./parameter-schema";
import type { ParameterDefinition } from "./types";

const parameterSchema: ParameterDefinition[] = [
  {
    key: "text",
    label: "文本",
    type: "text",
    defaultValue: "默认文本",
  },
  {
    key: "color",
    label: "颜色",
    type: "color",
    defaultValue: "#ffffff",
  },
  {
    key: "opacity",
    label: "透明度",
    type: "number",
    defaultValue: 1,
    min: 0,
    max: 1,
    step: 0.1,
  },
  {
    key: "direction",
    label: "方向",
    type: "select",
    defaultValue: "left",
    options: [
      { value: "left", label: "左侧" },
      { value: "right", label: "右侧" },
    ],
  },
  {
    key: "enabled",
    label: "启用",
    type: "boolean",
    defaultValue: true,
  },
  {
    key: "position",
    label: "位置",
    type: "position",
    defaultValue: { x: 0.5, y: 0.5 },
  },
  {
    key: "size",
    label: "尺寸",
    type: "size",
    defaultValue: { width: 0.8, height: 0.2 },
  },
];

describe("模板参数声明", () => {
  it("生成全部声明参数的默认值", () => {
    // 中文注释：默认值是模板渲染的稳定入口，新建特效不需要 UI 额外拼装参数。
    expect(getDefaultParams(parameterSchema)).toEqual({
      text: "默认文本",
      color: "#ffffff",
      opacity: 1,
      direction: "left",
      enabled: true,
      position: { x: 0.5, y: 0.5 },
      size: { width: 0.8, height: 0.2 },
    });
  });

  it("支持文本、颜色、数字、单选、开关、位置和尺寸参数", () => {
    const normalized = normalizeParameterValues(parameterSchema, {
      text: "标题",
      color: "#123456",
      opacity: 0.4,
      direction: "right",
      enabled: false,
      position: { x: 0.2, y: 0.7 },
      size: { width: 0.5, height: 0.3 },
    });

    expect(normalized).toEqual({
      text: "标题",
      color: "#123456",
      opacity: 0.4,
      direction: "right",
      enabled: false,
      position: { x: 0.2, y: 0.7 },
      size: { width: 0.5, height: 0.3 },
    });
  });

  it("非法值回退默认值，未知值不会泄漏", () => {
    const normalized = normalizeParameterValues(parameterSchema, {
      text: 123,
      color: "red",
      opacity: 3,
      direction: "diagonal",
      enabled: "yes",
      position: { x: 2, y: 0.2 },
      size: { width: 0.5 },
      unknown: "意外参数",
    });

    expect(normalized).toEqual(getDefaultParams(parameterSchema));
    expect(normalized).not.toHaveProperty("unknown");
  });
});
