export type BuiltInAssetKind = "font" | "icon" | "decoration";

/** 中文注释：素材台账记录稳定身份和再分发信息，渲染数据不保存绝对路径或远程地址。 */
export type BuiltInAssetDefinition = {
  id: string;
  kind: BuiltInAssetKind;
  filePath: string;
  label: string;
  source: string;
  license: string;
  redistribution: string;
  fontFamilyVariable?: string;
};

/** 中文注释：首阶段只登记仓库内置文件；新增素材必须同步补齐来源和许可证说明。 */
export const BUILT_IN_ASSETS = [
  {
    id: "font.system-sans",
    kind: "font",
    filePath: "effect-assets/fonts/system-sans.css",
    label: "系统无衬线字体栈",
    source: "仓库内置字体栈声明",
    license: "系统字体许可",
    redistribution: "仅再分发字体栈声明文件，实际字体遵循运行平台许可",
    fontFamilyVariable: "--effect-font-system-sans",
  },
  {
    id: "icon.check",
    kind: "icon",
    filePath: "effect-assets/icons/check.svg",
    label: "勾选图标",
    source: "仓库内置 SVG",
    license: "MIT",
    redistribution: "允许随本应用再分发和修改",
  },
  {
    id: "decoration.spark",
    kind: "decoration",
    filePath: "effect-assets/decorations/spark.svg",
    label: "星芒装饰",
    source: "仓库内置 SVG",
    license: "MIT",
    redistribution: "允许随本应用再分发和修改",
  },
] as const satisfies ReadonlyArray<BuiltInAssetDefinition>;

const assetsById = new Map<string, BuiltInAssetDefinition>(
  BUILT_IN_ASSETS.map((asset) => [asset.id, asset]),
);

/** 中文注释：按稳定 ID 读取单个素材；未知 ID 直接失败，避免渲染器静默换用相似资源。 */
export function getBuiltInAsset(id: string): BuiltInAssetDefinition {
  const asset = assetsById.get(id);
  if (!asset) {
    throw new Error(`未找到内置素材：${id}`);
  }

  return asset;
}

/** 中文注释：目录和参数面板按素材类型筛选，不暴露内部 Map 或文件系统细节。 */
export function listBuiltInAssets(kind?: BuiltInAssetKind): BuiltInAssetDefinition[] {
  return BUILT_IN_ASSETS
    .filter((asset) => kind === undefined || asset.kind === kind)
    .map((asset) => ({ ...asset }));
}

/**
 * 中文注释：浏览器预览与 Remotion 组合都使用同一个根相对 URL，文件由 Vite public 目录冻结提供。
 */
export function resolveBuiltInAsset(id: string): BuiltInAssetDefinition & { url: string } {
  const asset = getBuiltInAsset(id);
  return {
    ...asset,
    url: `/${asset.filePath}`,
  };
}

/** 中文注释：字体渲染只从台账读取字体栈，调用方不需要复制平台字体名称。 */
export function getBuiltInFontFamily(id: string): string {
  const asset = getBuiltInAsset(id);
  if (asset.kind !== "font" || !asset.fontFamilyVariable) {
    throw new Error(`内置素材不是可用字体：${id}`);
  }

  return `var(${asset.fontFamilyVariable})`;
}
