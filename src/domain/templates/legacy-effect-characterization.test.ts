import { createHash } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getTemplate, getTemplateDefaultParams } from "./registry";
import { LEGACY_TEMPLATE_CONTRACTS } from "./legacy-effect-baseline";

describe("旧版特效兼容基线", () => {
  it.each(LEGACY_TEMPLATE_CONTRACTS)(
    "保留 $id 的 v$version 公开契约和默认参数",
    (contract) => {
      const template = getTemplate(contract.id, contract.version);

      expect(template).toMatchObject({
        id: contract.id,
        version: contract.version,
        category: contract.category,
        name: contract.name,
        defaultDurationInFrames: contract.defaultDurationInFrames,
      });
      expect(getTemplateDefaultParams(template)).toEqual(contract.defaultParams);
    },
  );

  it.each(LEGACY_TEMPLATE_CONTRACTS)(
    "保留 $id 的固定帧渲染结果",
    (contract) => {
      const template = getTemplate(contract.id, contract.version);
      const render = () => renderToStaticMarkup(template.render(contract.renderProps));

      // 中文注释：指纹固定整棵渲染树，防止新版基座无意改变旧模板的视觉输入或输出。
      const fingerprint = createHash("sha256").update(render()).digest("hex");

      expect(fingerprint).toBe(contract.renderFingerprint);
      expect(render()).toBe(render());
    },
  );
});
