import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createEffectFamilyInstance, createEffectRenderInput, getEffectFamily } from "../domain/templates/effect-family";
import { EffectFrame, EffectFrameComposition } from "./EffectFrameComposition";

// 中文注释：测试使用当前 v1 族验证固定帧组合不会绕过版本化查找或改写渲染输入。
const family = getEffectFamily("emphasis-card", 1);
const instance = createEffectFamilyInstance(family, "solid-card", "16:9");
const renderProps = createEffectRenderInput({
  familyId: family.id,
  version: family.version,
  startingStyleId: instance.startingStyleId,
  aspectRatio: "16:9",
  frame: 24,
  fps: 30,
  width: 1920,
  height: 1080,
  durationInFrames: instance.durationInFrames,
  params: {
    ...instance.params,
    text: "共享固定帧",
  },
  randomSeed: "visual-test-seed",
}).renderProps;

describe("固定帧共享组合", () => {
  it("Remotion 组合和浏览器容器都消费同一份族渲染输入", () => {
    const browserMarkup = renderToStaticMarkup(<EffectFrame renderProps={renderProps} />);
    const remotionMarkup = renderToStaticMarkup(<EffectFrameComposition renderProps={renderProps} />);

    expect(browserMarkup).toContain("data-effect-frame=\"true\"");
    expect(browserMarkup).toContain("data-template-id=\"emphasis-card\"");
    expect(remotionMarkup).toContain("data-effect-frame=\"true\"");
    expect(remotionMarkup).toContain("共享固定帧");
  });
});
