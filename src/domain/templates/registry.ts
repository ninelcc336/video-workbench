import { BubbleDecoration } from "../../remotion/templates/BubbleDecoration";
import { CardOverlay } from "../../remotion/templates/CardOverlay";
import { BasicTransition } from "../../remotion/templates/BasicTransition";
import { ChecklistOverlay } from "../../remotion/templates/ChecklistOverlay";
import { CommentPanelOverlay } from "../../remotion/templates/CommentPanelOverlay";
import { SectionTitleOverlay } from "../../remotion/templates/SectionTitleOverlay";
import { TagPillsOverlay } from "../../remotion/templates/TagPillsOverlay";
import {
  getEffectFamily,
  listEffectFamilies,
  registerEffectFamily,
} from "./effect-family";

/** 中文注释：内置目录只注册当前特效族声明；不存在旧模板注册表、适配器或隐藏版本。 */
registerEffectFamily(CardOverlay.definition);
registerEffectFamily(BubbleDecoration.definition);
registerEffectFamily(BasicTransition.definition);
registerEffectFamily(SectionTitleOverlay.definition);
registerEffectFamily(ChecklistOverlay.definition);
registerEffectFamily(CommentPanelOverlay.definition);
registerEffectFamily(TagPillsOverlay.definition);

export { getEffectFamily, listEffectFamilies, registerEffectFamily };
