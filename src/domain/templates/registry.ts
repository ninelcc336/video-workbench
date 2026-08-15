import { BubbleDecoration } from "../../remotion/templates/BubbleDecoration";
import { DirectionalTransition } from "../../remotion/templates/DirectionalTransition";
import { ChecklistSteps } from "../../remotion/templates/ChecklistSteps";
import { HandDrawnEmphasis } from "../../remotion/templates/HandDrawnEmphasis";
import {
  EmphasisCard,
  QuoteComment,
  TagStatus,
  TitleLayer,
} from "../../remotion/templates/InformationFamilies";
import {
  ComparisonConclusion,
  DataNumber,
  LowerThird,
} from "../../remotion/templates/AdditionalInformationFamilies";
import {
  getEffectFamily,
  listEffectFamilies,
  registerEffectFamily,
} from "./effect-family";

/** 中文注释：内置目录只注册当前特效族声明；不存在旧模板注册表、适配器或隐藏版本。 */
registerEffectFamily(BubbleDecoration.definition);
registerEffectFamily(DirectionalTransition.definition);
registerEffectFamily(ChecklistSteps.definition);
registerEffectFamily(HandDrawnEmphasis.definition);
registerEffectFamily(TitleLayer.definition);
registerEffectFamily(EmphasisCard.definition);
registerEffectFamily(QuoteComment.definition);
registerEffectFamily(TagStatus.definition);
registerEffectFamily(LowerThird.definition);
registerEffectFamily(DataNumber.definition);
registerEffectFamily(ComparisonConclusion.definition);

export { getEffectFamily, listEffectFamilies, registerEffectFamily };
