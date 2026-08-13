import { BubbleDecoration } from "../../remotion/templates/BubbleDecoration";
import { CardOverlay } from "../../remotion/templates/CardOverlay";
import { DirectionalTransition } from "../../remotion/templates/DirectionalTransition";
import { ChecklistSteps } from "../../remotion/templates/ChecklistSteps";
import { CommentPanelOverlay } from "../../remotion/templates/CommentPanelOverlay";
import { SectionTitleOverlay } from "../../remotion/templates/SectionTitleOverlay";
import { TagPillsOverlay } from "../../remotion/templates/TagPillsOverlay";
import { HandDrawnEmphasis } from "../../remotion/templates/HandDrawnEmphasis";
import {
  getEffectFamily,
  listEffectFamilies,
  registerEffectFamily,
} from "./effect-family";

/** 中文注释：内置目录只注册当前特效族声明；不存在旧模板注册表、适配器或隐藏版本。 */
registerEffectFamily(CardOverlay.definition);
registerEffectFamily(BubbleDecoration.definition);
registerEffectFamily(DirectionalTransition.definition);
registerEffectFamily(SectionTitleOverlay.definition);
registerEffectFamily(ChecklistSteps.definition);
registerEffectFamily(CommentPanelOverlay.definition);
registerEffectFamily(TagPillsOverlay.definition);
registerEffectFamily(HandDrawnEmphasis.definition);

export { getEffectFamily, listEffectFamilies, registerEffectFamily };
