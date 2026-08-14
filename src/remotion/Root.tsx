import { Composition } from "remotion";
import { createEmptyProject } from "../domain/project/factories";
import type { EffectFamilyRenderProps } from "../domain/templates/types";
import { EffectFrameComposition } from "./EffectFrameComposition";
import { EditorComposition, getCompositionDurationInFrames } from "./EditorComposition";

const emptyProject = createEmptyProject();

// 中文注释：固定帧组合提供可序列化的默认输入，实际验证时由 CLI 注入具体族、样式、画幅和参数。
const emptyEffectRenderProps: EffectFamilyRenderProps = {
  frame: 0,
  fps: 30,
  width: 1920,
  height: 1080,
  durationInFrames: 60,
  params: {},
  effectFamilyId: "emphasis-card",
  effectFamilyVersion: 1,
  startingStyleId: "solid-card",
  aspectRatio: "16:9",
  randomSeed: "effect-visual-verification-v1",
};

// 中文注释：Root 为 Remotion 注册稳定的 Editor composition，实际项目通过 inputProps 注入。
export function Root() {
  return (
    <>
      <Composition
        component={EditorComposition}
        defaultProps={{ project: emptyProject, mediaSources: {} }}
        durationInFrames={getCompositionDurationInFrames(emptyProject)}
        fps={emptyProject.settings.fps}
        height={emptyProject.settings.height}
        id="Editor"
        width={emptyProject.settings.width}
      />
      <Composition
        component={EffectFrameComposition}
        defaultProps={{ renderProps: emptyEffectRenderProps }}
        durationInFrames={emptyEffectRenderProps.durationInFrames}
        fps={emptyEffectRenderProps.fps}
        height={emptyEffectRenderProps.height}
        id="EffectFrame"
        width={emptyEffectRenderProps.width}
      />
    </>
  );
}
