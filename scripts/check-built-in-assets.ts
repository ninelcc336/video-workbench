import { assertBuiltInAssets } from "../src/domain/assets/validate-built-in-assets";
import { BUILT_IN_ASSETS } from "../src/domain/assets/built-in-assets";

/** 中文注释：单独的构建前检查让素材许可和本地文件问题在 TypeScript/Vite 之前明确失败。 */
function main(): void {
  assertBuiltInAssets();
  console.log(`内置素材校验通过：${BUILT_IN_ASSETS.length} 项`);
}

main();
