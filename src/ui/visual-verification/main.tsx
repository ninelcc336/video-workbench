import { createRoot } from "react-dom/client";
import { VISUAL_VERIFICATION_FONT_FAMILY } from "../../domain/templates/visual-verification";
import type { EffectFamilyRenderProps } from "../../domain/templates/types";
import { EffectFrame } from "../../remotion/EffectFrameComposition";

/** 中文注释：验证页只解析 CLI 传入的序列化渲染输入，不在浏览器重新拼装参数矩阵。 */
function readRenderProps(): EffectFamilyRenderProps {
  const serialized = new URLSearchParams(window.location.search).get("renderProps");
  if (!serialized) throw new Error("视觉验证页面缺少 renderProps 参数");
  return JSON.parse(serialized) as EffectFamilyRenderProps;
}

/** 中文注释：为 Playwright 提供稳定的可截图根节点，尺寸直接来自固定帧输入而非视口缩放。 */
function VisualVerificationPage() {
  try {
    const renderProps = readRenderProps();
    return (
      <main
        data-visual-verification-ready="true"
        style={{
          height: renderProps.height,
          margin: 0,
          overflow: "hidden",
          padding: 0,
          width: renderProps.width,
        }}
      >
        <EffectFrame renderProps={renderProps} />
      </main>
    );
  } catch (error) {
    return <p role="alert">{error instanceof Error ? error.message : "视觉验证输入无效"}</p>;
  }
}

document.body.style.margin = "0";
document.body.style.backgroundColor = "#000000";
document.body.style.fontFamily = VISUAL_VERIFICATION_FONT_FAMILY;
createRoot(document.getElementById("visual-verification-root")!).render(<VisualVerificationPage />);
