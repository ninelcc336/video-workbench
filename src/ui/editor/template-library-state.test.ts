// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  getRecentEffectReferences,
  rememberEffectReference,
  TEMPLATE_LIBRARY_RECENT_STORAGE_KEY,
} from "./template-library-state";

afterEach(() => {
  window.localStorage.clear();
});

describe("模板库最近使用记录", () => {
  it("按最近使用顺序去重并限制记录数量", () => {
    for (let index = 0; index < 10; index += 1) {
      rememberEffectReference({
        familyId: `family-${index}`,
        version: 1,
        startingStyleId: "default",
      });
    }

    rememberEffectReference({ familyId: "family-5", version: 1, startingStyleId: "alternate" });

    expect(getRecentEffectReferences()).toEqual([
      { familyId: "family-5", version: 1, startingStyleId: "alternate" },
      { familyId: "family-9", version: 1, startingStyleId: "default" },
      { familyId: "family-8", version: 1, startingStyleId: "default" },
      { familyId: "family-7", version: 1, startingStyleId: "default" },
      { familyId: "family-6", version: 1, startingStyleId: "default" },
      { familyId: "family-4", version: 1, startingStyleId: "default" },
      { familyId: "family-3", version: 1, startingStyleId: "default" },
      { familyId: "family-2", version: 1, startingStyleId: "default" },
    ]);
    expect(window.localStorage.getItem(TEMPLATE_LIBRARY_RECENT_STORAGE_KEY)).toBeTruthy();
  });

  it("忽略损坏的浏览器记录，不影响模板库继续工作", () => {
    window.localStorage.setItem(TEMPLATE_LIBRARY_RECENT_STORAGE_KEY, "不是 JSON");

    expect(getRecentEffectReferences()).toEqual([]);
  });
});
