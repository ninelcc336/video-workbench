import { AbsoluteFill } from "remotion";
import { VISUAL_VERIFICATION_FONT_FAMILY } from "../domain/templates/visual-verification";
import {
  getEffectFamily,
} from "../domain/templates/effect-family";
import type { EffectFamilyRenderProps } from "../domain/templates/types";
// 中文注释：固定帧验证页和 Remotion 导出都依赖注册副作用，确保同一份族声明可按 ID 查找。
import "../domain/templates/registry";

export type EffectFrameCompositionProps = {
  renderProps: EffectFamilyRenderProps;
};

/**
 * 中文注释：渲染单个特效族固定帧；输入必须已经由特效族基座归一化，组件不复制参数清洗逻辑。
 * 该容器使用黑色背景模拟无视频素材的固定帧，所有调用方共享相同尺寸和裁切边界。
 */
export function EffectFrame({ renderProps }: EffectFrameCompositionProps) {
  const family = getEffectFamily(renderProps.effectFamilyId, renderProps.effectFamilyVersion);

  return (
    <div
      data-effect-frame="true"
      data-effect-family-id={renderProps.effectFamilyId}
      data-effect-family-version={renderProps.effectFamilyVersion}
      style={{
        backgroundColor: "#000000",
        fontFamily: VISUAL_VERIFICATION_FONT_FAMILY,
        height: "100%",
        overflow: "hidden",
        position: "relative",
        width: "100%",
      }}
    >
      {family.render(renderProps)}
    </div>
  );
}

/** 中文注释：Remotion 固定帧注册的组合只负责提供绝对填充外壳，实际族渲染仍委托给共享组件。 */
export function EffectFrameComposition({ renderProps }: EffectFrameCompositionProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <EffectFrame renderProps={renderProps} />
    </AbsoluteFill>
  );
}
